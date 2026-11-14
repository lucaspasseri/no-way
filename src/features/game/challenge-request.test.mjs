import { it } from 'node:test';
import assert from 'node:assert/strict';
import { canChallengeGuess, createGameState, gameReducer } from './game-rules.mjs';

const publicQuestions = [{ id: 1, question: 'How many sides does a hexagon have?' }, { id: 2, question: 'How many sides does a triangle have?' }];
function setup() {
  let state = gameReducer(createGameState(), { type: 'toggle-lock', now: 10 });
  state = gameReducer(state, { type: 'guess', guess: { id: 'guess-1', value: 7 }, now: 20 });
  const request = { id: 'request-1', questionId: 1, questionIndex: 0, guessId: 'guess-1' };
  return { state, request, pending: gameReducer(state, { type: 'challenge-start', request }) };
}
const result = { success: true, guess: 7, answer: 6, question: { ...publicQuestions[0], answer: '6' } };
const complete = state => gameReducer(state, { type: 'challenge-complete', requestId: 'request-1', result });

it('checks challenges without a client answer, prevents duplicate requests, and advances public-only rounds', () => {
  const { state, request, pending } = setup();
  assert.equal(canChallengeGuess(state), true); assert.equal(canChallengeGuess(pending), false);
  assert.equal(gameReducer(pending, { type: 'challenge-start', request }), pending);
  const resolved = complete(pending);
  assert.equal(resolved.phase, 'result'); assert.equal(resolved.challenge.answer, 6);
  assert.equal(gameReducer(resolved, { type: 'start-next-round', questions: publicQuestions }).questionIndex, 1);
});

it('ignores responses after reset, unlock/relock, a later guess, or question selection', () => {
  const { pending } = setup();
  const reset = gameReducer(pending, { type: 'reset', now: 30 });
  const unlocked = gameReducer(pending, { type: 'toggle-lock', now: 30 });
  const relocked = gameReducer(unlocked, { type: 'toggle-lock', now: 40 });
  const selected = gameReducer(unlocked, { type: 'select-question', index: 1, total: 2 });
  const later = gameReducer(pending, { type: 'guess', guess: { id: 'guess-2', value: 8 }, now: 30 });
  for (const changed of [reset, unlocked, relocked, selected, later]) assert.equal(complete(changed), changed);
});

it('ignores mismatched results and old requests; network failures permit retry without losing the round', () => {
  const { pending } = setup();
  assert.equal(gameReducer(pending, { type: 'challenge-complete', requestId: 'old-request', result }), pending);
  for (const patch of [{ guess: 8 }, { answer: 7 }, { question: { id: 2, question: 'Other?', answer: '6' } }]) {
    assert.equal(gameReducer(pending, { type: 'challenge-complete', requestId: 'request-1', result: { ...result, ...patch } }), pending);
  }
  const failed = gameReducer(pending, { type: 'challenge-error', requestId: 'request-1' });
  assert.equal(failed.guesses, pending.guesses); assert.match(failed.roundError, /try again/);
  assert.equal(canChallengeGuess(failed), true);
});
