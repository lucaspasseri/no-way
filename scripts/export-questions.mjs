import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import questions from '../db/seed/questions.json' with { type: 'json' };
import { createSeedSQL } from '../db/export-seed.mjs';

export async function exportQuestions(args) {
  const { values } = parseArgs({ args, options: { status: { type: 'string', default: 'curated' }, input: { type: 'string' },
    'promote-validated': { type: 'boolean', default: false } } });
  const bank = values.input ? JSON.parse(await readFile(values.input, 'utf8')) : questions;
  return createSeedSQL(bank, { status: values.status, promoteValidated: values['promote-validated'] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await exportQuestions(process.argv.slice(2))); }
  catch (error) { console.error('Question SQL export failed:', error.message); process.exitCode = 1; }
}
