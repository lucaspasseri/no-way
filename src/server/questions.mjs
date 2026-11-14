import 'server-only';

import { getPool } from '../../db/pool.mjs';
import { validateQuestions } from '../features/game/validate-questions.mjs';
import { delay } from '../lib/delay.mjs';
import { resolveChallenge, validateGuess } from '../features/game/game-rules.mjs';

const questionColumns = `id, question, answer::text AS answer, category, unit, difficulty,
  reference_date::text AS "referenceDate", origin,
  source_label AS "src-label", verification_source_url AS src, answer_context AS explanation`;

function fromRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
}

// One explicit allowlist for the API and Server Component props. Source links and
// explanation can disclose the answer; return them only on a successful challenge.
export function publicQuestion({ id, question, category, unit, difficulty, referenceDate }) {
  return { id, question, ...(category !== undefined && { category }), ...(unit !== undefined && { unit }),
    ...(difficulty !== undefined && { difficulty }), ...(referenceDate !== undefined && { referenceDate }) };
}

/** Retrieve approved questions in stable order for next/random selection.
 * @returns {Promise<import('../features/game/game-rules.mjs').Question[]>}
 */
export async function getQuestions() {
  if (process.env.NODE_ENV === 'development') {
    await delay(1000);
  }

  const { rows } = await getPool().query(`
    SELECT ${questionColumns}
    FROM public.questions WHERE status = $1 ORDER BY id`, ['approved']);
  const questions = fromRows(rows);
  validateQuestions(questions);
  return questions;
}

export async function challengeQuestion(id, guess) {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647 || typeof guess !== 'number' || validateGuess(guess)) {
    throw Object.assign(new Error('Invalid challenge.'), { code: 'INVALID_CHALLENGE' });
  }
  const { rows } = await getPool().query(`SELECT ${questionColumns}
    FROM public.questions WHERE id = $1 AND status = 'approved'`, [id]);
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
