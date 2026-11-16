import { createHash } from 'node:crypto';
import { getTracePool } from './openrouter-traces.mjs';
import { sanitizePublicDetails } from '../src/features/lab/diagnostics.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function cooldownNamespace(key = process.env.OPENROUTER_API_KEY) { return key?.trim() ? hash(key.trim()) : null; }
export function requestScope(models) { return hash(JSON.stringify(models)); }
const unavailable = () => Object.assign(new Error('The lab cannot check AI availability. Please try again later.'), { code: 'LAB_COOLDOWN_UNAVAILABLE' });

/** Uses independent autocommit queries: a pack rollback cannot erase a limit.
 * The existing bounded diagnostics pool supplies connections, not trace rows. */
export function createCooldownStore(pool = getTracePool) {
  async function query(text, values) {
    try { return await pool().query({ text, values, query_timeout: 1000 }); }
    catch { throw unavailable(); }
  }
  return {
    async active(namespace, route, now = Date.now()) {
      if (!namespace) return [];
      const { rows } = await query(`SELECT scope, target, expires_at, details FROM public.openrouter_cooldowns
        WHERE credential_hash=$1 AND expires_at > $2::timestamptz AND (scope <> 'request' OR target=$3)`, [namespace, new Date(now).toISOString(), route]);
      return rows.map(row => ({ scope: row.scope, model: row.scope === 'model' ? row.target : null,
        until: new Date(row.expires_at).toISOString(), details: sanitizePublicDetails(row.details), timing: row.details?.rateLimit?.timing ?? 'provider' }));
    },
    async put(namespace, route, cooldown, details) {
      if (!namespace) return;
      const target = cooldown.scope === 'model' ? cooldown.model : cooldown.scope === 'request' ? route : '';
      await query(`INSERT INTO public.openrouter_cooldowns(credential_hash,scope,target,expires_at,details)
        VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (credential_hash,scope,target) DO UPDATE
        SET expires_at=GREATEST(openrouter_cooldowns.expires_at,EXCLUDED.expires_at),
          details=CASE WHEN EXCLUDED.expires_at >= openrouter_cooldowns.expires_at THEN EXCLUDED.details ELSE openrouter_cooldowns.details END,
          updated_at=CURRENT_TIMESTAMP`, [namespace, cooldown.scope, target, cooldown.until, JSON.stringify(sanitizePublicDetails(details))]);
    },
  };
}
export async function cleanupCooldowns(client, limit = 1000) {
  const result = await client.query(`DELETE FROM public.openrouter_cooldowns WHERE expires_at <= CURRENT_TIMESTAMP AND (credential_hash,scope,target) IN
    (SELECT credential_hash,scope,target FROM public.openrouter_cooldowns WHERE expires_at <= CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1)`, [limit]);
  return result.rowCount;
}
