// Shared by the database seed and the offline SQL exporter.
export const upsertQuestionSQL = `
  INSERT INTO public.questions (id, question, answer, category, source_label, source_url, answer_context, unit, difficulty, reference_date,
    origin, status, verified_at, reviewed_at, reviewed_by, review_notes, verification_source_url)
  VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, $8, $9, $10::date, 'seed', 'approved',
    '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z', 'curated-seed',
    'Curated numerical value, unit, definition, and rounding checked against the cited reference. See answer_context.', $6)
  ON CONFLICT (id) DO UPDATE SET
    question = EXCLUDED.question, answer = EXCLUDED.answer, category = EXCLUDED.category,
    source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
    answer_context = EXCLUDED.answer_context, unit = EXCLUDED.unit, difficulty = EXCLUDED.difficulty,
    verification_source_url = CASE WHEN questions.status = 'approved' THEN EXCLUDED.verification_source_url ELSE questions.verification_source_url END,
    verified_at = CASE WHEN questions.status = 'approved' THEN EXCLUDED.verified_at ELSE questions.verified_at END,
    reviewed_at = CASE WHEN questions.status = 'approved' THEN EXCLUDED.reviewed_at ELSE questions.reviewed_at END,
    reviewed_by = CASE WHEN questions.status = 'approved' THEN EXCLUDED.reviewed_by ELSE questions.reviewed_by END,
    review_notes = CASE WHEN questions.status = 'approved' THEN EXCLUDED.review_notes ELSE questions.review_notes END,
    reference_date = EXCLUDED.reference_date, updated_at = CURRENT_TIMESTAMP
  WHERE questions.origin = 'seed' AND
    (questions.question, questions.answer, questions.category, questions.source_label, questions.source_url, questions.answer_context, questions.unit, questions.difficulty, questions.reference_date)
    IS DISTINCT FROM
    (EXCLUDED.question, EXCLUDED.answer, EXCLUDED.category, EXCLUDED.source_label, EXCLUDED.source_url, EXCLUDED.answer_context, EXCLUDED.unit, EXCLUDED.difficulty, EXCLUDED.reference_date)
  RETURNING id`;

export const syncQuestionSequenceSQL = `SELECT setval(pg_get_serial_sequence('public.questions', 'id'),
  GREATEST((SELECT MAX(id) FROM public.questions), (SELECT last_value FROM public.questions_id_seq)), true)`;

/** @param {import('../src/features/game/game-rules.mjs').Question} question */
export function questionValues(question) {
  return [question.id, question.question, String(question.answer), question.category ?? null,
    question['src-label'] ?? null, question.src ?? null, question.explanation ?? null,
    question.unit ?? null, question.difficulty ?? 'medium', question.referenceDate ?? null];
}
