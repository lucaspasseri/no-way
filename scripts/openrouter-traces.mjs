// Operator shell + trusted database credentials are the authorization boundary.
// Never import this inspection tool into a route or a Client Component.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { getPool } from '../db/pool.mjs';
import { cleanupTraces, listTraces, recoveryHistory } from '../db/openrouter-traces.mjs';
import { cleanupCooldowns } from '../db/openrouter-cooldowns.mjs';

const outcomes = ['in_flight','http_received','http_error','response_parsed','failed','accepted','partial_validation','validation_failed','empty_batch','transport_error','cooldown_skipped','recovery_stopped'];
const date = value => value === undefined ? null : z.iso.datetime({ offset: true }).parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00Z' : value);
export async function runTraceCommand(args, connect = () => getPool().connect()) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    pack: { type: 'string' }, status: { type: 'string' }, model: { type: 'string' }, error: { type: 'string' },
    since: { type: 'string' }, until: { type: 'string' }, limit: { type: 'string' },
    'http-status': { type: 'string' }, 'group-by': { type: 'string' },
  } });
  const [command, id, ...extra] = positionals;
  if (!['list','show','cleanup','recovery','cleanup-cooldowns'].includes(command) || extra.length || (['show','recovery'].includes(command) ? !z.uuid().safeParse(id).success : id !== undefined)) {
    throw new Error('Use openrouter:traces list [--pack UUID] [--status OUTCOME] [--http-status CODE] [--model MODEL] [--error CATEGORY] [--since ISO] [--until ISO] [--limit 1..1000] [--group-by pack], show UUID, recovery UUID, cleanup, or cleanup-cooldowns [--limit 1..1000].');
  }
  const options = { id: id ?? null, pack: values.pack ? z.uuid().parse(values.pack) : null,
    status: values.status ? z.enum(outcomes).parse(values.status) : null,
    model: values.model ? z.string().min(1).max(200).parse(values.model) : null,
    error: values.error ? z.string().regex(/^[a-z_]{1,50}$/).parse(values.error) : null,
    httpStatus: values['http-status'] ? z.coerce.number().int().min(100).max(599).parse(values['http-status']) : null,
    since: date(values.since), until: date(values.until), limit: z.coerce.number().int().min(1).max(1000).parse(values.limit ?? (command === 'cleanup' ? '1000' : '30')),
    groupByPack: values['group-by'] === 'pack' };
  if (values['group-by'] && !options.groupByPack) throw new Error('Use --group-by pack.');
  if (options.since && options.until && Date.parse(options.since) > Date.parse(options.until)) throw new Error('The start date must precede the end date.');
  const cleanup = command.startsWith('cleanup');
  if (cleanup && Object.keys(values).some(key => key !== 'limit')) throw new Error('Cleanup accepts only --limit; it removes expired records only.');
  const client = await connect();
  try {
    await client.query(cleanup ? 'BEGIN' : 'BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3s'");
    const result = command === 'cleanup' ? { removed: await cleanupTraces(client, options.limit) }
      : command === 'cleanup-cooldowns' ? { removed: await cleanupCooldowns(client, options.limit) }
      : command === 'recovery' ? await recoveryHistory(client, id) : await listTraces(client, options);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    const result = await runTraceCommand(process.argv.slice(2), () => { pool = getPool(); return pool.connect(); });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Trace inspection failed. Check arguments, trusted database access, and installation (npm run db:traces). See docs/openrouter-tracing.md.');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
