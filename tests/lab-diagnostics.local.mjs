import { it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { temporaryPostgres } from './temporary-postgres.mjs';
import { createLabService } from '../src/server/question-lab.mjs';
import { defaultLabConfig } from '../src/features/lab/config.mjs';
import { dailyQuotaResponse, openrouterResponse } from './fixtures/openrouter-responses.mjs';
import { labCandidates } from './fixtures/lab-candidates.mjs';

it('persists daily cooldown across players and service instances, retains questions, and releases only after expiry', { timeout: 60000 }, async t => {
  const db = await temporaryPostgres(); t.after(db.close);
  const key = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'isolated-diagnostics-key';
  t.after(() => { if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key; });
  // Deliberately leave trace persistence unconfigured: the quota guard must
  // remain durable even when optional operator diagnostics cannot be written.
  t.mock.method(console, 'warn', () => {});
  let limited = false;
  const fetch = t.mock.method(globalThis, 'fetch', async () => limited
    ? Response.json(dailyQuotaResponse(new Date(Date.now() + 3600000).toISOString()), { status: 429 })
    : Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0, 2) }))));
  const service = () => createLabService({ pool: () => db.pool, options: async () => ({ categories: ['science'] }) });
  const first = service(), second = service();
  let pack = await first.create(randomUUID(), 'first-owner', defaultLabConfig);
  const other = await second.create(randomUUID(), 'second-owner', defaultLabConfig);
  pack = await first.advance(pack.id, 'first-owner', 0);
  assert.equal(pack.accepted, 2);
  limited = true;
  pack = await first.advance(pack.id, 'first-owner', 1);
  assert.equal(pack.accepted, 2); assert.equal(pack.attempts, 2); assert.equal(pack.errorDetails.category, 'daily_quota');
  const calls = fetch.mock.callCount();
  assert.equal((await second.advance(pack.id, 'first-owner', 2)).attempts, 2);
  await assert.rejects(second.advance(other.id, 'second-owner', 0), { code: 'AI_DAILY_COOLDOWN' });
  await assert.rejects(service().create(randomUUID(), 'new-owner', defaultLabConfig), error => {
    assert.equal(error.code, 'AI_DAILY_COOLDOWN');
    assert.equal(error.details.request.attemptNumber, null); assert.equal(error.details.models.primary, null);
    assert.equal(error.details.referenceId, undefined); assert.equal(error.details.rateLimit.remaining, 0); return true;
  });
  assert.equal(fetch.mock.callCount(), calls);
  assert.equal((await second.get(other.id, 'second-owner')).attempts, 0);
  assert.equal((await second.finish(pack.id, 'first-owner')).accepted, 2);
  await assert.rejects(first.create(randomUUID(), 'another-owner', defaultLabConfig), { code: 'AI_DAILY_COOLDOWN' });
  // Retention cleanup must not drop an active restriction with an expired pack.
  await db.pool.query("UPDATE public.question_lab_packs SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1", [pack.id]);
  await assert.rejects(first.create(randomUUID(), 'another-owner', defaultLabConfig), { code: 'AI_DAILY_COOLDOWN' });
  await db.pool.query(`UPDATE public.question_lab_packs SET data=jsonb_set(jsonb_set(data,
    '{errorDetails,rateLimit,resetAt}', '"2020-01-01T00:00:00.000Z"'),
    '{errorDetails,rateLimit,retryAt}', '"2020-01-01T00:00:00.000Z"') WHERE id=$1`, [pack.id]);
  limited = false;
  const afterReset = await service().create(randomUUID(), 'after-reset-owner', defaultLabConfig);
  const generated = await service().advance(afterReset.id, 'after-reset-owner', 0);
  assert.equal(generated.accepted, 2); assert.equal(fetch.mock.callCount(), calls + 1);
  assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM public.questions')).rows[0].n, 0);
});
