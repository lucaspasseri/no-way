// Run manually for browser QA: node --import ./tests/register.mjs tests/lab-preview.mjs
// Copies source into an isolated temporary app, avoiding .env, the main .next,
// and existing databases. SIGINT/SIGTERM tear down everything owned here.
import { spawn } from 'node:child_process';
import { cp, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { temporaryPostgres } from './temporary-postgres.mjs';
import { seedQuestions } from '../db/seed.mjs';

const db = await temporaryPostgres();
const root = resolve('.');
const app = join(db.directory, 'app');
await seedQuestions(db.pool);
for (const name of ['src', 'db', 'scripts', 'tests', 'public']) await cp(join(root, name), join(app, name), { recursive: true });
for (const name of ['package.json', 'next.config.mjs', 'jsconfig.json']) await cp(join(root, name), join(app, name));
await symlink(join(root, 'node_modules'), join(app, 'node_modules'), 'dir');
const port = process.env.LAB_PREVIEW_PORT || '3107';
const state = { baseURL: `http://127.0.0.1:${port}`, app };
await writeFile('/tmp/no-way-lab-preview.json', JSON.stringify(state));
console.log(JSON.stringify(state));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', port], {
  cwd: app, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: db.connectionString,
    OPENROUTER_API_KEY: 'isolated-test-key', NO_WAY_TEST_AI: '1', NODE_OPTIONS: `--import=${join(app, 'tests/mock-ai-provider.mjs')}` },
});
let closing = false;
async function close() {
  if (closing) return; closing = true;
  if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  await db.close();
}
process.on('SIGINT', () => close().then(() => process.exit()));
process.on('SIGTERM', () => close().then(() => process.exit()));
child.on('exit', () => close());
