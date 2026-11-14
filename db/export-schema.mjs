import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

try {
  const output = resolve(process.argv[2] || 'db/exports/schema.sql');
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql, 'utf8');
  console.log(`Schema SQL written to ${output}`);
} catch (error) {
  console.error('Schema SQL export failed:', error.message);
  process.exitCode = 1;
}
