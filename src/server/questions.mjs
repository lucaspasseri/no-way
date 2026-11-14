import 'server-only';

import { getPool } from '../../db/pool.mjs';
import { validateQuestions } from '../features/game/validate-questions.mjs';
import { delay } from '../lib/delay.mjs';

/** Retrieve verified questions in stable order for next/random selection.
 * @returns {Promise<import('../features/game/game-rules.mjs').Question[]>}
 */
export async function getQuestions() {
  if (process.env.NODE_ENV === 'development') {
    await delay(1000);
  }

  const { rows } = await getPool().query(`
    SELECT id, question, answer::text AS answer, category,
      source_label AS "src-label", source_url AS src, answer_context AS explanation
    FROM public.questions WHERE status = $1 ORDER BY id`, ['verified']);
  const questions = rows.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
  validateQuestions(questions);
  return questions;
}
