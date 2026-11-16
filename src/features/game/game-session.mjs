import { gameReducer } from './game-rules.mjs';

// Session-only presentation metadata. Keep round resolution in gameReducer.
// Count questions with accepted guesses, including a reset/revisit only once.
/**
 * @param {import('./game-rules.mjs').GameState & { playedQuestionIds?: number[] }} state
 * @param {import('./game-rules.mjs').GameAction} action
 */
export function gameSessionReducer(state, action) {
  const next = gameReducer(state, action);
  if (next === state) return state;
  const played = state.playedQuestionIds ?? [];
  const id = state.selectedQuestion?.id;
  const acceptedGuess = action.type === 'guess' && next.guesses.length > state.guesses.length;
  return { ...next, playedQuestionIds: acceptedGuess && id != null && !played.includes(id) ? [...played, id] : played };
}
