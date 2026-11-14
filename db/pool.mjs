// Node-only connection infrastructure, shared by the server service and CLI scripts.
// Browser code must use the public API; the service enforces its server-only boundary.
import pg from 'pg';

let pool;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error('DATABASE_URL is required. Configure the server environment.'), { code: 'DATABASE_URL_MISSING' });
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw Object.assign(new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'), { code: 'DATABASE_URL_INVALID' });
  }

  // Keep the pool through development HMR; production reuses this module's pool.
  pool = process.env.NODE_ENV === 'development' ? globalThis.__noWayPostgresPool : undefined;
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      allowExitOnIdle: true,
    });
    pool.on('error', error => console.error('Idle database connection failed.', { code: error.code }));
    if (process.env.NODE_ENV === 'development') globalThis.__noWayPostgresPool = pool;
  }
  return pool;
}
