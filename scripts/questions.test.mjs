import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let generate;
mock.module('../db/generate-questions.mjs', { namedExports: { generateCandidates: options => generate(options) } });
const { runQuestions } = await import('./questions.mjs');

it('runs operator listing with a controlled connection and always releases it', async () => {
  let released = false;
  const rows = [{ id: 11, status: 'generated', answer: '6' }];
  const result = await runQuestions(['list'], async () => ({
    query: async (_sql, values) => { assert.deepEqual(values, ['generated']); return { rows }; },
    release: () => { released = true; },
  }));
  assert.deepEqual(result, rows); assert.ok(released);
});

it('provider and usage failures do not open a database connection', async () => {
  let connected = false;
  const connect = () => { connected = true; throw new Error('must not connect'); };
  generate = async () => { throw new Error('sanitized provider failure'); };
  await assert.rejects(runQuestions(['generate', '--count', '1'], connect), /provider failure/);
  for (const args of [[], ['unknown'], ['approve'], ['reject', '-1'], ['list', 'extra']]) await assert.rejects(runQuestions(args, connect));
  assert.equal(connected, false);
});

it('the generation CLI fails safely with no API key and does not print credentials or raw errors', () => {
  const result = spawnSync(process.execPath, ['scripts/questions.mjs', 'generate'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
    env: { ...process.env, OPENROUTER_API_KEY: '', DATABASE_URL: 'postgres://private-password@private-host/private-db' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPENROUTER_API_KEY is not set/);
  assert.ok(!result.stderr.includes('private-password')); assert.equal(result.stdout, '');
});

it('saves offline AI candidates for the manifest pipeline without opening a database or overwriting a file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'offline-ai-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'candidates.json');
  const candidates = [{ question: 'Test candidate retained without any factual approval.' }];
  generate = async () => ({ candidates, model: 'test/model' });
  const connect = () => { throw new Error('Offline generation must not connect.'); };
  const result = await runQuestions(['generate', '--offline', '--file', file], connect);
  assert.equal(result.status, 'generated');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), candidates);
  await assert.rejects(runQuestions(['generate', '--offline', '--file', file], connect), { code: 'EEXIST' });
});
