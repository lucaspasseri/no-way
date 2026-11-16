import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

try {
  const output = resolve(process.argv[2] || 'db/exports/schema.sql');
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const labSchema = await readFile(new URL('./lab-schema.sql', import.meta.url), 'utf8');
  const traceSchema = await readFile(new URL('./openrouter-traces-schema.sql', import.meta.url), 'utf8');
  const cooldownSchema = await readFile(new URL('./openrouter-cooldowns-schema.sql', import.meta.url), 'utf8');
  const sql = `-- Destructive export: executing this file replaces the questions table and its data.
BEGIN;
DROP TABLE IF EXISTS public.questions;

${schema}
${labSchema}
${traceSchema}
${cooldownSchema}
COMMIT;
`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql, 'utf8');
  console.log(`Schema SQL written to ${output}`);
} catch (error) {
  console.error('Schema SQL export failed:', error.message);
  process.exitCode = 1;
}
