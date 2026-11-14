import { pathToFileURL } from 'node:url';
import questions from './seed/questions.json' with { type: 'json' };
import { validateQuestions } from '../src/features/game/validate-questions.mjs';
import { getPool } from './pool.mjs';
import { applySchema } from './schema.mjs';
import { questionValues, upsertQuestionSQL, syncQuestionSequenceSQL } from './seed-statements.mjs';
import { assertResetAllowed, verifyResetTarget } from './reset-safety.mjs';

export { assertResetAllowed } from './reset-safety.mjs';

/** One transaction for writing and verifying the bank; reset is always guarded. */
export async function seedQuestions(client, { reset = false, bank = questions } = {}) {
  if (reset) { assertResetAllowed(); await verifyResetTarget(client); }
  validateQuestions(bank);
  await client.query('BEGIN');
  try {
    if (reset) {
      // No CASCADE: refuse to destroy unrelated tables or dependent structures.
      await client.query('DROP TABLE IF EXISTS public.questions');
      await applySchema(client);
    }
    // Serialize the short seed operation against other writers; reads still work.
    await client.query('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE');
    const ids = bank.map(question => question.id);
    const { rows: existing } = await client.query('SELECT id, origin FROM public.questions WHERE id = ANY($1::integer[])', [ids]);
    if (existing.some(row => row.origin !== 'seed')) {
      throw Object.assign(new Error('Seed IDs conflict with non-seed questions. No data was changed.'), { code: 'SEED_ID_CONFLICT' });
    }
    const existingIds = new Set(existing.map(row => row.id));
    const counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const question of bank) {
      const { rowCount } = await client.query(upsertQuestionSQL, questionValues(question));
      if (!rowCount) counts.unchanged++;
      else if (existingIds.has(question.id)) counts.updated++;
      else counts.inserted++;
    }

    const { rows: stored } = await client.query(`
      SELECT id, question, answer::text AS answer, category, source_label, source_url, answer_context, unit, difficulty, reference_date::text AS reference_date
      FROM public.questions WHERE id = ANY($1::integer[]) ORDER BY id`, [ids]);
    const expected = [...bank].sort((a, b) => a.id - b.id).map(question => ({
      id: question.id, question: question.question, answer: String(question.answer), category: question.category ?? null,
      source_label: question['src-label'] ?? null, source_url: question.src ?? null, answer_context: question.explanation ?? null,
      unit: question.unit ?? null, difficulty: question.difficulty ?? 'medium', reference_date: question.referenceDate ?? null,
    }));
    // Compare numerical values without requiring PostgreSQL to retain JSON number formatting.
    if (stored.length !== expected.length || stored.some((row, index) =>
      Object.keys(expected[index]).some(key => key === 'answer'
        ? Number(row[key]) !== Number(expected[index][key]) : row[key] !== expected[index][key]))) {
      throw Object.assign(new Error('Seed verification failed. No data was changed.'), { code: 'SEED_VERIFICATION_FAILED' });
    }
    // Preserve the identity high-water mark as well as IDs already in the table.
    await client.query(syncQuestionSequenceSQL);
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  let client;
  try {
    pool = getPool();
    client = await pool.connect();
    console.log('Question seed complete:', await seedQuestions(client));
  } catch (error) {
    console.error('Seed failed; question changes were rolled back. Check the schema, connection, and seed ID ownership.', { code: error.code || 'SEED_ERROR' });
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool?.end();
  }
}
