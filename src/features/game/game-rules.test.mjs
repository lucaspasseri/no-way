import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canChallengeGuess, createGameState, gameReducer, validateGuess, formatNumber, resolveChallenge, getGuessDifference, getQuestionAnswer } from './game-rules.mjs';

const question = { id: 1, question: 'How far?', answer: '149.6', 'src-label': 'Reference', src: 'https://example.com' };
const questions = [question, { id: 2, question: 'How many?', answer: '384.4' }];
const lock = state => gameReducer(state, { type: 'toggle-lock', now: 1000 });
const submit = (state, value, now = 2000) => gameReducer(state, { type: 'guess', guess: { id: String(now), value }, now });
const challenge = (state, answer = question.answer) => gameReducer(state, { type: 'challenge', question: { ...question, answer }, questionIndex: state.questionIndex });
const nextRound = (state, bank = questions) => gameReducer(state, { type: 'start-next-round', questions: bank });

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
    assert.deepEqual(createGameState(), { phase: 'playing', questionIndex: 0, isLocked: false, lockedAt: null, lastGuessAt: null, guesses: [], challenge: null, roundError: null });
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
  it('reset preserves a selected question and restarts timers during play', () => {
    const selected = gameReducer(createGameState(), { type: 'select-question', index: 3, total: 13 });
    const state = submit(lock(selected), 200);
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
    assert.equal(resolveChallenge(149.7, question).success, true);
    assert.equal(resolveChallenge(149.6, question).success, false);
    assert.equal(resolveChallenge(149.5, question).success, false);
  });
  it('enters the result phase with the latest guess, answer and question, preserving round history', () => {
    const first = submit(lock(createGameState()), 100);
    const state = submit(first, 200, 3000);
    const result = challenge(state);
    assert.equal(result.phase, 'result');
    assert.deepEqual(result.challenge, { success: true, guess: 200, answer: 149.6, question });
    assert.equal(result.guesses, state.guesses);
    assert.equal(result.isLocked, true);
    assert.equal(result.lockedAt, state.lockedAt);
    assert.equal(result.lastGuessAt, state.lastGuessAt);
  });
  it('repeated challenges to the latest guess are idempotent', () => {
    const state = challenge(submit(lock(createGameState()), 200), 149.6);
    assert.equal(challenge(state, 149.6), state);
  });
  it('prevents all gameplay actions after resolution, including a different challenge', () => {
    const state = challenge(submit(lock(createGameState()), 100), 149.6);
    assert.equal(submit(state, 100), state);
    assert.equal(submit(state, 200), state);
    assert.equal(lock(state), state);
    assert.equal(gameReducer(state, { type: 'reset', now: 5000 }), state);
    assert.equal(gameReducer(state, { type: 'select-question', index: 1, total: 13 }), state);
    assert.equal(challenge(state, 300), state);
    assert.equal(canChallengeGuess(state, 149.6), false);
  });
  it('ends the round for failed and exact-match challenges too', () => {
    for (const value of [100, 149.6]) {
      const state = challenge(submit(lock(createGameState()), value));
      assert.equal(state.phase, 'result');
      assert.equal(state.challenge.success, false);
      assert.equal(state.challenge.guess, value);
      assert.equal(state.challenge.answer, 149.6);
    }
  });
  it('rejects a stale question after a queued selection', () => {
    const selected = gameReducer(createGameState(), { type: 'select-question', index: 1, total: 2 });
    const state = submit(lock(selected), 200);
    assert.equal(gameReducer(state, { type: 'challenge', question, questionIndex: 0 }), state);
  });
  it('snapshots the question and real optional metadata at resolution', () => {
    const original = { ...question, explanation: 'An explanation from the question bank.' };
    const state = gameReducer(submit(lock(createGameState()), 200), { type: 'challenge', question: original, questionIndex: 0 });
    original.question = 'Changed';
    original.answer = '500';
    original.explanation = 'Changed';
    assert.equal(state.challenge.question.question, 'How far?');
    assert.equal(state.challenge.answer, 149.6);
    assert.equal(state.challenge.question.explanation, 'An explanation from the question bank.');
    assert.equal(state.challenge.question.src, question.src);
  });
  it('handles questions without explanatory metadata', () => {
    const result = resolveChallenge(400, questions[1]);
    assert.equal(result.question.explanation, undefined);
    assert.equal(result.question.src, undefined);
    assert.equal(result.success, true);
  });
  it('treats zero as a valid answer, and rejects absent, blank or malformed questions', () => {
    assert.equal(getQuestionAnswer({ ...question, answer: 0 }), 0);
    for (const answer of ['', ' ', undefined, null, 'abc', NaN, Infinity]) {
      const invalid = { ...question, answer };
      assert.equal(getQuestionAnswer(invalid), null);
      const state = submit(lock(createGameState()), 100);
      assert.equal(gameReducer(state, { type: 'challenge', question: invalid, questionIndex: 0 }), state);
    }
    assert.equal(getQuestionAnswer(undefined), null);
    assert.equal(getQuestionAnswer({ ...question, question: '' }), null);
  });
});

describe('new round lifecycle', () => {
  const resolved = () => challenge(submit(lock(createGameState()), 200));

  it('advances to the next question, clearing the result, guesses, lock and timers', () => {
    const next = nextRound(resolved());
    assert.deepEqual(next, { ...createGameState(), questionIndex: 1 });
    assert.equal(submit(next, 400), next);
    assert.equal(submit(lock(next), 400).guesses.length, 1);
  });
  it('preserves next-question wraparound and permits reuse only for a single-question bank', () => {
    const last = { ...resolved(), questionIndex: 1 };
    assert.deepEqual(nextRound(last), createGameState());
    assert.deepEqual(nextRound(resolved(), [question]), createGameState());
  });
  it('ignores another next-round action once playing, preventing double-click skips', () => {
    const next = nextRound(resolved());
    assert.equal(nextRound(next), next);
    const initial = createGameState();
    assert.equal(nextRound(initial), initial);
  });
  it('retains a stable result and a recoverable error when the next question is unavailable', () => {
    for (const bank of [[], [question, undefined], [question, { ...question, answer: '' }]]) {
      const state = resolved();
      const failed = nextRound(state, bank);
      assert.equal(failed.phase, 'result');
      assert.equal(failed.challenge, state.challenge);
      assert.equal(failed.guesses, state.guesses);
      assert.equal(failed.questionIndex, state.questionIndex);
      assert.match(failed.roundError, /try again/i);
      assert.deepEqual(nextRound(failed), { ...createGameState(), questionIndex: 1 });
    }
  });
});

describe('numerical comparison', () => {
  it('calculates absolute differences above, below and equal to the answer', () => {
    assert.equal(getGuessDifference(200, 149.6), 50.4);
    assert.equal(getGuessDifference(100, 149.6), 49.6);
    assert.equal(getGuessDifference(149.6, 149.6), 0);
  });
  it('avoids floating-point artifacts without discarding supported decimal precision', () => {
    assert.equal(formatNumber(getGuessDifference(0.3, 0.2)), '0.1');
    assert.equal(getGuessDifference(1.2345678901234567, 1), 0.2345678901234567);
    assert.equal(getGuessDifference(0.0000002, 0.0000001), 0.0000001);
    assert.equal(getGuessDifference(1e21, 0), 1e21);
    assert.equal(getGuessDifference(0, -1.5), 1.5);
  });
});
