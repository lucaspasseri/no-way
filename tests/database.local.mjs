// Opt-in integration suite. Owns a fresh temporary cluster; never loads .env.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import seeds from '../db/seed/questions.json' with { type: 'json' };
import { applySchema } from '../db/schema.mjs';
import { seedQuestions } from '../db/seed.mjs';
import { storeCandidates, listQuestions, reviewQuestion } from '../db/question-repository.mjs';
import { generateCandidates } from '../db/generate-questions.mjs';
import { getPool } from '../db/pool.mjs';
import { getQuestions, challengeQuestion, publicQuestion } from '../src/server/questions.mjs';
import { GET } from '../src/app/api/questions/route.js';
import { createSeedSQL } from '../db/export-seed.mjs';

const candidate = { question: 'How many sides does a regular hexagon have?', answer: 6, unit: 'count',
  category: 'mathematics', difficulty: 'easy', explanation: 'A hexagon is defined as a polygon with exactly six sides.',
  sourceUrl: null, referenceDate: null };
const evidence = { reviewer: 'integration-reviewer', notes: 'Independently checked the polygon definition in the reference.',
  sourceUrl: 'https://example.org/polygon-definition', verifiedAnswer: 6, independentlyVerified: true };

it('initializes and exercises the question lifecycle in an isolated PostgreSQL cluster', { timeout: 60000 }, async t => {
  const bin = process.env.PG_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const directory = await mkdtemp(join(tmpdir(), 'no-way-postgres-'));
  const data = join(directory, 'data');
  const command = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
  let started = false, admin, client, appPool;
  const previous = { url: process.env.DATABASE_URL, mode: process.env.NODE_ENV, args: process.argv, key: process.env.OPENROUTER_API_KEY };
  t.after(async () => {
    await client?.end(); await appPool?.end(); await admin?.end();
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries({ DATABASE_URL: previous.url, NODE_ENV: previous.mode, OPENROUTER_API_KEY: previous.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    process.argv = previous.args;
  });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  command('initdb', ['-D', data, '-U', 'question_test', '-A', 'trust', '--no-locale']);
  command('pg_ctl', ['-D', data, '-l', join(directory, 'server.log'), '-o', `-F -h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
  started = true;
  const base = `postgres://question_test@127.0.0.1:${port}`;
  admin = new pg.Client({ connectionString: `${base}/postgres` }); await admin.connect();
  await admin.query('CREATE DATABASE no_way_test');
  process.env.DATABASE_URL = `${base}/no_way_test`; process.env.NODE_ENV = 'test';
  process.env.OPENROUTER_API_KEY = 'integration-fake-key';
  client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  appPool = getPool();

  await t.test('canonical schema and five deterministic approved seeds initialize and repeat safely', async () => {
    await applySchema(client); await applySchema(client);
    assert.equal(seeds.length, 5);
    assert.deepEqual(await seedQuestions(client), { inserted: 5, updated: 0, unchanged: 0 });
    assert.deepEqual(await seedQuestions(client), { inserted: 0, updated: 0, unchanged: 5 });
    const rows = await listQuestions(client, 'all');
    assert.ok(rows.every(row => row.origin === 'seed' && row.status === 'approved' && row.verified_at));
    assert.deepEqual((await getQuestions()).map(({ origin, ...question }) => question), seeds);
    for (const value of ['NaN', 'Infinity', '-Infinity', '-1', '9007199254740992']) {
      await assert.rejects(client.query("INSERT INTO public.questions (question, answer) VALUES ('Invalid number?', $1::numeric)", [value]), { code: '23514' });
    }
  });

  let approvedId, rejectedId;
  await t.test('changed curated content refreshes approval evidence while reseeding preserves rejection decisions', async () => {
    const { rows: [original] } = await client.query('SELECT * FROM public.questions WHERE id = 1');
    await client.query("UPDATE public.questions SET source_url = 'https://example.org/old', verification_source_url = 'https://example.org/old', reviewed_by = 'old-reviewer' WHERE id = 1");
    assert.equal((await seedQuestions(client)).updated, 1);
    const { rows: [approved] } = await client.query('SELECT * FROM public.questions WHERE id = 1');
    assert.equal(approved.verification_source_url, seeds[0].src); assert.equal(approved.reviewed_by, 'curated-seed');
    await client.query("UPDATE public.questions SET source_url = 'https://example.org/old', status = 'rejected', verified_at = NULL, reviewed_by = 'rejection-reviewer' WHERE id = 1");
    assert.equal((await seedQuestions(client)).updated, 1);
    const { rows: [rejected] } = await client.query('SELECT * FROM public.questions WHERE id = 1');
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reviewed_by, 'rejection-reviewer'); assert.equal(rejected.verified_at, null);
    await client.query('UPDATE public.questions SET status = $1, verified_at = $2, reviewed_by = $3 WHERE id = 1',
      [original.status, original.verified_at, original.reviewed_by]);
  });

  await t.test('mocked real SDK generates structured content; valid candidates persist pending and duplicates/invalids fail', async st => {
    const transport = st.mock.method(globalThis, 'fetch', async request => {
      const body = await request.json();
      assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.text.format.strict, true);
      assert.equal(body.provider.require_parameters, true);
      const text = JSON.stringify({ candidates: [candidate] });
      return Response.json({ id: 'resp_test', object: 'response', model: 'provider/model', status: 'completed',
        created_at: 0, completed_at: 1, error: null, incomplete_details: null,
        frequency_penalty: null, presence_penalty: null, temperature: null, top_p: null,
        instructions: null, metadata: null, parallel_tool_calls: false, tool_choice: 'auto', tools: [],
        output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }] }] });
    });
    const batch = await generateCandidates();
    assert.equal(transport.mock.callCount(), 1);
    transport.mock.restore();
    const result = await storeCandidates(client, [...batch.candidates, candidate, { ...candidate, answer: NaN }], batch.model);
    assert.equal(result.stored.length, 1); assert.equal(result.failures.length, 2);
    approvedId = result.stored[0].id;
    assert.ok(approvedId > Math.max(...seeds.map(row => row.id)));
    assert.equal(result.stored[0].status, 'pending'); assert.equal(result.stored[0].origin, 'ai');
    const second = await storeCandidates(client, [{ ...candidate, question: 'How many seconds are in exactly one minute?', unit: 'seconds', answer: 60 }], batch.model);
    rejectedId = second.stored[0].id;
    assert.equal((await getQuestions()).length, seeds.length);
    const pending = await listQuestions(client);
    assert.equal(pending.length, 2); assert.ok(pending.every(row => row.generated_at && !row.verified_at));
    await assert.rejects(challengeQuestion(approvedId, 100), { code: 'QUESTION_UNAVAILABLE' });
  });

  await t.test('approval requires independent matching evidence and atomic pending transitions; rejection is terminal', async () => {
    await assert.rejects(reviewQuestion(client, approvedId, 'approved', { ...evidence, independentlyVerified: false }), { code: 'INVALID_REVIEW' });
    await assert.rejects(reviewQuestion(client, approvedId, 'approved', { ...evidence, verifiedAnswer: 7 }), { code: 'ANSWER_MISMATCH' });
    const approved = await reviewQuestion(client, approvedId, 'approved', evidence);
    assert.equal(approved.status, 'approved'); assert.ok(approved.verified_at);
    const rejected = await reviewQuestion(client, rejectedId, 'rejected', { reviewer: evidence.reviewer, notes: 'Rejected after finding an incorrect proposed explanation.' });
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.verified_at, null);
    for (const id of [approvedId, rejectedId]) await assert.rejects(reviewQuestion(client, id, 'approved', evidence), { code: 'NOT_PENDING' });
    const [row] = (await listQuestions(client, 'approved')).filter(row => row.id === approvedId);
    assert.equal(row.reviewed_by, evidence.reviewer); assert.equal(row.verification_source_url, evidence.sourceUrl);
    const payload = await (await GET()).json();
    assert.equal(payload.questions.length, seeds.length + 1);
    assert.ok(payload.questions.some(row => row.id === approvedId)); assert.ok(!payload.questions.some(row => row.id === rejectedId));
    assert.ok(payload.questions.every(row => !('answer' in row) && !('explanation' in row) && !('origin' in row) && !('src' in row)));
    assert.deepEqual(await challengeQuestion(approvedId, 6), { success: false });
    const result = await challengeQuestion(approvedId, 7);
    assert.equal(result.answer, 6); assert.equal(result.question.src, evidence.sourceUrl);
    await assert.rejects(client.query("UPDATE public.questions SET status = 'approved' WHERE id = $1", [rejectedId]), { code: '23514' });
    const publicPool = (await getQuestions()).map(publicQuestion);
    assert.deepEqual(publicPool, payload.questions);
  });

  await t.test('provider failures and failed inserts leave playable questions available', async st => {
    const before = await getQuestions();
    st.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 503, message: 'private provider info' } }, { status: 503 }));
    await assert.rejects(generateCandidates(), /temporarily unavailable/);
    assert.deepEqual(await getQuestions(), before);
    const bad = { ...candidate, question: 'How many wheels are on a standard bicycle?', answer: 2 };
    await client.query("CREATE FUNCTION public.fail_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deliberate test failure'; END $$");
    await client.query('CREATE TRIGGER fail_candidate BEFORE INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION public.fail_candidate()');
    await assert.rejects(storeCandidates(client, [bad], 'provider/model'));
    await client.query('DROP TRIGGER fail_candidate ON public.questions');
    await client.query('DROP FUNCTION public.fail_candidate()');
    assert.deepEqual(await getQuestions(), before);
  });

  await t.test('no approved questions fail clearly and exact duplicate writes are constrained', async () => {
    const approvedIds = (await getQuestions()).map(row => row.id);
    await client.query("UPDATE public.questions SET status = 'rejected', verified_at = NULL");
    try {
      await assert.rejects(getQuestions(), { code: 'INVALID_QUESTIONS' });
      assert.equal((await GET()).status, 500);
    } finally {
      await client.query("UPDATE public.questions SET status = 'approved', verified_at = reviewed_at WHERE id = ANY($1::integer[])", [approvedIds]);
    }
    await assert.rejects(client.query("INSERT INTO public.questions (question, answer) VALUES ($1, 6)", [candidate.question.toUpperCase()]), { code: '23505' });
    assert.equal((await getQuestions()).length, seeds.length + 1);
  });

  await t.test('reset verifies the connected disposable target, recreates canonical schema, and seeds it', async () => {
    process.argv = [...process.argv, '--confirm-reset'];
    assert.deepEqual(await seedQuestions(client, { reset: true }), { inserted: 5, updated: 0, unchanged: 0 });
    await client.query(createSeedSQL());
    assert.equal((await getQuestions()).length, 5);
  });

  await t.test('concurrent generation transactions cannot insert the same pending question twice', async () => {
    const left = await appPool.connect(), right = await appPool.connect();
    try {
      const reports = await Promise.all([storeCandidates(left, [candidate], 'provider/model'), storeCandidates(right, [candidate], 'provider/model')]);
      assert.equal(reports.reduce((count, report) => count + report.stored.length, 0), 1);
      assert.equal(reports.reduce((count, report) => count + report.failures.length, 0), 1);
    } finally { left.release(); right.release(); }
  });

  await t.test('initialization refuses the previous structure and preserves its data', async () => {
    // This cluster belongs exclusively to this test. Simulate the old table in it.
    await client.query('DROP TABLE public.questions');
    await client.query("CREATE TABLE public.questions (id integer PRIMARY KEY, question text, answer numeric, status text DEFAULT 'draft')");
    await client.query("INSERT INTO public.questions VALUES (1, 'Legacy content', 1, 'verified')");
    await assert.rejects(applySchema(client), { code: '55000' });
    assert.equal((await client.query('SELECT question FROM public.questions')).rows[0].question, 'Legacy content');
  });
});
