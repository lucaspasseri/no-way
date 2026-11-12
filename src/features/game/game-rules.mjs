/** @typedef {{ id: string, value: number }} Guess */
/** @typedef {{ id: number, question: string, answer: string | number, category?: string, explanation?: string, 'src-label'?: string, src?: string }} Question */
/** @typedef {'playing' | 'result'} GamePhase */
/** @typedef {{ success: boolean, guess: number, answer: number, question: Question }} ChallengeResult */
/** @typedef {{ phase: GamePhase, questionIndex: number, isLocked: boolean, lockedAt: number | null, lastGuessAt: number | null, guesses: Guess[], challenge: ChallengeResult | null, roundError: string | null }} GameState */
/** @typedef {{ type: 'toggle-lock' | 'reset', now: number } | { type: 'select-question', index: number, total: number } | { type: 'guess', guess: Guess, now: number } | { type: 'challenge', question: Question, questionIndex: number } | { type: 'start-next-round', questions: Question[] }} GameAction */

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 });

/** Format display values without changing calculations. @param {number} value */
export function formatNumber(value) {
  return numberFormatter.format(value);
}

/** An absent or blank answer must not be coerced to zero. @param {Question | undefined} question */
export function getQuestionAnswer(question) {
  if (!question || typeof question.question !== 'string' || !question.question.trim()) return null;
  if ((typeof question.answer !== 'number' && typeof question.answer !== 'string') || String(question.answer).trim() === '') return null;
  const answer = Number(question.answer);
  return Number.isFinite(answer) ? answer : null;
}

/** Base-ten subtraction keeps decimal differences free of binary floating-point artifacts.
 * @param {number} guess @param {number} answer */
export function getGuessDifference(guess, answer) {
  /** @param {number} value */
  function decimalParts(value) {
    const [mantissa, exponent = '0'] = String(value).split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    return { coefficient: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  }
  const left = decimalParts(guess);
  const right = decimalParts(answer);
  const scale = Math.max(left.scale, right.scale);
  const difference = left.coefficient * 10n ** BigInt(scale - left.scale)
    - right.coefficient * 10n ** BigInt(scale - right.scale);
  return Number(`${difference < 0n ? -difference : difference}e${-scale}`);
}

/** @param {string | number} input @param {number | null} previous */
export function validateGuess(input, previous = null) {
  if (String(input).trim() === '') return 'Enter a number to place your guess.';
  const value = Number(input);
  if (!Number.isFinite(value)) return 'Enter a finite number.';
  if (value < 0) return 'Your guess must be zero or higher.';
  if (previous !== null && value <= previous) {
    return 'Your guess must be higher than ' + formatNumber(previous) + '.';
  }
  return null;
}

/** Shared availability rule for both controls and the reducer. @param {GameState} state @param {number | null} answer */
export function canChallengeGuess(state, answer) {
  const lastGuess = state.guesses.at(-1);
  return state.phase === 'playing' && state.isLocked && lastGuess !== undefined && validateGuess(lastGuess.value) === null && Number.isFinite(answer);
}

/** Equality favors the guess. Call only with a validated question. @param {number} guess @param {Question} question @returns {ChallengeResult} */
export function resolveChallenge(guess, question) {
  const answer = Number(question.answer);
  return { success: guess > answer, guess, answer, question: { ...question } };
}

/** @returns {GameState} */
export function createGameState() {
  return { phase: 'playing', questionIndex: 0, isLocked: false, lockedAt: null, lastGuessAt: null, guesses: [], challenge: null, roundError: null };
}

/** Check actions against the latest state, including queued guesses. @param {GameState} state @param {GameAction} action @returns {GameState} */
export function gameReducer(state, action) {
  // A result can only be left by explicitly starting a valid new round.
  if (state.phase === 'result' && action.type !== 'start-next-round') return state;
  switch (action.type) {
    case 'start-next-round': {
      if (state.phase !== 'result') return state;
      const index = (state.questionIndex + 1) % action.questions.length;
      if (getQuestionAnswer(action.questions[index]) === null) {
        return { ...state, roundError: 'The next question is unavailable. Please try again.' };
      }
      return { ...createGameState(), questionIndex: index };
    }
    case 'toggle-lock':
      return { ...state, isLocked: !state.isLocked, lockedAt: state.lockedAt ?? action.now };
    case 'select-question':
      if (state.isLocked || !Number.isInteger(action.index) || action.index < 0 || action.index >= action.total || action.index === state.questionIndex) return state;
      return { ...createGameState(), questionIndex: action.index };
    case 'guess': {
      const previous = state.guesses.at(-1)?.value ?? null;
      if (!state.isLocked || validateGuess(action.guess.value, previous)) return state;
      return { ...state, guesses: [...state.guesses, action.guess], lastGuessAt: action.now };
    }
    case 'challenge': {
      const lastGuess = state.guesses.at(-1);
      const answer = getQuestionAnswer(action.question);
      if (action.questionIndex !== state.questionIndex || answer === null || !lastGuess || !canChallengeGuess(state, answer)) return state;
      return { ...state, phase: 'result', challenge: resolveChallenge(lastGuess.value, action.question) };
    }
    case 'reset':
      if (!state.isLocked) return state;
      return { ...state, guesses: [], lockedAt: action.now, lastGuessAt: null, challenge: null };
    default:
      return state;
  }
}
