import { it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import questions from '../../db/seed/questions.json' with { type: 'json' };

let query;
mock.module('../../db/pool.mjs', { namedExports: { getPool: () => ({ query: (...args) => query(...args) }) } });
const { getQuestions } = await import('./questions.mjs');
beforeEach(() => { query = async () => ({ rows: structuredClone(questions) }); });

function environment(t, value) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
}

it('awaits PostgreSQL, requests verified questions ordered by ID, and preserves the contract', async t => {
  environment(t, 'test');
  let resolve;
  query = (sql, values) => {
    assert.match(sql, /FROM public\.questions WHERE status = \$1 ORDER BY id/);
    assert.match(sql, /answer::text AS answer/);
    assert.deepEqual(values, ['verified']);
    return new Promise(done => { resolve = done; });
  };
  let settled = false;
  const pending = getQuestions().then(result => { settled = true; return result; });
  assert.ok(pending instanceof Promise);
  await Promise.resolve();
  assert.equal(settled, false);
  resolve({ rows: questions.map(question => ({ ...question, category: null, explanation: null })) });
  const result = await pending;
  assert.deepEqual(result, questions);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), questions);
});

it('waits exactly 1,000 ms before querying in development', async t => {
  environment(t, 'development');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dbQuery = t.mock.fn(async () => ({ rows: questions }));
  query = dbQuery;
  const pending = getQuestions();
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(dbQuery.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, questions);
  assert.equal(dbQuery.mock.callCount(), 1);
});

it('does not schedule artificial latency in production or test', async t => {
  environment(t, 'production');
  for (const mode of ['production', 'test']) {
    process.env.NODE_ENV = mode;
    const timer = t.mock.method(globalThis, 'setTimeout', () => { throw new Error('Unexpected artificial latency'); });
    assert.deepEqual(await getQuestions(), questions);
    assert.equal(timer.mock.callCount(), 0);
    timer.mock.restore();
  }
});

it('rejects empty or malformed stored banks and preserves database failures for the error boundary', async t => {
  environment(t, 'test');
  for (const invalid of [[], [null], [{ ...questions[0], answer: '' }], [{ ...questions[0], id: -1 }],
    [{ ...questions[0], question: ' ' }], [{ ...questions[0], src: 42 }], [questions[0], questions[0]]]) {
    query = async () => ({ rows: invalid });
    await assert.rejects(getQuestions());
  }
  const failure = new Error('Database is unavailable');
  query = async () => { throw failure; };
  await assert.rejects(getQuestions(), error => error === failure);
});
