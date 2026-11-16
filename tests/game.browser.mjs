/** Browser integration check. Pass a Playwright Page from an existing runner.
 * No timing thresholds: assert the fallback and hydrated game states in order.
 */
export default async function verifyGame(page, { baseURL = 'http://localhost:3000', development = true } = {}) {
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  const apiRequests = [];
  const track = request => {
    if (new URL(request.url()).pathname === '/api/questions') apiRequests.push(request.url());
  };
  page.on('request', track);
  try {
    await page.goto(baseURL, { waitUntil: 'commit' });
    const loading = page.getByRole('status', { name: 'Loading game' });
    let skeletonBox;
    let fallbackObservedAt;
    if (development) {
      await loading.waitFor({ state: 'visible' });
      fallbackObservedAt = Date.now();
      skeletonBox = await loading.boundingBox();
      check(await loading.getAttribute('aria-busy') === 'true', 'Loading status must announce progress');
    }
    const title = page.locator('#question-title');
    await title.waitFor({ state: 'visible' });
    const fallbackVisibleMs = fallbackObservedAt ? Date.now() - fallbackObservedAt : null;
    await loading.waitFor({ state: 'hidden' });
    const gameBox = await page.locator('main').boundingBox();
    // Let the initial scripts and hydration finish before testing event handlers.
    await page.waitForLoadState('networkidle');
    const firstQuestion = await title.textContent();
    const input = page.getByRole('textbox', { name: 'New guess' });
    check(await input.isDisabled(), 'Guessing starts disabled');
    const next = page.getByRole('button', { name: 'Next question', exact: true });
    await next.click();
    await page.waitForFunction(text => document.querySelector('#question-title')?.textContent !== text, firstQuestion);
    const secondQuestion = await title.textContent();
    await page.getByRole('button', { name: 'Random question', exact: true }).click();
    await page.waitForFunction(text => document.querySelector('#question-title')?.textContent !== text, secondQuestion);
    const chosenQuestion = await title.textContent();
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    check(await next.isDisabled(), 'Locking must disable question changes');
    check(await page.getByRole('button', { name: 'Random question', exact: true }).isDisabled(), 'Random selection must respect the lock');
    check(await input.isEnabled(), 'Locking must enable guesses');
    const send = page.getByRole('button', { name: 'Send', exact: true });
    const doubt = page.getByRole('button', { name: 'Doubt guess', exact: true });
    await input.fill('0');
    await send.click();
    await page.getByText('1 guess placed', { exact: true }).waitFor();
    await doubt.click();
    await page.getByText('Challenge failed! The guess is still valid. Keep playing.', { exact: true }).waitFor();
    await input.fill('0');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Your guess must be higher than 0.' }).waitFor();
    await input.fill('1');
    await send.click();
    await page.getByText('2 guesses placed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Unlock question', exact: true }).click();
    check(await input.isDisabled(), 'Unlocking disables guess entry');
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    check(await page.getByText('2 guesses placed', { exact: true }).isVisible(), 'Relocking must retain guesses');
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.getByRole('button', { name: 'Reset guesses', exact: true }).click();
    await page.getByText('0 guesses placed', { exact: true }).waitFor();
    check(await title.textContent() === chosenQuestion, 'Reset must preserve the selected question');
    check(await input.isEnabled(), 'Reset must preserve the lock');
    await input.fill('1000000000000');
    await send.click();
    await doubt.click();
    const result = page.getByRole('heading', { name: 'Challenge successful!', exact: true });
    await result.waitFor();
    check(await page.getByText('Correct Answer', { exact: true }).isVisible(), 'A successful challenge reveals the answer');
    await page.getByRole('button', { name: 'Play another round', exact: true }).click();
    await title.waitFor();
    check(await title.textContent() !== chosenQuestion, 'A new round advances the question');
    check(await input.isDisabled(), 'A new round starts unlocked');
    check(await page.getByText('0 guesses placed', { exact: true }).isVisible(), 'A new round clears history');
    check(apiRequests.length >= 3, 'Explicit navigation must use server selection');

    const response = await page.request.get(`${baseURL}/api/questions`);
    const payload = await response.json();
    check(response.status() === 200, 'The API must succeed');
    check(payload.error === null && payload.questions.length === 1, 'The API must return the question contract');
    check(payload.questions[0].id === 1, 'The API must preserve question IDs');
    check(payload.questions.every(question => !('answer' in question) && !('explanation' in question)), 'The public API must omit correct answers and answer context');
    check(payload.questions[0].question === firstQuestion, 'The server-rendered game and API must use the same bank');
    return { development, fallbackVisibleMs, skeletonBox, gameBox, questionsPerRequest: payload.questions.length, gameplay: 'passed' };
  } finally {
    page.off('request', track);
  }
}
