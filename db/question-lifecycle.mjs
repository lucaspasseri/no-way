import { candidateSchema, validateCandidate, reviewSchema, reviewTimestamp, questionError, similarQuestion } from './question-validation.mjs';
import { questionStatuses } from '../src/features/game/question-status.mjs';

export { questionStatuses } from '../src/features/game/question-status.mjs';

export function assertStatus(status, allowAll = false) {
  if (!questionStatuses.includes(status) && !(allowAll && status === 'all')) {
    throw questionError('INVALID_STATUS', 'Use generated, validated, curated, or all for listing/export.');
  }
  return status;
}

export function asCandidate(row) {
  return { question: row.question, answer: typeof row.answer === 'string' && /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(row.answer)
    ? Number(row.answer) : row.answer, unit: row.unit, category: row.category, difficulty: row.difficulty,
  explanation: row.explanation, sourceUrl: row.src ?? null, referenceDate: row.referenceDate ?? null };
}

/** Pure shared lifecycle. Structural validation never supplies factual evidence. */
export function transitionQuestion(row, target, { existing = [], evidence, nextCuratedId, at } = {}) {
  assertStatus(row.status); assertStatus(target);
  if (at !== undefined && !reviewTimestamp.safeParse(at).success) throw questionError('INVALID_REVIEW', 'Invalid review timestamp.');
  const others = existing.filter(other => other !== row && (row.id === undefined || other.id !== row.id));
  const notes = evidence?.notes;
  if ((notes !== undefined && !reviewSchema.shape.notes.safeParse(notes).success)
    || (evidence?.reviewer !== undefined && !reviewSchema.shape.reviewer.safeParse(evidence.reviewer).success)) {
    throw questionError('INVALID_REVIEW', 'Supply valid reviewer text and detailed notes of 20–4000 characters.');
  }
  if (target === 'generated') {
    if (!notes) throw questionError('INVALID_REVIEW', 'Demotion requires detailed revalidation notes.');
    return { ...row, status: target, review: null, validatedAt: null, reviewedAt: null, revalidationNotes: evidence.notes };
  }
  validateCandidate(asCandidate(row), others);
  if (target === 'validated') {
    if (row.status === 'curated' && !notes) {
      throw questionError('INVALID_REVIEW', 'Demotion requires detailed revalidation notes.');
    }
    return { ...row, status: target, review: null, validatedAt: at ?? row.validatedAt, reviewedAt: null,
      ...(evidence?.notes && { revalidationNotes: evidence.notes }) };
  }
  if (row.status !== 'validated') throw questionError('INVALID_TRANSITION', 'Only validated questions can be curated.');
  const parsed = reviewSchema.safeParse(evidence);
  if (!parsed.success) throw questionError('INVALID_REVIEW', 'Curation requires reviewer, detailed quality/factual notes, checked source URL, matching verified answer, and independent verification.');
  if (parsed.data.verifiedAnswer !== asCandidate(row).answer) throw questionError('ANSWER_MISMATCH', 'Verified answer differs from the stored answer. Demote and correct the candidate.');
  const curatedId = row.curatedId ?? nextCuratedId;
  if (!Number.isSafeInteger(curatedId) || curatedId < 1 || curatedId > 2147483647) throw questionError('INVALID_CURATED_ID', 'Supply the next available curated ID.');
  if (others.some(other => other.curatedId === curatedId)) throw questionError('INVALID_CURATED_ID', 'Curated ID is already reserved.');
  return { ...row, status: target, curatedId, review: parsed.data, reviewedAt: at ?? row.reviewedAt };
}

export function validateBank(bank, { sequential = false } = {}) {
  if (!Array.isArray(bank) || !bank.length) throw questionError('INVALID_QUESTIONS', 'No valid questions are available.');
  const ids = new Set(), curatedIds = new Set(), seen = [];
  for (const row of bank) {
    assertStatus(row.status);
    for (const key of ['validatedAt', 'reviewedAt']) {
      if ((row[key] != null || (key === 'validatedAt' && row.status !== 'generated') || (key === 'reviewedAt' && row.status === 'curated'))
        && !reviewTimestamp.safeParse(row[key]).success) throw questionError('INVALID_REVIEW', `Missing or invalid ${key}.`);
    }
    if (!Number.isInteger(row.id) || row.id < 1 || row.id > 2147483647 || ids.has(row.id)) throw questionError('INVALID_QUESTIONS', 'Invalid or duplicate dataset identity.');
    ids.add(row.id);
    if (row.curatedId !== undefined && row.curatedId !== null) {
      if (!Number.isInteger(row.curatedId) || row.curatedId < 1 || row.curatedId > 2147483647 || curatedIds.has(row.curatedId)) throw questionError('INVALID_CURATED_ID', 'Invalid or duplicate curated ID.');
      curatedIds.add(row.curatedId);
    }
    const candidate = asCandidate(row);
    if (!candidateSchema.safeParse(candidate).success) throw questionError('INVALID_CANDIDATE', `Invalid dataset candidate ${row.id}.`);
    if (row['src-label'] != null && (typeof row['src-label'] !== 'string' || row['src-label'].length > 200 || row['src-label'].includes('\0') || !row['src-label'].isWellFormed())) {
      throw questionError('INVALID_CANDIDATE', 'Invalid source label.');
    }
    if (row.revalidationNotes !== undefined && !reviewSchema.shape.notes.safeParse(row.revalidationNotes).success) {
      throw questionError('INVALID_REVIEW', 'Invalid revalidation notes.');
    }
    if (seen.some(other => similarQuestion(row.question, other.question))) throw questionError('DUPLICATE_QUESTION', 'Duplicate or near-duplicate dataset question.');
    if (row.status !== 'generated') validateCandidate(candidate, seen);
    if (row.status === 'curated') {
      transitionQuestion({ ...row, status: 'validated' }, 'curated', { existing: seen, evidence: row.review });
    } else if (row.review != null) throw questionError('INVALID_REVIEW', 'Only curated records may carry active verification evidence.');
    seen.push(row);
  }
  if (sequential) {
    const curated = bank.filter(row => row.status === 'curated').map(row => row.curatedId).sort((a, b) => a - b);
    if (curated.some((id, index) => id !== index + 1)) throw questionError('INVALID_CURATED_ID', 'Final curated bank must have IDs 1..N without gaps.');
  }
  return bank;
}
