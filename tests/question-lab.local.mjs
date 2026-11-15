import { it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { temporaryPostgres } from './temporary-postgres.mjs';
import { createLabService } from '../src/server/question-lab.mjs';
import { defaultLabConfig } from '../src/features/lab/config.mjs';
import { labCandidates } from './fixtures/lab-candidates.mjs';
import { seedQuestions } from '../db/seed.mjs';

it('exercises private packs, quotas, atomic generation, expiry, reports and server challenges in isolated PostgreSQL', { timeout: 60000 }, async t => {
  const db = await temporaryPostgres();
  t.after(db.close);
  let offset = 0, calls = 0;
  let generator = async ({ count }) => { calls++; const candidates = labCandidates.slice(offset, offset + count); offset += count; return { candidates, model: 'test/model' }; };
  const service = createLabService({ pool: () => db.pool, options: async () => ({ categories: ['science', 'nature', 'mathematics'] }), generate: options => generator(options) });
  const owner = 'test-owner';
  let pack;
  await t.test('validates live categories but accepts custom topics and preserves canonical data', async () => {
    for (const config of [{ ...defaultLabConfig, count: 7 }, { ...defaultLabConfig, topicMode: 'categories', categories: ['unknown'] }]) {
      await assert.rejects(service.create(randomUUID(), owner, config), { code: 'INVALID_CONFIG' });
    }
    pack = await service.create(randomUUID(), owner, { ...defaultLabConfig, topicMode: 'custom', topic: 'Pokémon', knowledge: 'custom', challenge: 'Beginner knowledge' });
    assert.equal(pack.config.topic, 'Pokémon'); assert.equal(pack.status, 'generating');
    assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM public.questions')).rows[0].n, 0);
    const same = await service.create(pack.id, owner, pack.config); assert.equal(same.id, pack.id);
    assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM public.question_lab_packs')).rows[0].n, 1);
    await assert.rejects(service.get(pack.id, 'another-owner'), { code: 'PACK_UNAVAILABLE' });
    await assert.rejects(service.advance(pack.id, 'another-owner', 0), { code: 'PACK_UNAVAILABLE' });
  });
  await t.test('suppresses duplicate concurrent generation and makes stale retries idempotent', async () => {
    let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    const normal = generator;
    generator = async options => { started(); await new Promise(resolve => { release = resolve; }); return normal(options); };
    const first = service.advance(pack.id, owner, 0);
    await entered;
    await assert.rejects(service.advance(pack.id, owner, 0), { code: 'LAB_BUSY' });
    release(); pack = await first; generator = normal;
    assert.equal(pack.accepted, 2); assert.equal(pack.attempts, 1); assert.equal(calls, 1);
    assert.equal((await service.advance(pack.id, owner, 0)).accepted, 2); assert.equal(calls, 1);
    while (pack.status === 'generating') pack = await service.advance(pack.id, owner, pack.attempts);
    assert.equal(pack.accepted, 10); assert.equal(pack.status, 'ready');
    assert.ok(pack.questions.every(question => !('answer' in question) && !('explanation' in question) && question.status === 'generated'));
    assert.equal((await service.advance(pack.id, owner, pack.attempts)).accepted, 10); assert.equal(calls, 5);
  });
  await t.test('uses normal challenge rules and reveals unverified evidence only on success', async () => {
    assert.deepEqual(await service.challenge(pack.id, owner, 1, 8), { success: false });
    const result = await service.challenge(pack.id, owner, 1, 9);
    assert.equal(result.answer, 8); assert.equal(result.question.verification, 'unverified');
    assert.equal(result.question.status, 'generated'); assert.match(result.question['src-label'], /not checked/);
    await assert.rejects(service.challenge(pack.id, 'another-owner', 1, 9), { code: 'PACK_UNAVAILABLE' });
    await assert.rejects(service.challenge(pack.id, owner, 20, 9), { code: 'PACK_UNAVAILABLE' });
    await assert.rejects(service.challenge(pack.id, owner, 1, '9'), { code: 'INVALID_CHALLENGE' });
    await service.report(pack.id, owner, 1);
    assert.deepEqual((await service.report(pack.id, owner, 1)).reported, [1]);
  });
  await t.test('keeps partial results and enforces personal hourly caps', async () => {
    const second = await service.create(randomUUID(), owner, defaultLabConfig);
    const data = { questions: [{ ...labCandidates[11], id: 1, status: 'generated' }], attempts: 1, rejected: 4, status: 'generating', lastError: null, reports: [] };
    await db.pool.query('UPDATE public.question_lab_packs SET data=$2::jsonb WHERE id=$1', [second.id, JSON.stringify(data)]);
    assert.equal((await service.finish(second.id, owner)).status, 'partial');
    assert.equal((await service.get(second.id, owner)).accepted, 1);
    await service.create(randomUUID(), owner, defaultLabConfig);
    await assert.rejects(service.create(randomUUID(), owner, defaultLabConfig), { code: 'LAB_RATE_LIMIT' });
  });
  await t.test('enforces global quotas even when cookies change and keeps expired packs private', async () => {
    for (let i = 0; i < 9; i++) await service.create(randomUUID(), `owner-${i}`, defaultLabConfig);
    await assert.rejects(service.create(randomUUID(), 'fresh-cookie', defaultLabConfig), { code: 'LAB_RATE_LIMIT' });
    await db.pool.query("UPDATE public.question_lab_packs SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1", [pack.id]);
    await assert.rejects(service.get(pack.id, owner), { code: 'PACK_UNAVAILABLE' });
    await assert.rejects(service.challenge(pack.id, owner, 1, 9), { code: 'PACK_UNAVAILABLE' });
  });
  await t.test('does not contaminate curated gameplay or promote candidate status', async () => {
    await seedQuestions(db.pool);
    const rows = (await db.pool.query('SELECT DISTINCT status FROM public.questions')).rows;
    assert.deepEqual(rows, [{ status: 'curated' }]);
    assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM public.questions')).rows[0].n, 200);
    const { rows: [{ data }] } = await db.pool.query('SELECT data FROM public.question_lab_packs WHERE id=$1', [pack.id]);
    assert.ok(data.questions.every(question => question.status === 'generated' && question.verification === 'unverified'));
  });
});
