import { useReducer } from 'react';
import { canChallengeGuess, createGameState, gameReducer, getQuestionAnswer } from './game-rules.mjs';

/** @param {import('./game-rules.mjs').Question[]} questions */
export default function useGame(questions) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState);
  const currentQuestion = questions[state.questionIndex];

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
    canChallenge: canChallengeGuess(state, getQuestionAnswer(currentQuestion)),
    toggleLock: () => dispatch({ type: 'toggle-lock', now: performance.now() }),
    resetGuesses: () => dispatch({ type: 'reset', now: performance.now() }),
    submitGuess: value => dispatch({ type: 'guess', guess: { id: crypto.randomUUID(), value }, now: performance.now() }),
    challengeGuess: () => dispatch({ type: 'challenge', question: currentQuestion, questionIndex: state.questionIndex }),
    startNextRound: () => dispatch({ type: 'start-next-round', questions }),
  };
}
