/** @typedef {{ id: string, value: number }} Guess */
/** @typedef {{ id: number, question: string, answer?: string | number, category?: string, unit?: string, difficulty?: string, referenceDate?: string, explanation?: string, 'src-label'?: string, src?: string }} Question */
/** @typedef {'playing' | 'result'} GamePhase */
/** @typedef {{ success: true, guess: number, answer: number, question: Question }} ChallengeResult */
/** @typedef {ChallengeResult | { success: false }} ChallengeOutcome */
/** @typedef {{ id: string, questionId: number, questionIndex: number, guessId: string }} ChallengeRequest */
/** @typedef {{ phase: GamePhase, questionIndex: number, isLocked: boolean, lockedAt: number | null, lastGuessAt: number | null, guesses: Guess[], challenge: ChallengeOutcome | null, challengeRequest: ChallengeRequest | null, roundError: string | null }} GameState */
/** @typedef {{ type: 'toggle-lock' | 'reset', now: number } | { type: 'select-question', index: number, total: number } | { type: 'guess', guess: Guess, now: number } | { type: 'challenge-start', request: ChallengeRequest } | { type: 'challenge-complete', requestId: string, result: ChallengeOutcome } | { type: 'challenge-error', requestId: string } | { type: 'start-next-round', questions: Question[] }} GameAction */

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

/** Availability depends on public round state; the server owns the answer. @param {GameState} state */
export function canChallengeGuess(state) {
  const lastGuess = state.guesses.at(-1);
  return state.phase === 'playing' && state.isLocked && !state.challengeRequest && lastGuess !== undefined && validateGuess(lastGuess.value) === null;
}

/** Equality favors the guess. Snapshot answers only on success. Call only with a validated question. @param {number} guess @param {Question} question @returns {ChallengeOutcome} */
export function resolveChallenge(guess, question) {
  const answer = Number(question.answer);
  return guess > answer
    ? { success: true, guess, answer, question: { ...question } }
    : { success: false };
}

/** @returns {GameState} */
export function createGameState() {
  return { phase: 'playing', questionIndex: 0, isLocked: false, lockedAt: null, lastGuessAt: null, guesses: [], challenge: null, challengeRequest: null, roundError: null };
}

/** Check actions against the latest state, including queued guesses. @param {GameState} state @param {GameAction} action @returns {GameState} */
export function gameReducer(state, action) {
  // A result can only be left by explicitly starting a valid new round.
  if (state.phase === 'result' && action.type !== 'start-next-round') return state;
  switch (action.type) {
    case 'start-next-round': {
      if (state.phase !== 'result') return state;
      const index = (state.questionIndex + 1) % action.questions.length;
      const next = action.questions[index];
      if (!next || !Number.isInteger(next.id) || next.id <= 0 || !next.question?.trim()
        || (next.answer !== undefined && getQuestionAnswer(next) === null)) {
        return { ...state, roundError: 'The next question is unavailable. Please try again.' };
      }
      return { ...createGameState(), questionIndex: index };
    }
    case 'toggle-lock':
      return { ...state, isLocked: !state.isLocked, lockedAt: state.lockedAt ?? action.now, challengeRequest: null, roundError: null };
    case 'select-question':
      if (state.isLocked || !Number.isInteger(action.index) || action.index < 0 || action.index >= action.total || action.index === state.questionIndex) return state;
      return { ...createGameState(), questionIndex: action.index };
    case 'guess': {
      const previous = state.guesses.at(-1)?.value ?? null;
      if (!state.isLocked || validateGuess(action.guess.value, previous)) return state;
      return { ...state, guesses: [...state.guesses, action.guess], lastGuessAt: action.now, challenge: null, challengeRequest: null, roundError: null };
    }
    case 'challenge-start': {
      const lastGuess = state.guesses.at(-1);
      if (!canChallengeGuess(state) || action.request.questionIndex !== state.questionIndex
        || action.request.guessId !== lastGuess?.id) return state;
      return { ...state, challengeRequest: action.request, roundError: null };
    }
    case 'challenge-complete': {
      const request = state.challengeRequest;
      if (!request || request.id !== action.requestId) return state;
      const challenge = action.result;
      if (challenge.success && (!challenge.question || challenge.question.id !== request.questionId
        || challenge.guess !== state.guesses.at(-1)?.value || getQuestionAnswer(challenge.question) !== challenge.answer
        || !Number.isFinite(challenge.answer) || challenge.guess <= challenge.answer)) return state;
      return { ...state, phase: challenge.success ? 'result' : 'playing', challenge, challengeRequest: null, roundError: null };
    }
    case 'challenge-error': {
      if (state.challengeRequest?.id !== action.requestId) return state;
      return { ...state, challengeRequest: null, roundError: 'Unable to check the challenge. Please try again.' };
    }
    case 'reset':
      if (!state.isLocked) return state;
      return { ...state, guesses: [], lockedAt: action.now, lastGuessAt: null, challenge: null, challengeRequest: null, roundError: null };
    default:
      return state;
  }
}
