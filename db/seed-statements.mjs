// Shared by the database seed and the offline SQL exporter.
export const upsertQuestionSQL = `
  INSERT INTO public.questions (id, question, answer, category, source_label, source_url, answer_context, origin, status)
  VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, 'seed', 'verified')
  ON CONFLICT (id) DO UPDATE SET
    question = EXCLUDED.question, answer = EXCLUDED.answer, category = EXCLUDED.category,
    source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
    answer_context = EXCLUDED.answer_context, updated_at = CURRENT_TIMESTAMP
  WHERE questions.origin = 'seed' AND
    (questions.question, questions.answer, questions.category, questions.source_label, questions.source_url, questions.answer_context)
    IS DISTINCT FROM
    (EXCLUDED.question, EXCLUDED.answer, EXCLUDED.category, EXCLUDED.source_label, EXCLUDED.source_url, EXCLUDED.answer_context)
  RETURNING id`;

export const syncQuestionSequenceSQL = `SELECT setval(pg_get_serial_sequence('public.questions', 'id'),
  GREATEST((SELECT MAX(id) FROM public.questions), (SELECT last_value FROM public.questions_id_seq)), true)`;

/** @param {import('../src/features/game/game-rules.mjs').Question} question */
export function questionValues(question) {
  return [question.id, question.question, String(question.answer), question.category ?? null,
    question['src-label'] ?? null, question.src ?? null, question.explanation ?? null];
}
