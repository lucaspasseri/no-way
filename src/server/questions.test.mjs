import { it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import questions from '../../db/seed/questions.json' with { type: 'json' };

let query;
mock.module('../../db/pool.mjs', { namedExports: { getPool: () => ({ query: (...args) => query(...args) }) } });
const { getQuestions, publicQuestion, challengeQuestion } = await import('./questions.mjs');
beforeEach(() => { query = async () => ({ rows: structuredClone(questions) }); });

function environment(t, value) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
}

it('awaits PostgreSQL, requests curated questions ordered by ID, and preserves the contract', async t => {
  environment(t, 'test');
  let resolve;
  query = (sql, values) => {
    assert.match(sql, /FROM public\.questions WHERE status = \$1 ORDER BY id/);
    assert.match(sql, /answer::text AS answer/);
    assert.deepEqual(values, ['curated']);
    return new Promise(done => { resolve = done; });
  };
  let settled = false;
  const pending = getQuestions().then(result => { settled = true; return result; });
  assert.ok(pending instanceof Promise);
  await Promise.resolve();
  assert.equal(settled, false);
  resolve({ rows: questions.map(question => ({ ...question, referenceDate: null })) });
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

it('keeps answers, evidence, source links, and provenance out of public question data', () => {
  const result = publicQuestion({ ...questions[0], origin: 'ai', status: 'curated', reviewed_by: 'private reviewer' });
  assert.deepEqual(Object.keys(result).sort(), ['category', 'curatedId', 'difficulty', 'id', 'question', 'unit']);
});

it('challenges only curated IDs, uses server answers, and reveals nothing on failure or equality', async () => {
  query = async (sql, values) => {
    assert.match(sql, /WHERE id = \$1 AND status = 'curated'/);
    assert.deepEqual(values, [1]);
    return { rows: [{ ...questions[0], origin: 'seed' }] };
  };
  for (const guess of [0, 149.6]) assert.deepEqual(await challengeQuestion(1, guess), { success: false });
  const result = await challengeQuestion(1, 150);
  assert.equal(result.success, true); assert.equal(result.answer, 149.6);
  assert.ok(!('origin' in result.question));
  for (const [id, guess] of [[-1, 1], [1.5, 1], [2147483648, 1], [1, -1], [1, Infinity], [1, '150']]) {
    await assert.rejects(challengeQuestion(id, guess), { code: 'INVALID_CHALLENGE' });
  }
  query = async () => ({ rows: [] });
  await assert.rejects(challengeQuestion(1, 150), { code: 'QUESTION_UNAVAILABLE' });
});

const { selectQuestion, getQuestionOptions } = await import('./questions.mjs');

it('filters in parameterized curated-only SQL, retaining sequential order and one-question payloads', async () => {
  for (const input of [{}, { category: 'science' }, { difficulty: 'easy' }, { category: 'nature', difficulty: 'hard', after: 5 }]) {
    query = async (sql, values) => {
      assert.match(sql, /WHERE status = 'curated'/);
      assert.match(sql, /category = \$1/);
      assert.match(sql, /difficulty = \$2/);
      assert.match(sql, /CASE WHEN id > \$3 THEN 0 ELSE 1 END, id LIMIT 1/);
      assert.deepEqual(values, [input.category || null, input.difficulty || null, input.after || 0]);
      return { rows: [questions[0]] };
    };
    assert.deepEqual(await selectQuestion(input), publicQuestion(questions[0]));
  }
});

it('random selection prefers unseen IDs, excludes the current when possible, and needs no retry loop', async () => {
  query = async (sql, values) => {
    assert.match(sql, /CASE WHEN id = \$3 THEN 1 ELSE 0 END, CASE WHEN id = ANY\(\$4::integer\[\]\) THEN 1 ELSE 0 END, random\(\) LIMIT 1/);
    assert.deepEqual(values, [null, null, 1, [1, 2]]);
    return { rows: [questions[1]] };
  };
  assert.equal((await selectQuestion({ mode: 'random', after: 1, recent: [1, 2] })).id, questions[1].id);
  query = async () => ({ rows: [] });
  assert.equal(await selectQuestion({ mode: 'random' }), null);
});

it('derives category options and counts solely from eligible aggregate data with schema difficulties', async () => {
  query = async sql => {
    assert.match(sql, /WHERE status = 'curated' GROUP BY category, difficulty/);
    assert.ok(!sql.includes('answer'));
    return { rows: [{ category: 'science', difficulty: 'easy', count: 3 }, { category: null, difficulty: null, count: 1 }] };
  };
  const options = await getQuestionOptions();
  assert.deepEqual(options.categories, ['science']);
  assert.deepEqual(options.difficulties, ['easy', 'medium', 'hard']);
  assert.equal(options.total, 4);
});

it('handles legacy missing metadata without exposing answers or internal workflow', async () => {
  query = async () => ({ rows: [{ id: 1, question: 'How many?', answer: '0', category: null, difficulty: null, status: 'curated' }] });
  assert.deepEqual(await selectQuestion(), { id: 1, question: 'How many?' });
});

it('selects and challenges the same localized metric answer while keeping source evidence private', async () => {
  const source = questions.find(question => question.id === 54);
  query = async () => ({ rows: [{ ...source, id: 987 }] });
  const preferences = { locale: 'pt-BR', unitSystem: 'metric' };
  const selected = await selectQuestion(preferences);
  assert.equal(selected.id, 987); assert.match(selected.question, /Lago Superior.*metros/);
  assert.equal(selected.localization.converted, true);
  assert.ok(!('answer' in selected) && !('explanation' in selected) && !('explanationTexts' in selected));
  assert.deepEqual(await challengeQuestion(987, 406, preferences), { success: false });
  const result = await challengeQuestion(987, 407, preferences);
  assert.equal(result.answer, 406); assert.equal(result.question.question, selected.question);
  assert.match(result.question.explanation, /profundidade máxima/);
  assert.equal(result.question.explanationTexts.en, source.explanation);
  assert.equal(source.unit, 'feet'); assert.equal(source.answer, '1332');
});
