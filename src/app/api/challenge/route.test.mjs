import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
let challenge;
mock.module('../../../server/questions.mjs', { namedExports: { challengeQuestion: (...args) => challenge(...args) } });
const { POST } = await import('./route.js');
const request = body => new Request('http://localhost/api/challenge', { method: 'POST', body: JSON.stringify(body) });

it('returns failed challenges without answers and successful challenges with the server result', async () => {
  for (const result of [{ success: false }, { success: true, guess: 200, answer: 149.6, question: { id: 1, question: 'How far?', answer: '149.6' } }]) {
    challenge = async (id, guess) => { assert.equal(id, 1); assert.equal(guess, 200); return result; };
    const response = await POST(request({ questionId: 1, guess: 200 }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { result, error: null });
  }
});

it('rejects malformed requests and hides database and configuration errors', async () => {
  for (const body of [null, { questionId: 1, guess: 200, answer: 10 }]) assert.equal((await POST(request(body))).status, 400);
  for (const [code, status] of [['INVALID_CHALLENGE', 400], ['QUESTION_UNAVAILABLE', 404], ['08006', 500]]) {
    challenge = async () => { throw Object.assign(new Error('private connection information'), { code }); };
    const response = await POST(request({ questionId: 1, guess: 200 }));
    assert.equal(response.status, status);
    assert.ok(!JSON.stringify(await response.json()).includes('private'));
  }
});
