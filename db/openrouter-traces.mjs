// Node-only diagnostics repository. No player-facing read endpoint exists.
import pg from 'pg';

let tracePool;
export function getTracePool() {
  if (tracePool) return tracePool;
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Diagnostics database unavailable.'), { code: 'DATABASE_URL_MISSING' });
  if (process.env.NODE_ENV === 'development' && globalThis.__noWayTracePostgresPool) return tracePool = globalThis.__noWayTracePostgresPool;
  // Independent of the pack transaction: diagnostic rows survive its rollback.
  // A small, bounded pool avoids waiting behind long-running generation locks.
  tracePool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2,
    connectionTimeoutMillis: 750, statement_timeout: 750, query_timeout: 1000,
    idleTimeoutMillis: 10000, allowExitOnIdle: true });
  tracePool.on('error', () => console.error('OpenRouter trace connection failed.'));
  if (process.env.NODE_ENV === 'development') globalThis.__noWayTracePostgresPool = tracePool;
  return tracePool;
}
export async function closeTracePool() { const current = tracePool; tracePool = undefined; if (globalThis.__noWayTracePostgresPool === current) delete globalThis.__noWayTracePostgresPool; await current?.end(); }
export function retentionDays(value = process.env.OPENROUTER_TRACE_RETENTION_DAYS) {
  const days = Number(value ?? 14);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : 14;
}
export async function saveTrace(trace, client = getTracePool()) {
  const expiresAt = new Date(Date.parse(trace.startedAt) + retentionDays() * 86400000).toISOString();
  await client.query(`INSERT INTO public.openrouter_request_traces
    (id, pack_id, batch_number, attempt_number, http_attempt_number, started_at, completed_at, duration_ms,
      environment, outcome, requested_model, response_model, http_status, error_category, details, expires_at, event_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
    ON CONFLICT (id) DO UPDATE SET completed_at=EXCLUDED.completed_at, duration_ms=EXCLUDED.duration_ms,
      outcome=EXCLUDED.outcome, response_model=EXCLUDED.response_model, http_status=EXCLUDED.http_status,
      error_category=EXCLUDED.error_category, details=EXCLUDED.details, updated_at=CURRENT_TIMESTAMP`,
  [trace.id, trace.packId, trace.batchNumber, trace.attemptNumber, trace.httpAttemptNumber, trace.startedAt,
    trace.completedAt, trace.durationMs, trace.environment, trace.outcome, trace.request.models[0],
    trace.response?.model ?? null, trace.http?.status ?? null, trace.error?.category ?? null, JSON.stringify(trace), expiresAt, trace.eventType ?? 'http_request']);
}

/** Filter values are validated by the operator CLI and bound, never interpolated. */
export async function listTraces(client, { id = null, pack = null, status = null, model = null, error = null, since = null, until = null, httpStatus = null, limit = 30, groupByPack = false } = {}) {
  const where = `expires_at > CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR id=$1)
    AND ($2::uuid IS NULL OR pack_id=$2) AND ($3::text IS NULL OR outcome=$3)
    AND ($4::text IS NULL OR requested_model=$4 OR response_model=$4 OR details->'request'->'models' ? $4 OR details->'recovery'->'originalModels' ? $4)
    AND ($5::text IS NULL OR error_category=$5) AND ($6::timestamptz IS NULL OR started_at >= $6)
    AND ($7::timestamptz IS NULL OR started_at <= $7) AND ($9::integer IS NULL OR http_status=$9)`;
  const select = groupByPack
    ? `pack_id AS "packId", count(*) FILTER (WHERE event_type='http_request')::integer AS requests, min(started_at) AS first, max(started_at) AS last,
        count(*) FILTER (WHERE error_category IS NOT NULL)::integer AS failures`
    : id ? 'details' : `id, event_type AS "eventType", pack_id AS "packId", batch_number AS batch, attempt_number AS attempt,
        started_at AS "startedAt", duration_ms AS "durationMs", outcome, http_status AS "httpStatus",
        requested_model AS "requestedModel", response_model AS "responseModel", error_category AS "errorCategory"`;
  const { rows } = await client.query(`SELECT ${select} FROM public.openrouter_request_traces WHERE ${where}
    ${groupByPack ? 'GROUP BY pack_id ORDER BY max(started_at) DESC' : 'ORDER BY started_at DESC'} LIMIT $8`,
  [id, pack, status, model, error, since, until, limit, httpStatus]);
  return id ? rows[0]?.details ?? null : rows;
}
export async function cleanupTraces(client, limit = 1000) {
  const result = await client.query(`DELETE FROM public.openrouter_request_traces WHERE id IN
    (SELECT id FROM public.openrouter_request_traces WHERE expires_at <= CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1)`, [limit]);
  return result.rowCount;
}

export async function recoveryHistory(client, id) {
  const { rows } = await client.query(`SELECT details FROM public.openrouter_request_traces
    WHERE expires_at > CURRENT_TIMESTAMP AND details#>>'{recovery,id}'=$1
    ORDER BY started_at, http_attempt_number NULLS FIRST LIMIT 32`, [id]);
  const records = rows.map(row => row.details), summary = records.at(-1)?.recovery;
  return summary ? { generation: id, requestedModels: summary.originalModels, finalModel: summary.successfulModel,
    outcome: summary.outcome, providerCalls: records.filter(row => (row.eventType ?? 'http_request') === 'http_request').length,
    decisions: summary.steps, attempts: records.map(row => ({ id: row.id, eventType: row.eventType ?? 'http_request',
      attempt: row.attemptNumber, model: row.request.models[0], httpStatus: row.http?.status ?? null,
      durationMs: row.durationMs, errorCategory: row.error?.category ?? null, parsing: row.parsing, validation: row.validation })) } : null;
}
