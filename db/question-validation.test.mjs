import { it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, similarQuestion } from './question-validation.mjs';
import { assertResetAllowed, verifyResetTarget } from './reset-safety.mjs';

export const candidate = { question: 'How many sides does a regular hexagon have?', answer: 6, unit: 'count',
  category: 'mathematics', difficulty: 'easy', explanation: 'A hexagon is defined as a polygon with exactly six sides.',
  sourceUrl: null, referenceDate: null };

it('validates candidates without numeric coercion, overflow, negatives, bad fields, or hidden approval', () => {
  assert.deepEqual(validateCandidate(candidate), candidate);
  assert.equal(validateCandidate({ ...candidate, answer: 0 }).answer, 0);
  for (const answer of [NaN, Infinity, -Infinity, -1, '', '6', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCandidate({ ...candidate, answer }), { code: 'INVALID_CANDIDATE' });
  }
  for (const patch of [{ question: 'Why?' }, { category: 'unknown' }, { difficulty: 'expert' }, { status: 'approved' },
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:password@example.org' },
    { question: 'A'.repeat(1001) }, { explanation: 'x\u0000' }, { referenceDate: '2026-02-30' }]) {
    assert.throws(() => validateCandidate({ ...candidate, ...patch }), { code: 'INVALID_CANDIDATE' });
  }
});

it('screens duplicates across punctuation and near-identical wording, independent of status', () => {
  assert.ok(similarQuestion(candidate.question, 'HOW MANY SIDES DOES A REGULAR HEXAGON HAVE!!!'));
  assert.ok(similarQuestion(candidate.question, 'How many sides does a regular hexagon have in total?'));
  for (const status of ['generated', 'validated', 'curated']) {
    assert.throws(() => validateCandidate(candidate, [{ ...candidate, status }]), { code: 'DUPLICATE_QUESTION' });
  }
  assert.ok(!similarQuestion(candidate.question, 'How many seconds are in exactly one minute?'));
  assert.ok(!similarQuestion('According to NASA, what is the average Mars-Sun distance in million kilometers, rounded to the nearest whole million?', 'According to NASA, what is the average Jupiter-Sun distance in million kilometers, rounded to the nearest whole million?'));
});

it('screens subjective, imprecise, missing-unit, and undated changing questions', () => {
  for (const [patch, code] of [
    [{ question: 'What is the best number of sides for a polygon?' }, 'AMBIGUOUS_QUESTION'],
    [{ question: 'Approximately how many sides does a regular hexagon have?' }, 'IMPRECISE_QUESTION'],
    [{ unit: 'kilometers' }, 'MISSING_UNIT'],
    [{ question: 'What is the current population of Paris in people?', unit: 'people' }, 'REFERENCE_DATE_REQUIRED'],
    [{ question: 'What is the population of Paris in people?', unit: 'people', referenceDate: '2026-01-01' }, 'REFERENCE_DATE_REQUIRED'],
  ]) assert.throws(() => validateCandidate({ ...candidate, ...patch }), { code });
  assert.ok(validateCandidate({ ...candidate, question: 'What is the population of Paris in people as of 2026-01-01?', unit: 'people', referenceDate: '2026-01-01' }));
});

it('refuses reset for production, unknown names, hosted URLs, overrides, or a mismatched actual server', async t => {
  const allowed = { environment: 'test', confirmed: true, connectionString: 'postgres://tester@127.0.0.1/no_way_test' };
  assert.equal(assertResetAllowed(allowed), 'no_way_test');
  for (const patch of [{ environment: 'production' }, { environment: '' }, { confirmed: false },
    { connectionString: 'postgres://tester@127.0.0.1/production' },
    { connectionString: 'postgres://tester@hosted.example/no_way_test' },
    { connectionString: 'postgres://tester@127.0.0.1/no_way_test?host=hosted.example' },
    { connectionString: 'postgres://tester@127.0.0.1/no_way_test?options=-csearch_path%3Dother' },
    { connectionString: undefined }]) assert.throws(() => assertResetAllowed({ ...allowed, ...patch }), { code: 'RESET_REFUSED' });
  const previous = { environment: process.env.NODE_ENV, url: process.env.DATABASE_URL, args: process.argv };
  t.after(() => {
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    process.argv = previous.args;
  });
  process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = allowed.connectionString; process.argv = [...process.argv, '--confirm-reset'];
  for (const target of [{ database: 'production', address: '127.0.0.1' }, { database: 'no_way_test', address: '192.0.2.1' }]) {
    await assert.rejects(verifyResetTarget({ query: async () => ({ rows: [target] }) }), { code: 'RESET_REFUSED' });
  }
});
