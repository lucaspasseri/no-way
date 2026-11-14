import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { publicQuestion } from '../../../server/questions.mjs';
import questions from '../../../../db/seed/questions.json' with { type: 'json' };

let retrieve = async () => questions;
mock.module('../../../server/questions.mjs', {
  namedExports: { getQuestions: () => retrieve(), publicQuestion },
});
const { GET } = await import('./route.js');

it('awaits the service and returns public question fields without answers or context', async () => {
  let resolve;
  retrieve = () => new Promise(done => { resolve = done; });
  let settled = false;
  const pending = GET().then(response => { settled = true; return response; });
  await Promise.resolve();
  assert.equal(settled, false);
  resolve(questions.map(question => ({ ...question, explanation: 'Private answer explanation' })));
  const response = await pending;
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const publicQuestions = questions.map(publicQuestion);
  assert.deepEqual(await response.json(), { questions: publicQuestions, error: null });
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
  assert.deepEqual(log.mock.calls[0].arguments, ['Question retrieval failed.', { code: 'QUESTION_RETRIEVAL_FAILED' }]);
});
