import { it } from 'node:test';
import assert from 'node:assert/strict';
import { applySchema } from './schema.mjs';
import { assertResetAllowed, seedQuestions } from './seed.mjs';

const bank = [{ id: 7, question: 'How many?', answer: '149.6', category: 'Science', 'src-label': 'Reference', src: 'https://example.com', explanation: 'In millions' }];
function fakeClient({ existing = [], changed = 1, failInsert = false, verified = true } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id, origin')) return { rows: existing };
      if (sql.includes('INSERT INTO')) {
        if (failInsert) throw new Error('Write failed');
        assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/);
        assert.match(sql, /IS DISTINCT FROM/);
        return { rowCount: changed };
      }
      if (sql.includes('answer::text')) return { rows: verified ? bank.map(question => ({
        id: question.id, question: question.question, answer: question.answer, category: question.category,
        source_label: question['src-label'], source_url: question.src, answer_context: question.explanation,
      })) : [] };
      return { rows: [], rowCount: 0 };
    },
  };
}

it('initialization uses the centralized non-destructive SQL schema', async () => {
  let sql;
  await applySchema({ query: async text => { sql = text; } });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.questions/);
  assert.match(sql, /answer numeric NOT NULL/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|\bDELETE\b/);
});

it('seeding parameterizes all metadata and verifies writes before committing', async () => {
  const client = fakeClient();
  assert.deepEqual(await seedQuestions(client, { bank }), { inserted: 1, updated: 0, unchanged: 0 });
  assert.equal(client.calls[0].sql, 'BEGIN');
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  const write = client.calls.find(call => call.sql.includes('INSERT INTO'));
  assert.deepEqual(write.values, [7, 'How many?', '149.6', 'Science', 'Reference', 'https://example.com', 'In millions']);
  assert.doesNotMatch(write.sql, /How many\?/);
  assert.ok(client.calls.some(call => call.sql.includes('setval')));
});

it('seeding reports updates and unchanged rows without deleting data or resetting moderation', async () => {
  for (const [changed, expected] of [[1, { inserted: 0, updated: 1, unchanged: 0 }], [0, { inserted: 0, updated: 0, unchanged: 1 }]]) {
    const client = fakeClient({ existing: [{ id: 7, origin: 'seed' }], changed });
    assert.deepEqual(await seedQuestions(client, { bank }), expected);
    const update = client.calls.find(call => call.sql.includes('ON CONFLICT')).sql.split('DO UPDATE SET')[1].split('WHERE')[0];
    assert.doesNotMatch(update, /status\s*=|origin\s*=/);
    assert.doesNotMatch(client.calls.map(call => call.sql).join(' '), /\bDELETE\b|\bDROP\b/);
  }
});

it('seeding refuses non-seed ID collisions and rolls back write or verification failures', async () => {
  for (const options of [{ existing: [{ id: 7, origin: 'manual' }] }, { failInsert: true }, { verified: false }]) {
    const client = fakeClient(options);
    await assert.rejects(seedQuestions(client, { bank }));
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!client.calls.some(call => call.sql === 'COMMIT'));
  }
});

it('invalid seed data is rejected before any database operation', async () => {
  const client = fakeClient();
  await assert.rejects(seedQuestions(client, { bank: [{ ...bank[0], answer: 'Infinity' }] }));
  assert.deepEqual(client.calls, []);
});

it('reset requires explicit development mode and confirmation at the destructive entry point', async t => {
  for (const environment of ['production', 'test', '', 'staging']) {
    assert.throws(() => assertResetAllowed({ environment, confirmed: true }), /Reset refused/);
  }
  assert.throws(() => assertResetAllowed({ environment: 'development', confirmed: false }), /Reset refused/);
  assert.doesNotThrow(() => assertResetAllowed({ environment: 'development', confirmed: true }));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  const client = fakeClient();
  await assert.rejects(seedQuestions(client, { reset: true, bank }), /Reset refused/);
  assert.deepEqual(client.calls, []);
});

it('an explicitly confirmed development reset recreates only questions in the seed transaction', async t => {
  const previous = process.env.NODE_ENV;
  const args = process.argv;
  process.env.NODE_ENV = 'development';
  process.argv = [...args, '--confirm-reset'];
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    process.argv = args;
  });
  const client = fakeClient();
  await seedQuestions(client, { reset: true, bank });
  assert.equal(client.calls[0].sql, 'BEGIN');
  assert.equal(client.calls[1].sql, 'DROP TABLE IF EXISTS public.questions');
  assert.match(client.calls[2].sql, /CREATE TABLE IF NOT EXISTS/);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  assert.doesNotMatch(client.calls.map(call => call.sql).join(' '), /CASCADE/);
});
