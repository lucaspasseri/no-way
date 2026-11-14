import { getPool } from './pool.mjs';
import { assertResetAllowed, seedQuestions } from './seed.mjs';

let pool;
let client;
try {
  // Check before even opening a connection, and again inside the destructive operation.
  assertResetAllowed();
  pool = getPool();
  client = await pool.connect();
  console.log('Development questions table recreated and seeded:', await seedQuestions(client, { reset: true }));
} catch (error) {
  console.error(error.message.startsWith('Reset refused.') ? error.message : 'Reset failed. Check the schema and connection; table changes were rolled back.', { code: error.code || 'RESET_ERROR' });
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
