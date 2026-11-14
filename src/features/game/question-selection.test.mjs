import { it } from 'node:test';
import assert from 'node:assert/strict';
import { matchingCount, restorePreferences, rememberQuestion, metadataLabel } from './question-selection.mjs';
import { createGameState, gameReducer } from './game-rules.mjs';

const options = { categories: ['science', 'nature'], difficulties: ['easy', 'medium', 'hard'], pools: [
  { category: 'science', difficulty: 'easy', count: 2 }, { category: 'nature', difficulty: 'hard', count: 3 },
  { category: null, difficulty: null, count: 1 },
] };
const current = { id: 5, question: 'How many?' };
const next = { id: 9, question: 'How far?', category: 'science', difficulty: 'easy' };
const initial = () => ({ ...createGameState(), selectedQuestion: current });
const start = state => gameReducer(state, { type: 'selection-start', requestId: 'new' });
const complete = (state, question = next, requestId = 'new') => gameReducer(state, { type: 'selection-complete', question, requestId });

it('counts all, category, difficulty, combined and empty pools including legacy unfiltered records', () => {
  assert.equal(matchingCount(options, {}), 6);
  assert.equal(matchingCount(options, { category: 'science' }), 2);
  assert.equal(matchingCount(options, { difficulty: 'hard' }), 3);
  assert.equal(matchingCount(options, { category: 'nature', difficulty: 'hard' }), 3);
  assert.equal(matchingCount(options, { category: 'science', difficulty: 'hard' }), 0);
});
it('restores valid preferences and safely defaults stale categories, invalid difficulty and corrupt storage', () => {
  assert.deepEqual(restorePreferences('{"category":"science","difficulty":"easy"}', options), { category: 'science', difficulty: 'easy' });
  assert.deepEqual(restorePreferences('{"category":"removed","difficulty":"extreme"}', options), { category: '', difficulty: '' });
  for (const value of [null, '', 'bad json', 'null', '[]']) assert.deepEqual(restorePreferences(value, options), { category: '', difficulty: '' });
  assert.equal(metadataLabel('human-body'), 'Human Body');
});
it('keeps lightweight, unique recent IDs independently of curated numbering or play order', () => {
  assert.deepEqual(rememberQuestion([9, 2, 5], 2), [9, 5, 2]);
  assert.equal(rememberQuestion(Array.from({ length: 200 }, (_, i) => i + 1), 201).length, 200);
});
it('changing preferences leaves locked and unlocked active rounds intact', () => {
  for (const isLocked of [true, false]) {
    const state = { ...initial(), isLocked, guesses: [{ id: 'guess', value: 10 }], lockedAt: 1 };
    const changed = gameReducer(state, { type: 'selection-cancel' });
    assert.equal(changed.selectedQuestion, state.selectedQuestion);
    assert.equal(changed.guesses, state.guesses);
    assert.equal(changed.lockedAt, 1);
    assert.equal(changed.isLocked, isLocked);
    if (isLocked) assert.equal(start(state), state);
  }
});
it('suppresses duplicate requests and resets guesses and timers only on explicit successful replacement', () => {
  const state = { ...initial(), guesses: [{ id: 'guess', value: 10 }], lockedAt: 1 };
  const loading = start(state);
  assert.equal(start(loading), loading);
  assert.equal(loading.guesses, state.guesses);
  assert.deepEqual(complete(loading), { ...createGameState(), selectedQuestion: next, questionIndex: 1 });
});
it('keeps current guesses on same-question fallback, empty pool and request failure', () => {
  const state = { ...initial(), guesses: [{ id: 'guess', value: 10 }], lockedAt: 1 };
  for (const result of [complete(start(state), current), complete(start(state), null), gameReducer(start(state), { type: 'selection-error', requestId: 'new' })]) {
    assert.equal(result.selectedQuestion, current);
    assert.equal(result.guesses, state.guesses);
    assert.equal(result.lockedAt, 1);
    assert.equal(result.selectionRequest, null);
    assert.ok(result.selectionError);
  }
});
it('ignores stale responses after filter changes and permits a fresh request', () => {
  const loading = start(initial());
  const changed = gameReducer(loading, { type: 'selection-cancel' });
  assert.equal(complete(changed), changed);
  const newer = gameReducer(changed, { type: 'selection-start', requestId: 'newer' });
  assert.equal(complete(newer), newer);
  assert.equal(complete(newer, next, 'newer').selectedQuestion, next);
});
it('keeps completed results during empty/error responses and starts a filtered next round on success', () => {
  const result = { ...initial(), phase: 'result', isLocked: true, challenge: { success: true, guess: 2, answer: 1, question: current } };
  const empty = complete(start(result), null);
  assert.equal(empty.phase, 'result'); assert.equal(empty.challenge, result.challenge);
  const replay = complete(start(empty), current);
  assert.equal(replay.phase, 'playing'); assert.deepEqual(replay.guesses, []); assert.equal(replay.isLocked, false);
});
