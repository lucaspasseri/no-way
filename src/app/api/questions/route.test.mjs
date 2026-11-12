import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import questions from '../../../data/questions.json' with { type: 'json' };

let retrieve = async () => questions;
mock.module('../../../server/questions.mjs', {
  namedExports: { getQuestions: () => retrieve() },
});
const { GET } = await import('./route.js');

it('awaits the shared service and returns the complete question contract', async () => {
  let resolve;
  retrieve = () => new Promise(done => { resolve = done; });
  let settled = false;
  const pending = GET().then(response => { settled = true; return response; });
  await Promise.resolve();
  assert.equal(settled, false);
  resolve(questions);
  const response = await pending;
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  assert.deepEqual(await response.json(), { questions, error: null });
});

it('returns a consistent 500 response without leaking service errors or caching failures', async t => {
  const failure = new Error('private database credentials and stack details');
  retrieve = async () => { throw failure; };
  const log = t.mock.method(console, 'error', () => {});
  const response = await GET();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    questions: null,
    error: 'Unable to load questions. Please try again.',
  });
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[1], failure);
});
