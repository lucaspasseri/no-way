import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import { applySchema } from '../db/schema.mjs';

export async function temporaryPostgres() {
  const bin = process.env.PG_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const directory = await mkdtemp(join(tmpdir(), 'no-way-lab-test-'));
  const data = join(directory, 'data');
  const command = (name, args) => execFileSync(join(bin, name), args, { stdio: 'pipe' });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  let started = false, pool;
  async function close() {
    await pool?.end();
    if (started) command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
  try {
    command('initdb', ['-D', data, '-U', 'lab_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    command('pg_ctl', ['-D', data, '-l', join(directory, 'server.log'), '-o', `-F -h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
    started = true;
    const connectionString = `postgres://lab_test@127.0.0.1:${port}/postgres`;
    pool = new pg.Pool({ connectionString, max: 5 });
    await applySchema(pool);
    return { pool, connectionString, directory, close };
  } catch (error) { await close(); throw error; }
}
