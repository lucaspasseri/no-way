import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canChallengeGuess, createGameState, gameReducer, validateGuess, formatNumber, resolveChallenge } from './game-rules.mjs';

const lock = state => gameReducer(state, { type: 'toggle-lock', now: 1000 });
const submit = (state, value, now = 2000) => gameReducer(state, { type: 'guess', guess: { id: String(now), value }, now });
const challenge = (state, answer) => gameReducer(state, { type: 'challenge', answer });

describe('guess validation', () => {
  it('rejects empty, nonnumeric and nonfinite values', () => {
    for (const value of ['', '  ', 'abc', NaN, Infinity, -Infinity]) {
      assert.ok(validateGuess(value), String(value));
    }
  });
  it('accepts zero as the first guess and permits decimal values', () => {
    assert.equal(validateGuess('0'), null);
    assert.equal(validateGuess('149.6', 149.5), null);
  });
  it('rejects negative, equal and lower guesses, including a previous zero', () => {
    assert.ok(validateGuess(-1));
    assert.ok(validateGuess(0, 0));
    assert.ok(validateGuess(100, 100));
    assert.ok(validateGuess(99, 100));
  });
  it('formats numbers for display without rounding away answer precision', () => {
    assert.equal(formatNumber(10000), '10,000');
    assert.equal(formatNumber(149.6), '149.6');
    assert.equal(formatNumber(0.0001), '0.0001');
  });
});

describe('game state transitions', () => {
  it('starts unlocked with no fabricated guesses or timer', () => {
    assert.deepEqual(createGameState(), { questionIndex: 0, isLocked: false, lockedAt: null, lastGuessAt: null, guesses: [], challenge: null });
  });
  it('ignores guess and reset actions before locking', () => {
    const state = createGameState();
    assert.equal(submit(state, 100), state);
    assert.equal(gameReducer(state, { type: 'reset', now: 50 }), state);
  });
  it('keeps the first lock timestamp and guesses across unlock/relock', () => {
    const state = submit(lock(createGameState()), 100);
    const unlocked = gameReducer(state, { type: 'toggle-lock', now: 5000 });
    assert.equal(unlocked.isLocked, false);
    assert.equal(unlocked.lockedAt, 1000);
    assert.equal(submit(unlocked, 200), unlocked);
    assert.deepEqual(lock(unlocked).guesses, state.guesses);
    assert.equal(lock(unlocked).lockedAt, 1000);
  });
  it('validates sequential queued guesses against the latest state', () => {
    const first = submit(lock(createGameState()), 100);
    assert.equal(submit(first, 100), first);
    assert.equal(submit(first, 90), first);
    assert.equal(submit(first, Infinity), first);
    const second = submit(first, 100.5, 3000);
    assert.deepEqual(second.guesses.map(guess => guess.value), [100, 100.5]);
    assert.equal(second.lastGuessAt, 3000);
    assert.equal(first.guesses.length, 1);
  });
  it('resets guesses and timers together while keeping the question locked', () => {
    const state = submit(lock(createGameState()), 200);
    const reset = gameReducer(state, { type: 'reset', now: 5000 });
    assert.deepEqual(reset, { ...createGameState(), isLocked: true, lockedAt: 5000 });
  });
  it('prevents question changes while locked', () => {
    const state = lock(createGameState());
    assert.equal(gameReducer(state, { type: 'select-question', index: 1, total: 13 }), state);
  });
  it('clears round state when selecting a different unlocked question', () => {
    const state = lock(submit(lock(createGameState()), 200));
    const next = gameReducer(state, { type: 'select-question', index: 1, total: 13 });
    assert.deepEqual(next, { ...createGameState(), questionIndex: 1 });
  });
  it('rejects invalid selections and preserves state when reselecting the current question', () => {
    const state = createGameState();
    for (const index of [-1, 0, 13, NaN, 1.5]) {
      assert.equal(gameReducer(state, { type: 'select-question', index, total: 13 }), state);
    }
  });
  it('reset preserves a selected question, clears its reveal, and restarts timers', () => {
    const selected = gameReducer(createGameState(), { type: 'select-question', index: 3, total: 13 });
    const state = challenge(submit(lock(selected), 200), 58);
    const reset = gameReducer(state, { type: 'reset', now: 5000 });
    assert.deepEqual(reset, { ...createGameState(), questionIndex: 3, isLocked: true, lockedAt: 5000 });
  });
});

describe('shared challenge behavior', () => {
  it('is unavailable without a locked question and a valid latest guess', () => {
    const initial = createGameState();
    assert.equal(canChallengeGuess(initial, 149.6), false);
    assert.equal(challenge(initial, 149.6), initial);
    const locked = lock(initial);
    assert.equal(canChallengeGuess(locked, 149.6), false);
    assert.equal(challenge(locked, 149.6), locked);
    const guessed = submit(locked, 100);
    const unlocked = lock(guessed);
    assert.equal(canChallengeGuess(unlocked, 149.6), false);
    assert.equal(challenge(unlocked, 149.6), unlocked);
    assert.equal(canChallengeGuess(guessed, 149.6), true);
  });
  it('rejects invalid answers or invalid latest values', () => {
    const state = submit(lock(createGameState()), 100);
    for (const answer of [NaN, Infinity, -Infinity]) {
      assert.equal(canChallengeGuess(state, answer), false);
      assert.equal(challenge(state, answer), state);
    }
    for (const value of [NaN, Infinity, -1]) {
      const invalid = { ...state, guesses: [{ id: 'invalid', value }] };
      assert.equal(canChallengeGuess(invalid, 149.6), false);
      assert.equal(challenge(invalid, 149.6), invalid);
    }
  });
  it('succeeds only when the latest guess is greater than the answer', () => {
    assert.equal(resolveChallenge(149.7, 149.6).success, true);
    assert.equal(resolveChallenge(149.6, 149.6).success, false);
    assert.equal(resolveChallenge(149.5, 149.6).success, false);
  });
  it('reveals the answer without changing guesses, locking, or timers', () => {
    const first = submit(lock(createGameState()), 100);
    const state = submit(first, 200, 3000);
    const result = challenge(state, 149.6);
    assert.deepEqual(result.challenge, { success: true, guess: 200, answer: 149.6 });
    assert.equal(result.guesses, state.guesses);
    assert.equal(result.isLocked, true);
    assert.equal(result.lockedAt, state.lockedAt);
    assert.equal(result.lastGuessAt, state.lastGuessAt);
  });
  it('repeated challenges to the latest guess are idempotent', () => {
    const state = challenge(submit(lock(createGameState()), 200), 149.6);
    assert.equal(challenge(state, 149.6), state);
  });
  it('a new valid guess clears the old verdict; a rejected guess preserves it', () => {
    const state = challenge(submit(lock(createGameState()), 100), 149.6);
    assert.equal(submit(state, 100), state);
    const next = submit(state, 200);
    assert.equal(next.challenge, null);
    assert.deepEqual(challenge(next, 149.6).challenge, { success: true, guess: 200, answer: 149.6 });
  });
  it('changing an unlocked question clears the previous answer reveal', () => {
    const state = lock(challenge(submit(lock(createGameState()), 200), 149.6));
    const next = gameReducer(state, { type: 'select-question', index: 1, total: 13 });
    assert.deepEqual(next, { ...createGameState(), questionIndex: 1 });
  });
});
