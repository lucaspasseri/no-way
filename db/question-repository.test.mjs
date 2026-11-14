import { it } from 'node:test';
import assert from 'node:assert/strict';
import { storeCandidates, reviewQuestion, parseVerifiedAnswer } from './question-repository.mjs';

const candidate = { question: 'How many sides does a regular hexagon have?', answer: 6, unit: 'count',
  category: 'mathematics', difficulty: 'easy', explanation: 'A hexagon is defined as a polygon with exactly six sides.', sourceUrl: null, referenceDate: null };
const evidence = { reviewer: 'test-reviewer', notes: 'Independently checked the polygon definition in the reference.',
  sourceUrl: 'https://example.org/polygons', verifiedAnswer: 6, independentlyVerified: true };

function clientFor(row, { failWrite = false } = {}) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    if (sql.startsWith('SELECT id, question')) return { rows: [] };
    if (sql.includes('INSERT INTO')) {
      if (failWrite) throw new Error('database failure');
      return { rows: [{ id: 20, question: values[0], origin: 'ai', status: 'pending' }] };
    }
    if (sql.includes('UPDATE public.questions')) return { rows: [{ id: row.id, status: values[1], verified_at: values[1] === 'approved' ? new Date() : null }] };
    return { rows: [] };
  } };
}
const pending = { id: 20, ...candidate, answer_context: candidate.explanation, source_url: null, reference_date: null, status: 'pending' };

it('stores valid candidates pending, reports duplicates and structural failures, and rolls back database errors', async () => {
  const client = clientFor();
  const report = await storeCandidates(client, [candidate, candidate, { ...candidate, answer: '6' }], 'provider/model');
  assert.equal(report.stored.length, 1);
  assert.deepEqual(report.failures.map(row => row.code), ['DUPLICATE_QUESTION', 'INVALID_CANDIDATE']);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  const write = client.calls.find(row => row.sql.includes('INSERT INTO'));
  assert.match(write.sql, /'ai', 'pending'/);
  assert.equal(write.values[1], '6');
  const failing = clientFor(null, { failWrite: true });
  await assert.rejects(storeCandidates(failing, [candidate], 'provider/model'));
  assert.equal(failing.calls.at(-1).sql, 'ROLLBACK');
});

it('requires matching independent verification for approval and stores the review evidence', async () => {
  const client = clientFor(pending);
  assert.equal((await reviewQuestion(client, 20, 'approved', evidence)).status, 'approved');
  const write = client.calls.find(row => row.sql.includes('UPDATE public.questions'));
  assert.deepEqual(write.values, [20, 'approved', evidence.reviewer, evidence.notes, evidence.sourceUrl]);
  const mismatch = clientFor(pending);
  await assert.rejects(reviewQuestion(mismatch, 20, 'approved', { ...evidence, verifiedAnswer: 7 }), { code: 'ANSWER_MISMATCH' });
  assert.ok(!mismatch.calls.some(row => row.sql.includes('UPDATE public.questions')));
  assert.equal(mismatch.calls.at(-1).sql, 'ROLLBACK');
});

it('rejects pending questions with notes and refuses missing or terminal-state transitions', async () => {
  const rejected = await reviewQuestion(clientFor(pending), 20, 'rejected', { reviewer: evidence.reviewer, notes: evidence.notes });
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.verified_at, null);
  for (const row of [null, { ...pending, status: 'approved' }, { ...pending, status: 'rejected' }]) {
    await assert.rejects(reviewQuestion(clientFor(row), 20, 'approved', evidence), { code: 'NOT_PENDING' });
  }
  for (const patch of [{ independentlyVerified: false }, { sourceUrl: null }, { notes: 'OK' }, { reviewer: '' }]) {
    const client = clientFor(pending);
    await assert.rejects(reviewQuestion(client, 20, 'approved', { ...evidence, ...patch }), { code: 'INVALID_REVIEW' });
    assert.equal(client.calls.length, 0);
  }
});

it('requires explicit decimal review answers instead of coercing blank, hex, or nonfinite strings', () => {
  assert.equal(parseVerifiedAnswer('149.6'), 149.6); assert.equal(parseVerifiedAnswer('0'), 0);
  for (const value of ['', ' ', '0x10', 'Infinity', '-1', undefined]) assert.throws(() => parseVerifiedAnswer(value));
});
