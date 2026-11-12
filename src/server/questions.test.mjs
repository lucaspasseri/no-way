import { it } from 'node:test';
import assert from 'node:assert/strict';
import questions from '../data/questions.json' with { type: 'json' };
import { getQuestions } from './questions.mjs';

function environment(t, value) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
}

it('asynchronously retrieves the unchanged JSON schema and serializable values', async t => {
  environment(t, 'test');
  const pending = getQuestions();
  assert.ok(pending instanceof Promise);
  const result = await pending;
  assert.deepEqual(result, questions);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), questions);
  assert.notEqual(result, questions);
  result[0].answer = '0';
  assert.deepEqual(await getQuestions(), questions);
});

it('waits exactly 1,000 ms in development', async t => {
  environment(t, 'development');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const pending = getQuestions().then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, questions);
});

it('never schedules artificial latency in production or test', async t => {
  environment(t, 'production');
  for (const mode of ['production', 'test']) {
    process.env.NODE_ENV = mode;
    const timer = t.mock.method(globalThis, 'setTimeout', () => {
      throw new Error('Artificial latency must not run here');
    });
    assert.deepEqual(await getQuestions(), questions);
    assert.equal(timer.mock.callCount(), 0);
    timer.mock.restore();
  }
});

it('rejects an empty bank and invalid questions before rendering', async t => {
  environment(t, 'test');
  const original = structuredClone(questions);
  t.after(() => questions.splice(0, questions.length, ...original));
  for (const invalid of [
    [],
    [null],
    [{ ...original[0], answer: '' }],
    [{ ...original[0], answer: 'Infinity' }],
    [{ ...original[0], question: ' ' }],
    [{ ...original[0], id: '1' }],
    [original[0], original[0]],
  ]) {
    questions.splice(0, questions.length, ...invalid);
    await assert.rejects(getQuestions(), /question bank is empty or invalid/);
  }
});
