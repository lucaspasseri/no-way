/** @typedef {{ id: string, value: number }} Guess */
/** @typedef {{ id: number, question: string, answer: string, category?: string, 'src-label'?: string, src?: string }} Question */
/** @typedef {{ success: boolean, guess: number, answer: number }} ChallengeResult */
/** @typedef {{ questionIndex: number, isLocked: boolean, lockedAt: number | null, lastGuessAt: number | null, guesses: Guess[], challenge: ChallengeResult | null }} GameState */
/** @typedef {{ type: 'toggle-lock' | 'reset', now: number } | { type: 'select-question', index: number, total: number } | { type: 'guess', guess: Guess, now: number } | { type: 'challenge', answer: number }} GameAction */

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 });

/** Format display values without changing calculations. @param {number} value */
export function formatNumber(value) {
  return numberFormatter.format(value);
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

/** Shared availability rule for both controls and the reducer. @param {GameState} state @param {number} answer */
export function canChallengeGuess(state, answer) {
  const lastGuess = state.guesses.at(-1);
  return state.isLocked && lastGuess !== undefined && validateGuess(lastGuess.value) === null && Number.isFinite(answer);
}

/** Equality favors the guess, as before. @param {number} guess @param {number} answer @returns {ChallengeResult} */
export function resolveChallenge(guess, answer) {
  return { success: guess > answer, guess, answer };
}

/** @returns {GameState} */
export function createGameState() {
  return { questionIndex: 0, isLocked: false, lockedAt: null, lastGuessAt: null, guesses: [], challenge: null };
}

/** Check actions against the latest state, including queued guesses. @param {GameState} state @param {GameAction} action @returns {GameState} */
export function gameReducer(state, action) {
  switch (action.type) {
    case 'toggle-lock':
      return { ...state, isLocked: !state.isLocked, lockedAt: state.lockedAt ?? action.now };
    case 'select-question':
      if (state.isLocked || !Number.isInteger(action.index) || action.index < 0 || action.index >= action.total || action.index === state.questionIndex) return state;
      return { ...createGameState(), questionIndex: action.index };
    case 'guess': {
      const previous = state.guesses.at(-1)?.value ?? null;
      if (!state.isLocked || validateGuess(action.guess.value, previous)) return state;
      return { ...state, guesses: [...state.guesses, action.guess], lastGuessAt: action.now, challenge: null };
    }
    case 'challenge': {
      const lastGuess = state.guesses.at(-1);
      if (!lastGuess || !canChallengeGuess(state, action.answer)) return state;
      if (state.challenge?.guess === lastGuess.value && state.challenge.answer === action.answer) return state;
      return { ...state, challenge: resolveChallenge(lastGuess.value, action.answer) };
    }
    case 'reset':
      if (!state.isLocked) return state;
      return { ...state, guesses: [], lockedAt: action.now, lastGuessAt: null, challenge: null };
    default:
      return state;
  }
}
