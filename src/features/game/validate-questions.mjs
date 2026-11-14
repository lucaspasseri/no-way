import { getQuestionAnswer } from './game-rules.mjs';

/** Validate the existing gameplay contract for both stored and seed questions.
 * @param {import('./game-rules.mjs').Question[]} questions
 */
export function validateQuestions(questions) {
  const ids = new Set();
  /** @type {Array<'category' | 'explanation' | 'src-label' | 'src'>} */
  const optional = ['category', 'explanation', 'src-label', 'src'];
  if (!Array.isArray(questions) || questions.length === 0 || questions.some(question => {
    if (!question || !Number.isInteger(question.id) || question.id <= 0 || ids.has(question.id)
      || getQuestionAnswer(question) === null
      || optional.some(key => question[key] !== undefined && typeof question[key] !== 'string')) return true;
    ids.add(question.id);
    return false;
  })) {
    throw Object.assign(new Error('No valid questions are available.'), { code: 'INVALID_QUESTIONS' });
  }
}
