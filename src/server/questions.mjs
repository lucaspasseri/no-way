import 'server-only';

import { difficulties } from '../../db/question-validation.mjs';
import { selectionSchema } from '../features/game/question-selection.mjs';
import { getPool } from '../../db/pool.mjs';
import { validateQuestions } from '../features/game/validate-questions.mjs';
import { delay } from '../lib/delay.mjs';
import { resolveChallenge, validateGuess } from '../features/game/game-rules.mjs';

// Only curated questions are playable; players cannot change this rule.
const gameplayStatus = 'curated';
const gameplayEligibility = `status = '${gameplayStatus}'`;

const questionColumns = `id, question, answer::text AS answer, category, unit, difficulty,
  reference_date::text AS "referenceDate", origin, status, curated_id AS "curatedId",
  source_label AS "src-label", verification_source_url AS src, answer_context AS explanation`;

function fromRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
}

// One explicit allowlist for the API and Server Component props. Source links and
// explanation can disclose the answer; return them only on a successful challenge.
export function publicQuestion({ id, question, category, unit, difficulty, referenceDate, curatedId }) {
  return { id, question, ...(curatedId !== undefined && { curatedId }), ...(category !== undefined && { category }), ...(unit !== undefined && { unit }),
    ...(difficulty !== undefined && { difficulty }), ...(referenceDate !== undefined && { referenceDate }) };
}

/** Bulk curated retrieval for database compatibility checks. Gameplay selects one row.
 * @returns {Promise<import('../features/game/game-rules.mjs').Question[]>}
 */
export async function getQuestions() {
  if (process.env.NODE_ENV === 'development') {
    await delay(1000);
  }

  const { rows } = await getPool().query(`
    SELECT ${questionColumns}
    FROM public.questions WHERE status = $1 ORDER BY id`, [gameplayStatus]);
  const questions = fromRows(rows);
  validateQuestions(questions);
  return questions;
}

export async function challengeQuestion(id, guess) {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647 || typeof guess !== 'number' || validateGuess(guess)) {
    throw Object.assign(new Error('Invalid challenge.'), { code: 'INVALID_CHALLENGE' });
  }
  const { rows } = await getPool().query(`SELECT ${questionColumns}
    FROM public.questions WHERE id = $1 AND ${gameplayEligibility}`, [id]);
  const [question] = fromRows(rows);
  if (!question) throw Object.assign(new Error('Question unavailable.'), { code: 'QUESTION_UNAVAILABLE' });
  validateQuestions([question]);
  // Internal origin stays in the repository; reveal only result and reference metadata.
  const resultQuestion = { ...publicQuestion(question), answer: question.answer,
    ...(question.src !== undefined && { src: question.src }),
    ...(question['src-label'] !== undefined && { 'src-label': question['src-label'] }),
    ...(question.explanation !== undefined && { explanation: question.explanation }) };
  return resolveChallenge(guess, resultQuestion);
}

/** @returns {Promise<import('../features/game/question-selection.mjs').QuestionOptions>} */
export async function getQuestionOptions() {
  const { rows } = await getPool().query(`SELECT category, difficulty, count(*)::integer AS count
    FROM public.questions WHERE ${gameplayEligibility} GROUP BY category, difficulty ORDER BY category, difficulty`);
  return { categories: [...new Set(rows.map(row => row.category).filter(Boolean))], difficulties,
    pools: rows, total: rows.reduce((total, row) => total + row.count, 0) };
}

/** Select one question on the server. Empty and exhausted pools are ordinary outcomes. */
export async function selectQuestion(input = {}) {
  const { mode, category, difficulty, after, recent } = selectionSchema.parse(input);
  if (process.env.NODE_ENV === 'development') await delay(1000);
  const order = mode === 'random'
    ? 'CASE WHEN id = $3 THEN 1 ELSE 0 END, CASE WHEN id = ANY($4::integer[]) THEN 1 ELSE 0 END, random()'
    : 'CASE WHEN id > $3 THEN 0 ELSE 1 END, id';
  const { rows } = await getPool().query(`SELECT ${questionColumns}
    FROM public.questions WHERE ${gameplayEligibility}
      AND ($1::text IS NULL OR category = $1) AND ($2::text IS NULL OR difficulty = $2)
    ORDER BY ${order} LIMIT 1`, [category || null, difficulty || null, after, ...(mode === 'random' ? [recent] : [])]);
  if (!rows.length) return null;
  const [question] = fromRows(rows);
  validateQuestions([question]);
  return publicQuestion(question);
}
