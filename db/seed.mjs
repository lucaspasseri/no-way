import { pathToFileURL } from 'node:url';
import questions from './seed/questions.json' with { type: 'json' };
import { validateBank } from './question-lifecycle.mjs';
import { getPool } from './pool.mjs';
import { applySchema, assertQuestionSchema } from './schema.mjs';
import { createSeedSQL } from './export-seed.mjs';
import { assertResetAllowed, verifyResetTarget } from './reset-safety.mjs';
export { assertResetAllowed } from './reset-safety.mjs';

export async function seedQuestions(client, { reset = false, bank = questions } = {}) {
  validateBank(bank);
  if (reset) { assertResetAllowed(); await verifyResetTarget(client); }
  await client.query('BEGIN');
  try {
    if (reset) {
      await client.query('DROP TABLE IF EXISTS public.questions');
      await applySchema(client);
    }
    await assertQuestionSchema(client);
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: [{ count }] } = await client.query('SELECT count(*)::integer AS count FROM public.questions');
    await client.query(createSeedSQL(bank, { status: 'all', transaction: false }));
    const { rows: [{ count: after }] } = await client.query('SELECT count(*)::integer AS count FROM public.questions');
    await client.query('COMMIT');
    return { inserted: after - count, updated: 0, unchanged: bank.length - (after - count) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool, client;
  try { pool = getPool(); client = await pool.connect(); console.log('Question seed complete:', await seedQuestions(client)); }
  catch (error) {
    console.error(error.code === 'QUESTION_SCHEMA_MISMATCH' ? error.message
      : 'Seed failed; changes rolled back. Review schema and dataset conflicts.', { code: error.code || 'SEED_ERROR' });
    process.exitCode = 1;
  }
  finally { client?.release(); await pool?.end(); }
}
