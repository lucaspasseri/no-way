import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { publicQuestion } from '../../../server/questions.mjs';
import questions from '../../../../db/seed/questions.json' with { type: 'json' };

let retrieve = async () => publicQuestion(questions[0]);
mock.module('../../../server/questions.mjs', { namedExports: { selectQuestion: input => retrieve(input) } });
const { GET } = await import('./route.js');
const get = (query = '') => GET(new Request('http://localhost/api/questions' + query));

it('awaits selection and returns one public question with validated preferences', async () => {
  let resolve;
  retrieve = input => {
    assert.deepEqual(input, { mode: 'random', category: 'science', difficulty: 'hard', after: 3, recent: [1, 2] });
    return new Promise(done => { resolve = done; });
  };
  let settled = false;
  const pending = get('?mode=random&category=science&difficulty=hard&after=3&recent=1,2').then(response => { settled = true; return response; });
  await Promise.resolve();
  assert.equal(settled, false);
  resolve(publicQuestion(questions[0]));
  const response = await pending;
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { questions: [publicQuestion(questions[0])], error: null });
});

it('defaults to unfiltered sequential selection and returns empty pools as success', async () => {
  retrieve = async input => {
    assert.deepEqual(input, { mode: 'next', category: '', difficulty: '', after: 0, recent: [] });
    return null;
  };
  assert.deepEqual(await (await get()).json(), { questions: [], error: null });
});

it('rejects unknown, duplicate, malformed, oversized and workflow parameters before database access', async () => {
  retrieve = () => { throw new Error('Must not query'); };
  for (const query of ['?category=unknown', '?difficulty=extreme', '?mode=all', '?status=generated', '?after=-1',
    '?after=1.5', '?after=2147483648', '?recent=0', '?recent=1,no', '?recent=' + Array(201).fill(1).join(','), '?category=science&category=nature']) {
    const response = await get(query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).questions, null);
  }
});

it('returns a consistent 500 without leaking service errors', async t => {
  retrieve = async () => { throw new Error('private details'); };
  const log = t.mock.method(console, 'error', () => {});
  const response = await get();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { questions: null, error: 'Unable to load questions. Please try again.' });
  assert.equal(log.mock.callCount(), 1);
});
