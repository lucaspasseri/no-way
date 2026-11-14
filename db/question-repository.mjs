// Node-only operator repository. No public routes import this module.
import { validateCandidate, reviewSchema, questionError } from './question-validation.mjs';
import { z } from 'zod';

export async function storeCandidates(client, candidates, model) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 5
    || typeof model !== 'string' || !model.trim() || model.length > 200) {
    throw questionError('INVALID_BATCH', 'Provide one to five candidates and a generation model.');
  }
  await client.query('BEGIN');
  try {
    // Matches the seed lock: serialize the duplicate check and writes across operators.
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: existing } = await client.query('SELECT id, question FROM public.questions ORDER BY id');
    const stored = [], failures = [];
    for (const [index, input] of candidates.entries()) {
      let candidate;
      try { candidate = validateCandidate(input, existing); }
      catch (error) {
        failures.push({ index: index + 1, code: error.code, message: error.message });
        continue;
      }
      const { rows: [row] } = await client.query(`INSERT INTO public.questions
        (question, answer, unit, category, difficulty, answer_context, source_url, reference_date, origin, status, generated_at, generation_model)
        VALUES ($1, $2::numeric, $3, $4, $5, $6, $7, $8::date, 'ai', 'pending', CURRENT_TIMESTAMP, $9)
        RETURNING id, question, status, origin`, [candidate.question, String(candidate.answer), candidate.unit,
        candidate.category, candidate.difficulty, candidate.explanation, candidate.sourceUrl, candidate.referenceDate, model]);
      stored.push(row);
      existing.push(row);
    }
    await client.query('COMMIT');
    return { stored, failures };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function listQuestions(client, status = 'pending') {
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) throw questionError('INVALID_STATUS', 'Use pending, approved, rejected, or all.');
  const { rows } = await client.query(`SELECT id, question, answer::text AS answer, unit, category, difficulty, origin, status,
    answer_context AS explanation, source_url AS "suggestedSourceUrl", reference_date::text AS "referenceDate",
    generated_at, generation_model, verified_at, reviewed_at, reviewed_by, review_notes, verification_source_url
    FROM public.questions WHERE ($1::text IS NULL OR status = $1) ORDER BY id`, [status === 'all' ? null : status]);
  return rows;
}

export async function reviewQuestion(client, id, decision, evidence) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !['approved', 'rejected'].includes(decision)) {
    throw questionError('INVALID_REVIEW', 'Choose a valid question ID and approved or rejected decision.');
  }
  const schema = decision === 'approved' ? reviewSchema : reviewSchema.pick({ reviewer: true, notes: true });
  const parsed = schema.safeParse(evidence);
  if (!parsed.success) throw questionError('INVALID_REVIEW', 'Review requires a reviewer and detailed notes. Approval also requires an independently verified numerical answer, evidence URL, and explicit independent-verification confirmation.');
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: [row] } = await client.query('SELECT *, reference_date::text AS reference_date FROM public.questions WHERE id = $1 FOR UPDATE', [id]);
    if (!row || row.status !== 'pending') throw questionError('NOT_PENDING', 'Only an existing pending question can be approved or rejected.');
    const review = parsed.data;
    if (decision === 'approved') {
      const { rows: existing } = await client.query('SELECT id, question FROM public.questions WHERE id <> $1 ORDER BY id', [id]);
      validateCandidate({ question: row.question, answer: Number(row.answer), unit: row.unit,
        category: row.category, difficulty: row.difficulty, explanation: row.answer_context,
        sourceUrl: row.source_url, referenceDate: row.reference_date instanceof Date
          ? row.reference_date.toISOString().slice(0, 10) : row.reference_date }, existing);
      if (review.verifiedAnswer !== Number(row.answer)) {
        throw questionError('ANSWER_MISMATCH', 'The independently verified answer differs. Reject this candidate; it cannot be approved with a differing answer.');
      }
    }
    const { rows: [updated] } = await client.query(`UPDATE public.questions SET status = $2,
      reviewed_by = $3, review_notes = $4, verification_source_url = $5,
      reviewed_at = CURRENT_TIMESTAMP, verified_at = CASE WHEN $2 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' RETURNING id, status, verified_at`,
    [id, decision, review.reviewer, review.notes, review.sourceUrl ?? null]);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// Operator-provided numeric strings must use decimal syntax, not coercion of blanks/hex.
export function parseVerifiedAnswer(value) {
  if (typeof value !== 'string' || !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    throw questionError('INVALID_REVIEW', 'Supply --verified-answer as a nonnegative decimal number.');
  }
  return z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).parse(Number(value));
}
