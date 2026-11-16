import { useI18n } from '../../i18n/LocalizationProvider';
import { useEffect, useReducer, useRef } from 'react';
import { rememberQuestion } from './question-selection.mjs';
import { canChallengeGuess, createGameState, getQuestionAnswer } from './game-rules.mjs';
import { gameSessionReducer } from './game-session.mjs';
import { nextPackQuestion } from '../lab/config.mjs';
import { useGameSessions } from './GameSessions';

/** @param {import('./game-rules.mjs').Question[]} questions
 * @param {import('./question-selection.mjs').QuestionPreferences} preferences */
export default function useGame(questions, preferences, pack = null) {
  const { locale, unitSystem } = useI18n();
  const sessions = useGameSessions();
  const sessionKey = pack?.id ?? 'curated';
  const [state, dispatch] = useReducer(gameSessionReducer, questions[0], question => sessions?.get(sessionKey)?.state ?? ({ ...createGameState(), selectedQuestion: question }));
  const currentQuestion = state.selectedQuestion;
  const selection = useRef(null);
  const recent = useRef(sessions?.get(sessionKey)?.recent ?? (questions[0] ? [questions[0].id] : []));
  useEffect(() => () => selection.current?.controller.abort(), []);
  const lastRequest = useRef(null);
  useEffect(() => {
    sessions?.set(sessionKey, { state: { ...state, challengeRequest: null, selectionRequest: null }, recent: recent.current });
    sessions?.set('lastGame', pack ? `/question-lab/play/${pack.id}` : '/');
  }, [sessions, sessionKey, state, pack]);

  async function challengeGuess() {
    const guess = state.guesses.at(-1);
    if (!currentQuestion || !canChallengeGuess(state) || lastRequest.current === state) return;
    // Suppress duplicate clicks from this render while permitting a new attempt
    // after reset/unlock even if an older request is still finishing.
    lastRequest.current = state;
    const request = { id: crypto.randomUUID(), questionId: currentQuestion.id, questionIndex: state.questionIndex, guessId: guess.id };
    dispatch({ type: 'challenge-start', request });
    try {
      const response = await fetch(pack ? '/api/question-lab' : '/api/challenge', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.id, guess: guess.value,
          ...(!pack && currentQuestion.localization && { localization: { locale, unitSystem: currentQuestion.localization.unitSystem } }),
          ...(pack && { action: 'challenge', id: pack.id }) }), signal: AbortSignal.timeout(15000) });
      const payload = await response.json();
      if (!response.ok || !payload.result || typeof payload.result.success !== 'boolean') throw new Error();
      if (payload.result.success && (payload.result.question?.id !== request.questionId
        || payload.result.guess !== guess.value || getQuestionAnswer(payload.result.question) !== payload.result.answer
        || !Number.isFinite(payload.result.answer) || guess.value <= payload.result.answer)) throw new Error();
      dispatch({ type: 'challenge-complete', requestId: request.id, result: payload.result });
    } catch { dispatch({ type: 'challenge-error', requestId: request.id }); }
    finally { if (lastRequest.current === state) lastRequest.current = null; }
  }

  function cancelSelection() {
    selection.current?.controller.abort();
    selection.current = null;
    dispatch({ type: 'selection-cancel' });
  }

  async function requestQuestion(mode) {
    if (selection.current || (state.phase === 'playing' && state.isLocked)) return;
    const request = { id: crypto.randomUUID(), controller: new AbortController() };
    selection.current = request;
    dispatch({ type: 'selection-start', requestId: request.id });
    if (pack) {
      const question = nextPackQuestion(questions, recent.current, mode);
      if (question) recent.current = [...recent.current, question.id];
      dispatch({ type: 'selection-complete', requestId: request.id, question });
      selection.current = null;
      return;
    }
    const params = new URLSearchParams({ ...preferences, locale, unitSystem, mode,
      after: String(currentQuestion?.id ?? 0), recent: recent.current.join(',') });
    try {
      const response = await fetch('/api/questions?' + params, {
        signal: AbortSignal.any([request.controller.signal, AbortSignal.timeout(15000)]), cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.questions) || payload.questions.length > 1) throw new Error();
      const question = payload.questions[0] ?? null;
      if (question && (!Number.isInteger(question.id) || question.id <= 0 || !question.question?.trim())) throw new Error();
      if (selection.current !== request) return;
      if (question) recent.current = rememberQuestion(recent.current, question.id);
      dispatch({ type: 'selection-complete', requestId: request.id, question });
    } catch {
      if (selection.current === request) dispatch({ type: 'selection-error', requestId: request.id });
    } finally { if (selection.current === request) selection.current = null; }
  }
  return {
    state, currentQuestion, cancelSelection,
    packComplete: Boolean(pack) && state.questionIndex >= questions.length - 1,
    nextQuestion: () => requestQuestion('next'), randomQuestion: () => requestQuestion('random'),
    canChallenge: canChallengeGuess(state),
    toggleLock: () => dispatch({ type: 'toggle-lock', now: performance.now() }),
    resetGuesses: () => dispatch({ type: 'reset', now: performance.now() }),
    submitGuess: value => dispatch({ type: 'guess', guess: { id: crypto.randomUUID(), value }, now: performance.now() }),
    challengeGuess,
    startNextRound: () => { if (state.phase === 'result') return requestQuestion('next'); },
  };
}
