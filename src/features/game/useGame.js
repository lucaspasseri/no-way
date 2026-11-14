import { useReducer, useRef } from 'react';
import { canChallengeGuess, createGameState, gameReducer, getQuestionAnswer } from './game-rules.mjs';

/** @param {import('./game-rules.mjs').Question[]} questions */
export default function useGame(questions) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState);
  const currentQuestion = questions[state.questionIndex];
  const lastRequest = useRef(null);

  async function challengeGuess() {
    const guess = state.guesses.at(-1);
    if (!currentQuestion || !canChallengeGuess(state) || lastRequest.current === state) return;
    // Suppress duplicate clicks from this render while permitting a new attempt
    // after reset/unlock even if an older request is still finishing.
    lastRequest.current = state;
    const request = { id: crypto.randomUUID(), questionId: currentQuestion.id, questionIndex: state.questionIndex, guessId: guess.id };
    dispatch({ type: 'challenge-start', request });
    try {
      const response = await fetch('/api/challenge', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.id, guess: guess.value }), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok || !payload.result || typeof payload.result.success !== 'boolean') throw new Error();
      if (payload.result.success && (payload.result.question?.id !== request.questionId
        || payload.result.guess !== guess.value || getQuestionAnswer(payload.result.question) !== payload.result.answer
        || !Number.isFinite(payload.result.answer) || guess.value <= payload.result.answer)) throw new Error();
      dispatch({ type: 'challenge-complete', requestId: request.id, result: payload.result });
    } catch { dispatch({ type: 'challenge-error', requestId: request.id }); }
    finally { if (lastRequest.current === state) lastRequest.current = null; }
  }

  function selectQuestion(index) {
    dispatch({ type: 'select-question', index, total: questions.length });
  }
  function nextQuestion() {
    selectQuestion((state.questionIndex + 1) % questions.length);
  }
  function randomQuestion() {
    if (questions.length < 2) return;
    const offset = 1 + Math.floor(Math.random() * (questions.length - 1));
    selectQuestion((state.questionIndex + offset) % questions.length);
  }
  return {
    state, currentQuestion, nextQuestion, randomQuestion,
    canChallenge: canChallengeGuess(state),
    toggleLock: () => dispatch({ type: 'toggle-lock', now: performance.now() }),
    resetGuesses: () => dispatch({ type: 'reset', now: performance.now() }),
    submitGuess: value => dispatch({ type: 'guess', guess: { id: crypto.randomUUID(), value }, now: performance.now() }),
    challengeGuess,
    startNextRound: () => dispatch({ type: 'start-next-round', questions }),
  };
}
