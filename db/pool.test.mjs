import { it, mock } from 'node:test';
import assert from 'node:assert/strict';

const pools = [];
class FakePool {
  constructor(options) { this.options = options; pools.push(this); }
  on(event, handler) { this.handler = handler; assert.equal(event, 'error'); }
}
mock.module('pg', { defaultExport: { Pool: FakePool } });

it('requires DATABASE_URL and rejects invalid URLs without echoing credentials', async t => {
  const previous = process.env.DATABASE_URL;
  t.after(() => { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; });
  const { getPool } = await import('./pool.mjs?configuration');
  delete process.env.DATABASE_URL;
  assert.throws(() => getPool(), /DATABASE_URL is required/);
  process.env.DATABASE_URL = 'not-a-valid-secret-connection-string';
  assert.throws(() => getPool(), { message: 'DATABASE_URL must be a valid PostgreSQL connection URL.' });
  assert.equal(pools.length, 0);
});

it('limits and reuses connections through development module reloads', async t => {
  const previous = { url: process.env.DATABASE_URL, mode: process.env.NODE_ENV, pool: globalThis.__noWayPostgresPool };
  t.after(() => {
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
    if (previous.pool === undefined) delete globalThis.__noWayPostgresPool; else globalThis.__noWayPostgresPool = previous.pool;
  });
  process.env.DATABASE_URL = 'postgresql://user:password@localhost/example?sslmode=verify-full';
  process.env.NODE_ENV = 'development';
  const { getPool } = await import('./pool.mjs?first');
  const pool = getPool();
  const { getPool: reloaded } = await import('./pool.mjs?reload');
  assert.equal(getPool(), pool);
  assert.equal(reloaded(), pool);
  assert.equal(pools.length, 1);
  assert.equal(pool.options.max, 5);
  assert.equal(pool.options.connectionTimeoutMillis, 5000);
  assert.equal(pool.options.statement_timeout, 10000);
  assert.equal(pool.options.connectionString, process.env.DATABASE_URL);
  assert.ok(!('ssl' in pool.options), 'Use provider SSL settings without disabling validation');
});
