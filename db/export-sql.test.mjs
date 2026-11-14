import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import questions from './seed/questions.json' with { type: 'json' };
import { createSeedSQL } from './export-seed.mjs';

it('exports schema and seed files to custom directories without database configuration', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'no-way-sql-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { ...process.env };
  delete env.DATABASE_URL;
  for (const kind of ['schema', 'seed']) {
    const output = join(directory, 'nested', `${kind}.sql`);
    const script = fileURLToPath(new URL(`./export-${kind}.mjs`, import.meta.url));
    const result = spawnSync(process.execPath, [script, output], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const expected = kind === 'schema' ? await readFile(new URL('./schema.sql', import.meta.url), 'utf8') : createSeedSQL();
    assert.equal(await readFile(output, 'utf8'), expected);
  }
});

it('escapes apostrophes, backslashes, and SQL-looking text while preserving metadata and numeric precision', () => {
  const sql = createSeedSQL([{ id: 1, question: "What's C:\\data?'); DROP TABLE questions; --", answer: '149.600',
    category: "It's science", explanation: 'A \\ path', 'src-label': "Reader's guide", src: 'https://example.com' }]);
  assert.ok(sql.includes("E'What''s C:\\\\data?''); DROP TABLE questions; --'"));
  assert.ok(sql.includes("'149.600'::numeric"));
  assert.ok(sql.includes("'It''s science'"));
  assert.ok(sql.includes("'Reader''s guide'"));
  assert.ok(sql.includes("E'A \\\\ path'"));
  assert.ok(sql.includes("'https://example.com'"));
  assert.ok(sql.endsWith('COMMIT;\n'));
});

it('generates deterministic SQL for every seed question with repeat-safe ownership and sequence handling', () => {
  const sql = createSeedSQL();
  assert.equal(createSeedSQL([...questions].reverse()), sql);
  assert.equal((sql.match(/INSERT INTO public\.questions/g) || []).length, questions.length);
  assert.ok(sql.includes("origin <> 'seed'"));
  assert.ok(sql.includes("WHERE questions.origin = 'seed'"));
  assert.ok(sql.includes('IS DISTINCT FROM'));
  assert.ok(sql.includes('setval'));
  assert.doesNotMatch(sql, /\$[1-7]\b/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/);
});

it('rejects invalid seed data before producing a SQL file', () => {
  assert.throws(() => createSeedSQL([]), /No valid questions/);
  assert.throws(() => createSeedSQL([{ ...questions[0], answer: 'Infinity' }]), /No valid questions/);
});
