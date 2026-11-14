function refused() {
  return Object.assign(new Error('Reset refused. Require development/test mode, --confirm-reset, and a loopback database named no_way_dev or no_way_test. Use a fresh local database for unknown or hosted targets.'), { code: 'RESET_REFUSED' });
}

export function assertResetAllowed({ environment = process.env.NODE_ENV, confirmed = process.argv.includes('--confirm-reset'), connectionString = process.env.DATABASE_URL } = {}) {
  if (!['development', 'test'].includes(environment) || !confirmed) throw refused();
  try {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
      || !['no_way_dev', 'no_way_test'].includes(database)
      || [...url.searchParams.keys()].some(key => !['sslmode', 'application_name'].includes(key))) throw refused();
    return database;
  } catch { throw refused(); }
}

export async function verifyResetTarget(client) {
  const expected = assertResetAllowed();
  const { rows: [target] } = await client.query('SELECT current_database() AS database, host(inet_server_addr()) AS address');
  if (target?.database !== expected || !['127.0.0.1', '::1'].includes(target.address)) throw refused();
}
