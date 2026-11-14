/** Reusable browser checks for server challenges against the canonical seed pool. */
export default async function verifyChallenges(page, { baseURL = 'http://127.0.0.1:3000' } = {}) {
  function check(condition, message) { if (!condition) throw new Error(message); }
  async function prepare() {
    await page.goto(baseURL);
    await page.locator('#question-title').waitFor();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'New guess' }).fill('1000000000000');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('1 guess placed', { exact: true }).waitFor();
  }
  const doubt = page.getByRole('button', { name: 'Doubt guess', exact: true });

  await prepare();
  const abort = route => route.abort('failed');
  await page.route('**/api/challenge', abort);
  await doubt.click();
  await page.getByText('Unable to check the challenge. Please try again.', { exact: true }).waitFor();
  check(await page.getByText('1 guess placed', { exact: true }).isVisible(), 'A network failure must preserve guesses');
  await page.unroute('**/api/challenge', abort);
  await doubt.click();
  await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();

  await prepare();
  let firstRoute, received;
  const firstReceived = new Promise(resolve => { received = resolve; });
  let calls = 0;
  const holdFirst = async route => {
    calls++;
    if (calls === 1) { firstRoute = route; received(); }
    else await route.continue();
  };
  await page.route('**/api/challenge', holdFirst);
  try {
    await doubt.click();
    await firstReceived;
    await page.getByText('Checking challenge…', { exact: true }).waitFor();
    check(await doubt.isDisabled(), 'A pending challenge must disable duplicate challenges');
    await page.getByRole('button', { name: 'Unlock question', exact: true }).click();
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    await doubt.click();
    await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();
    check(calls === 2, 'Relocking must permit a new request while the invalidated request is outstanding');
    const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/challenge'));
    await firstRoute.continue(); firstRoute = null;
    await oldResponse;
    check(await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).isVisible(), 'A stale response must not change the resolved round');
  } finally {
    if (firstRoute) await firstRoute.abort().catch(() => {});
    await page.unroute('**/api/challenge', holdFirst);
  }
  return { networkRetry: 'passed', duplicateSuppression: 'passed', staleResponse: 'passed' };
}
