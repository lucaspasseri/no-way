import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import { applySchema } from '../db/schema.mjs';
import { seedQuestions } from '../db/seed.mjs';
import { getPool } from '../db/pool.mjs';
import { getQuestions, getQuestionOptions, selectQuestion, challengeQuestion } from '../src/server/questions.mjs';

it('selects filtered questions against isolated PostgreSQL without modifying the configured database', { timeout: 60000 }, async t => {
  const bin = process.env.PG_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const directory = await mkdtemp(join(tmpdir(), 'no-way-selection-'));
  const data = join(directory, 'data');
  const command = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
  let started = false, client, pool;
  const previous = { url: process.env.DATABASE_URL, mode: process.env.NODE_ENV };
  t.after(async () => {
    await pool?.end(); await client?.end();
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
  });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  command('initdb', ['-D', data, '-U', 'selection_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  command('pg_ctl', ['-D', data, '-l', join(directory, 'server.log'), '-o', `-F -h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
  started = true;
  process.env.DATABASE_URL = `postgres://selection_test@127.0.0.1:${port}/postgres`;
  process.env.NODE_ENV = 'test';
  client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  pool = getPool();
  await applySchema(client); await seedQuestions(client);
  const bank = await getQuestions();
  const ids = bank.map(question => question.id);

  await t.test('next preserves database order, filters and wraparound; IDs differ from curated numbering', async () => {
    for (const filters of [{}, { category: 'science' }, { difficulty: 'hard' }, { category: 'nature', difficulty: 'easy' }]) {
      const matching = bank.filter(question => (!filters.category || question.category === filters.category)
        && (!filters.difficulty || question.difficulty === filters.difficulty));
      assert.ok(matching.length);
      assert.equal((await selectQuestion(filters)).id, matching[0].id);
      assert.equal((await selectQuestion({ ...filters, after: matching[0].id })).id, matching[1]?.id ?? matching[0].id);
      assert.equal((await selectQuestion({ ...filters, after: ids.at(-1) })).id, matching[0].id);
    }
    // Curation labels do not control selection order.
    await client.query('UPDATE public.questions SET curated_id = curated_id + 1000 WHERE id = $1', [ids[0]]);
    assert.equal((await selectQuestion()).id, ids[0]);
  });
  await t.test('random respects combined filters and prefers the sole unseen question', async () => {
    const matching = bank.filter(question => question.category === 'science' && question.difficulty === 'medium');
    const unseen = matching.at(-1).id;
    const recent = ids.filter(id => id !== unseen);
    for (let i = 0; i < 5; i++) {
      const question = await selectQuestion({ mode: 'random', category: 'science', difficulty: 'medium', after: matching[0].id, recent });
      assert.equal(question.id, unseen);
      assert.ok(!('answer' in question) && !('status' in question) && !('src' in question));
    }
  });
  await t.test('exhausted pools repeat without reselecting the current question when alternatives exist', async () => {
    const question = await selectQuestion({ mode: 'random', after: ids[0], recent: ids });
    assert.ok(ids.includes(question.id)); assert.notEqual(question.id, ids[0]);
  });
  await t.test('metadata and selection use the same eligibility after generated/validated demotions', async () => {
    for (const [id, status] of [[ids[0], 'generated'], [ids[1], 'validated']]) {
      await client.query('UPDATE public.questions SET status=$2, verified_at=NULL WHERE id=$1', [id, status]);
      await assert.rejects(challengeQuestion(id, 1e12), { code: 'QUESTION_UNAVAILABLE' });
    }
    const options = await getQuestionOptions();
    assert.equal(options.total, bank.length - 2);
    for (const pool of options.pools) {
      assert.equal(pool.count, bank.filter(question => !ids.slice(0, 2).includes(question.id)
        && question.category === pool.category && question.difficulty === pool.difficulty).length);
    }
    assert.equal((await selectQuestion()).id, ids[2]);
  });
  await t.test('single-question and empty combinations use finite fallback without ignoring preferences', async () => {
    await client.query('DELETE FROM public.questions WHERE id <> $1', [ids[2]]);
    const single = bank[2];
    assert.equal((await selectQuestion({ mode: 'random', after: single.id, recent: [single.id] })).id, single.id);
    assert.equal(await selectQuestion({ category: single.category === 'nature' ? 'science' : 'nature' }), null);
    await client.query('DELETE FROM public.questions');
    assert.equal(await selectQuestion(), null);
    assert.equal(await selectQuestion({ mode: 'random' }), null);
    assert.deepEqual((await getQuestionOptions()).categories, []);
  });
});
