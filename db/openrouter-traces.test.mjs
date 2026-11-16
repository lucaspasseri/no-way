import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retentionDays, saveTrace, listTraces, cleanupTraces } from './openrouter-traces.mjs';

it('installs an additive private trace table without deleting packs or canonical data', async () => {
  const sql = await readFile(new URL('./openrouter-traces-schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS/); assert.match(sql, /PRIMARY KEY/);
  assert.match(sql, /REVOKE ALL.*FROM PUBLIC/); assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE|DELETE|REFERENCES/);
  assert.match(sql, /event_type='recovery_decision' AND http_attempt_number IS NULL/);
});
it('bounds retention configuration and upserts one durable row per HTTP trace ID', async t => {
  const previous = process.env.OPENROUTER_TRACE_RETENTION_DAYS;
  t.after(() => { if (previous === undefined) delete process.env.OPENROUTER_TRACE_RETENTION_DAYS; else process.env.OPENROUTER_TRACE_RETENTION_DAYS = previous; });
  for (const value of ['garbage','0','91','-1','1.5']) assert.equal(retentionDays(value), 14);
  assert.equal(retentionDays('30'), 30); assert.equal(retentionDays('1'), 1);
  process.env.OPENROUTER_TRACE_RETENTION_DAYS = '14';
  const row = { id: '566b922f-c27a-4eb9-af14-5c588660c379', packId: 'fd9bb53d-0a78-420c-af29-47af9adce782',
    batchNumber: 1, attemptNumber: 1, httpAttemptNumber: 1, startedAt: '2026-11-15T12:00:00Z', completedAt: null, durationMs: null,
    environment: 'production', outcome: 'in_flight', request: { models: ['provider/primary','provider/backup'] } };
  let calls = 0;
  const client = { query: async (sql, values) => {
    calls++; assert.match(sql,/ON CONFLICT \(id\) DO UPDATE/); assert.equal(values[0], row.id);
    assert.equal(values[15], '2026-11-29T12:00:00.000Z'); assert.deepEqual(JSON.parse(values[14]).request.models, row.request.models);
  } };
  await saveTrace(row, client); await saveTrace({ ...row, outcome: 'accepted' }, client); assert.equal(calls, 2);
});
it('binds all inspection filters and removes only expired traces in bounded batches', async () => {
  const hostileModel = "provider/model' OR true; --";
  await listTraces({ query: async (sql, values) => {
    assert.doesNotMatch(sql, /OR true/); assert.ok(values.includes(hostileModel));
    assert.match(sql, /expires_at > CURRENT_TIMESTAMP/); assert.match(sql, /http_status=\$9/);
    return { rows: [] };
  } }, { model: hostileModel, httpStatus: 429 });
  assert.equal(await cleanupTraces({ query: async (sql, values) => {
    assert.match(sql, /expires_at <= CURRENT_TIMESTAMP/); assert.match(sql, /LIMIT \$1/); assert.deepEqual(values,[10]);
    return { rowCount: 3 };
  } },10),3);
});
