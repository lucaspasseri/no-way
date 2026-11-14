import { it } from 'node:test';
import assert from 'node:assert/strict';
import bank from './seed/questions.json' with { type: 'json' };
import { questionStatuses, transitionQuestion, validateBank } from './question-lifecycle.mjs';
const seed = bank[0];
it('requires validation before evidence-based curation and supports revalidation without recycling curated IDs', () => {
  const generated = { ...seed, status: 'generated', curatedId: undefined, review: null };
  assert.throws(() => transitionQuestion(generated, 'curated', { evidence: seed.review, nextCuratedId: 1 }), { code: 'INVALID_TRANSITION' });
  const validated = transitionQuestion(generated, 'validated');
  assert.equal(validated.status, 'validated'); assert.equal(validated.review, null); assert.equal(validated.curatedId, undefined);
  assert.throws(() => transitionQuestion(validated, 'curated', { evidence: { ...seed.review, independentlyVerified: false }, nextCuratedId: 1 }), { code: 'INVALID_REVIEW' });
  assert.throws(() => transitionQuestion(validated, 'curated', { evidence: { ...seed.review, verifiedAnswer: 42 }, nextCuratedId: 1 }), { code: 'ANSWER_MISMATCH' });
  const curated = transitionQuestion(validated, 'curated', { evidence: seed.review, nextCuratedId: 8 });
  assert.equal(curated.curatedId, 8);
  assert.throws(() => transitionQuestion(curated, 'validated'), { code: 'INVALID_REVIEW' });
  for (const notes of ['short', 'x'.repeat(4001), 'Detailed concern with a null byte.\0']) {
    assert.throws(() => transitionQuestion(curated, 'generated', { evidence: { notes } }), { code: 'INVALID_REVIEW' });
  }
  const demoted = transitionQuestion(curated, 'generated', { evidence: { notes: 'Flagged for factual revalidation after a source correction.' } });
  assert.equal(demoted.review, null); assert.equal(demoted.curatedId, 8);
  assert.equal(transitionQuestion(transitionQuestion(demoted, 'validated'), 'curated', { evidence: seed.review, nextCuratedId: 9 }).curatedId, 8);
});
it('rejects malformed, ambiguous, duplicate and invalid-state candidates on promotion', () => {
  for (const patch of [{ answer: '-1' }, { unit: '' }, { question: 'What is the best answer in million kilometers?' }]) {
    assert.throws(() => transitionQuestion({ ...seed, ...patch, status: 'validated' }, 'curated', { evidence: seed.review }));
  }
  assert.throws(() => transitionQuestion({ ...seed, status: 'validated' }, 'curated', { evidence: seed.review, existing: [{ ...seed, id: 999 }] }), { code: 'DUPLICATE_QUESTION' });
  assert.throws(() => transitionQuestion({ ...seed, status: 'approved' }, 'validated'), { code: 'INVALID_STATUS' });
});
it('audits the complete curated dataset with sequential IDs, reviewed answers, topic diversity and finite numbers', () => {
  validateBank(bank, { sequential: true });
  assert.equal(bank.length, 200);
  assert.ok(bank.every(row => questionStatuses.includes(row.status) && row.status === 'curated' && Number.isFinite(Number(row.answer))));
  assert.deepEqual(bank.map(row => row.curatedId), Array.from({ length: bank.length }, (_, i) => i + 1));
  assert.equal(new Set(bank.map(row => row.category)).size, 10);
  assert.deepEqual(bank.slice(0, 5).map(row => row.id), [1, 2, 6, 7, 10]);
});
