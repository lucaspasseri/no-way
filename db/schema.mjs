import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getPool } from './pool.mjs';

export async function applySchema(client) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await client.query(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    pool = getPool();
    await applySchema(pool);
    console.log('Question schema initialized. Existing data was preserved.');
  } catch (error) {
    console.error('Schema initialization failed. Check DATABASE_URL, connectivity, permissions, and schema compatibility.', { code: error.code || 'CONFIGURATION_ERROR' });
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
