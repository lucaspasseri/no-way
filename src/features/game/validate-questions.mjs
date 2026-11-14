import { getQuestionAnswer } from './game-rules.mjs';

/** Validate the existing gameplay contract for both stored and seed questions.
 * @param {import('./game-rules.mjs').Question[]} questions
 */
export function validateQuestions(questions) {
  const ids = new Set();
  const optional = ['category', 'explanation', 'src-label', 'src', 'unit', 'difficulty', 'referenceDate'];
  if (!Array.isArray(questions) || questions.length === 0 || questions.some(question => {
    if (!question || !Number.isInteger(question.id) || question.id <= 0 || ids.has(question.id)
      || getQuestionAnswer(question) === null
      || Number(question.answer) < 0 || Number(question.answer) > Number.MAX_SAFE_INTEGER
      || optional.some(key => question[key] !== undefined && typeof question[key] !== 'string')) return true;
    ids.add(question.id);
    return false;
  })) {
    throw Object.assign(new Error('No valid questions are available.'), { code: 'INVALID_QUESTIONS' });
  }
}
