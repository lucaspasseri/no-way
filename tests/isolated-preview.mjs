import { spawn } from 'node:child_process';
import { cp, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { temporaryPostgres } from './temporary-postgres.mjs';
import { seedQuestions } from '../db/seed.mjs';

// Do not inherit app configuration, real provider credentials or NODE_OPTIONS.
export function previewEnvironment(source, databaseURL, app) {
  const hostKeys = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec', 'USERPROFILE',
    'LANG', 'LC_ALL', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  return { ...Object.fromEntries(hostKeys.filter(key => source[key]).map(key => [key, source[key]])),
    NODE_ENV: 'development', DATABASE_URL: databaseURL, OPENROUTER_API_KEY: 'isolated-test-key',
    NO_WAY_TEST_AI: '1', NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `--import=${pathToFileURL(join(app, 'tests/mock-ai-provider.mjs')).href}` };
}

export async function startIsolatedPreview({ port = 0, quiet = false } = {}) {
  const db = await temporaryPostgres();
  const app = join(db.directory, 'app');
  let child, closing;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const stopped = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM');
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        try { await stopped; } finally { clearTimeout(timeout); }
      }
      await db.close();
    })();
    return closing;
  }
  try {
    await seedQuestions(db.pool);
    const root = resolve('.');
    for (const name of ['src', 'db', 'scripts', 'tests', 'public']) await cp(join(root, name), join(app, name), { recursive: true });
    for (const name of ['package.json', 'next.config.mjs', 'jsconfig.json']) await cp(join(root, name), join(app, name));
    await symlink(join(root, 'node_modules'), join(app, 'node_modules'), 'dir');
    if (!port) {
      const socket = createServer();
      await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
      port = socket.address().port;
      await new Promise(resolve => socket.close(resolve));
    }
    const baseURL = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: app, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: previewEnvironment(process.env, db.connectionString, app),
    });
    let startupError, output = '';
    child.on('error', error => { startupError = error; });
    if (quiet) for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-4000); });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Isolated preview exited before readiness. ${output}`);
      try {
        const response = await fetch(baseURL + '/icon.svg', { signal: AbortSignal.timeout(2000) });
        if (response.ok) return { baseURL, app, directory: db.directory, close, child };
      } catch { /* The server is still starting. */ }
      await pause(100);
    }
    throw new Error(`Isolated preview did not become ready. ${output}`);
  } catch (error) { await close(); throw error; }
}
