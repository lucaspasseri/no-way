import 'server-only';

import questions from '../data/questions.json' with { type: 'json' };
import { getQuestionAnswer } from '../features/game/game-rules.mjs';
import { delay } from '../lib/delay.mjs';

/** Retrieve the question bank without changing its IDs or answer representation.
 * Replace the JSON source here when adding a database or generated questions.
 * @returns {Promise<import('../features/game/game-rules.mjs').Question[]>}
 */
export async function getQuestions() {
  if (process.env.NODE_ENV === 'development') {
    await delay(1000);
  }

  const ids = new Set();
  if (!Array.isArray(questions) || questions.length === 0 || questions.some(question => {
    if (!question || !Number.isInteger(question.id) || ids.has(question.id) || getQuestionAnswer(question) === null) return true;
    ids.add(question.id);
    return false;
  })) {
    throw new Error('The question bank is empty or invalid.');
  }

  // Keep callers from mutating the imported bank shared by subsequent requests.
  return questions.map(question => ({ ...question }));
}
