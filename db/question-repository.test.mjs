import { it } from 'node:test';
import assert from 'node:assert/strict';
import { storeCandidates, reviewQuestion, parseVerifiedAnswer, listQuestions } from './question-repository.mjs';
const candidate = { question: 'How many sides does a regular hexagon have?', answer: 6, unit: 'count', category: 'mathematics', difficulty: 'easy', explanation: 'A hexagon is a polygon defined to have exactly six sides.', sourceUrl: null, referenceDate: null };
const evidence = { reviewer: 'test-reviewer', notes: 'Checked the mathematical definition and reviewed the wording and difficulty.', sourceUrl: 'https://example.org/polygons', verifiedAnswer: 6, independentlyVerified: true };
function clientFor(row, fail = false) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    if (sql.startsWith('SELECT id, question')) return { rows: row ? [row] : [] };
    if (sql.includes('INSERT INTO')) { if (fail) throw new Error('write failure'); return { rows: [{ id: 20, question: values[0], status: 'generated', origin: values[8] }] }; }
    if (sql.includes('UPDATE public.questions')) return { rows: [{ id: row.id, status: values[1], curatedId: values[2] }] };
    return { rows: [] };
  } };
}
it('stores schema-valid generated candidates without implying automated or factual validation', async () => {
  const client = clientFor();
  const result = await storeCandidates(client, [candidate, candidate, { ...candidate, answer: '6' }], 'provider/model');
  assert.equal(result.stored[0].status, 'generated');
  assert.deepEqual(result.failures.map(row => row.code), ['DUPLICATE_QUESTION', 'INVALID_CANDIDATE']);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  assert.equal((await storeCandidates(clientFor(), [{ ...candidate, question: 'What is the best number of sides for a polygon?' }], 'provider/model')).stored.length, 1);
  const failing = clientFor(null, true); await assert.rejects(storeCandidates(failing, [candidate], 'provider/model')); assert.equal(failing.calls.at(-1).sql, 'ROLLBACK');
});
it('centralizes database transitions, locks concurrent writers and parameterizes evidence', async () => {
  const row = { id: 20, ...candidate, src: null, status: 'generated' };
  assert.equal((await reviewQuestion(clientFor(row), 20, 'validated')).status, 'validated');
  await assert.rejects(reviewQuestion(clientFor(row), 20, 'curated', evidence), { code: 'INVALID_TRANSITION' });
  const client = clientFor({ ...row, status: 'validated' });
  assert.equal((await reviewQuestion(client, 20, 'curated', evidence)).curatedId, 1);
  assert.ok(client.calls.some(call => call.sql.includes('LOCK TABLE')));
  assert.deepEqual(client.calls.find(call => call.sql.includes('UPDATE public.questions')).values, [20, 'curated', 1, evidence.reviewer, evidence.notes, evidence.sourceUrl]);
  const missing = clientFor(); await assert.rejects(reviewQuestion(missing, 20, 'validated'), { code: 'QUESTION_UNAVAILABLE' }); assert.equal(missing.calls.at(-1).sql, 'ROLLBACK');
  await assert.rejects(listQuestions(clientFor(), 'pending'), { code: 'INVALID_STATUS' });
});
it('parses explicit decimal answers and refuses blank, hex and nonfinite values', () => {
  assert.equal(parseVerifiedAnswer('149.6'),149.6);
  for (const value of ['', ' ', '0x10', 'Infinity', '-1', undefined, '1e999']) assert.throws(() => parseVerifiedAnswer(value));
});
