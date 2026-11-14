// Node-only operator repository. No public routes import this module.
import { candidateSchema, questionError, similarQuestion } from './question-validation.mjs';
import { transitionQuestion, assertStatus } from './question-lifecycle.mjs';

export async function storeCandidates(client, candidates, model, { origin = 'ai' } = {}) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 5
    || typeof model !== 'string' || !model.trim() || model.length > 200 || !['ai', 'manual'].includes(origin)) {
    throw questionError('INVALID_BATCH', 'Provide one to five candidates and a generation model/import label.');
  }
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: existing } = await client.query('SELECT id, question FROM public.questions ORDER BY id');
    const stored = [], failures = [];
    for (const [index, input] of candidates.entries()) {
      const parsed = candidateSchema.safeParse(input);
      if (!parsed.success) { failures.push({ index: index + 1, code: 'INVALID_CANDIDATE' }); continue; }
      const candidate = parsed.data;
      if (existing.some(row => similarQuestion(row.question, candidate.question))) {
        failures.push({ index: index + 1, code: 'DUPLICATE_QUESTION' }); continue;
      }
      const { rows: [row] } = await client.query(`INSERT INTO public.questions
        (question, answer, unit, category, difficulty, answer_context, source_url, reference_date, origin, status, generated_at, generation_model)
        VALUES ($1, $2::numeric, $3, $4, $5, $6, $7, $8::date, $9, 'generated', CURRENT_TIMESTAMP, $10)
        RETURNING id, question, status, origin`, [candidate.question, String(candidate.answer), candidate.unit,
        candidate.category, candidate.difficulty, candidate.explanation, candidate.sourceUrl, candidate.referenceDate, origin, model]);
      stored.push(row); existing.push(row);
    }
    await client.query('COMMIT'); return { stored, failures };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function listQuestions(client, status = 'generated') {
  assertStatus(status, true);
  const { rows } = await client.query(`SELECT id, question, answer::text AS answer, unit, category, difficulty, origin, status,
    curated_id AS "curatedId", answer_context AS explanation, source_url AS src, reference_date::text AS "referenceDate",
    generated_at, generation_model, validated_at, verified_at, reviewed_at, reviewed_by, review_notes, verification_source_url
    FROM public.questions WHERE ($1::text IS NULL OR status = $1) ORDER BY id`, [status === 'all' ? null : status]);
  return rows;
}

export async function reviewQuestion(client, id, target, evidence) {
  assertStatus(target);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw questionError('INVALID_REVIEW', 'Choose a valid database question ID.');
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: [row] } = await client.query(`SELECT *, answer::text AS answer, reference_date::text AS "referenceDate",
      answer_context AS explanation, source_url AS src, curated_id AS "curatedId"
      FROM public.questions WHERE id = $1 FOR UPDATE`, [id]);
    if (!row) throw questionError('QUESTION_UNAVAILABLE', 'Question does not exist.');
    const { rows: existing } = await client.query('SELECT id, question, curated_id AS "curatedId" FROM public.questions ORDER BY id');
    const nextCuratedId = Math.max(0, ...existing.map(other => other.curatedId ?? 0)) + 1;
    const updated = transitionQuestion(row, target, { existing, evidence, nextCuratedId });
    const { rows: [result] } = await client.query(`UPDATE public.questions SET status = $2, curated_id = $3,
      validated_at = CASE WHEN $2 = 'generated' THEN NULL ELSE CURRENT_TIMESTAMP END,
      verified_at = CASE WHEN $2 = 'curated' THEN CURRENT_TIMESTAMP ELSE NULL END,
      reviewed_at = CASE WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
      reviewed_by = $4, review_notes = $5, verification_source_url = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id, status, curated_id AS "curatedId", validated_at, verified_at`,
    [id, target, updated.curatedId ?? null, updated.review?.reviewer ?? evidence?.reviewer ?? null,
      updated.review?.notes ?? evidence?.notes ?? null, updated.review?.sourceUrl ?? null]);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export function parseVerifiedAnswer(value) {
  if (typeof value !== 'string' || !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))
    || Number(value) > Number.MAX_SAFE_INTEGER) throw questionError('INVALID_REVIEW', 'Supply --verified-answer as a finite nonnegative decimal number.');
  return Number(value);
}
