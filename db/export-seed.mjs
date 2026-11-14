import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import questions from './seed/questions.json' with { type: 'json' };
import { validateQuestions } from '../src/features/game/validate-questions.mjs';
import { questionValues, upsertQuestionSQL, syncQuestionSequenceSQL } from './seed-statements.mjs';

/** Generate portable seed SQL without opening a database connection.
 * @param {import('../src/features/game/game-rules.mjs').Question[]} bank
 */
export function createSeedSQL(bank = questions) {
  validateQuestions(bank);
  const ordered = [...bank].sort((a, b) => a.id - b.id);
  const inserts = ordered.map(question => {
    const values = questionValues(question);
    return upsertQuestionSQL.trim().replace(/\$(\d+)/g, (_, index) => {
      const value = values[Number(index) - 1];
      if (value === null) return 'NULL';
      return typeof value === 'number' ? String(value) : pg.escapeLiteral(value);
    }) + ';';
  });

  return `-- Generated from db/seed/questions.json. Execute schema.sql first.
BEGIN;
LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE;

DO $seed_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.questions WHERE id IN (${ordered.map(question => question.id).join(', ')}) AND origin <> 'seed') THEN
    RAISE EXCEPTION 'Seed IDs conflict with non-seed questions. No data was changed.';
  END IF;
END;
$seed_guard$;

${inserts.join('\n\n')}

${syncQuestionSequenceSQL};
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = resolve(process.argv[2] || 'db/exports/seed.sql');
    const sql = createSeedSQL();
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, sql, 'utf8');
    console.log(`Seed SQL written to ${output}`);
  } catch (error) {
    console.error('Seed SQL export failed:', error.message);
    process.exitCode = 1;
  }
}
