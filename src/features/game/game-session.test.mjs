import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, gameReducer, resolveChallenge } from './game-rules.mjs';
import { gameSessionReducer } from './game-session.mjs';

const first = { id: 1, question: 'First question?', answer: 10 };
const second = { id: 2, question: 'Second question?', answer: 20 };
const initial = () => ({ ...createGameState(), selectedQuestion: first });

it('counts accepted guesses once per question and retains that count across reset and selection', () => {
  let state = initial();
  state = gameSessionReducer(state, { type: 'guess', guess: { id: 'invalid', value: 30 }, now: 1 });
  assert.equal(state.playedQuestionIds, undefined, 'Unlocked guesses must not count');
  state = gameSessionReducer(state, { type: 'toggle-lock', now: 1 });
  state = gameSessionReducer(state, { type: 'guess', guess: { id: 'one', value: 30 }, now: 2 });
  state = gameSessionReducer(state, { type: 'reset', now: 3 });
  state = gameSessionReducer(state, { type: 'guess', guess: { id: 'two', value: 40 }, now: 4 });
  assert.deepEqual(state.playedQuestionIds, [1]);
  state = gameSessionReducer(state, { type: 'toggle-lock', now: 5 });
  state = gameSessionReducer(state, { type: 'selection-start', requestId: 'next' });
  state = gameSessionReducer(state, { type: 'selection-complete', requestId: 'next', question: second });
  assert.deepEqual(state.playedQuestionIds, [1], 'Selecting without guessing must not count as played');
  state = gameSessionReducer(state, { type: 'toggle-lock', now: 6 });
  state = gameSessionReducer(state, { type: 'guess', guess: { id: 'three', value: 50 }, now: 7 });
  assert.deepEqual(state.playedQuestionIds, [1, 2]);
});

it('adds presentation metadata without changing challenge resolution or the next round', () => {
  let tracked = initial(), classic = initial();
  const actions = [
    { type: 'toggle-lock', now: 1 },
    { type: 'guess', guess: { id: 'one', value: 30 }, now: 2 },
    { type: 'challenge-start', request: { id: 'check', questionId: 1, questionIndex: 0, guessId: 'one' } },
    { type: 'challenge-complete', requestId: 'check', result: resolveChallenge(30, first) },
    { type: 'selection-start', requestId: 'next' },
    { type: 'selection-complete', requestId: 'next', question: second },
  ];
  for (const action of actions) {
    tracked = gameSessionReducer(tracked, action);
    classic = gameReducer(classic, action);
    const { playedQuestionIds, ...round } = tracked;
    assert.deepEqual(round, classic);
    assert.deepEqual(playedQuestionIds, action === actions[0] ? [] : [1]);
  }
});
