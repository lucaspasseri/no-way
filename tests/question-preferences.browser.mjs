/** Run with the existing Playwright session tooling; needs a seeded dev server. */
export default async function verifyQuestionPreferences(page, { baseURL = 'http://localhost:3000' } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(baseURL);
  await page.locator('#question-title').waitFor();
  await page.evaluate(() => localStorage.removeItem('no-way:question-preferences'));
  await page.reload(); await page.waitForLoadState('networkidle');
  const category = page.getByLabel('Category', { exact: true });
  const difficulty = page.getByLabel('Difficulty', { exact: true });
  const title = page.locator('#question-title');
  const next = page.getByRole('button', { name: 'Next question', exact: true });
  const random = page.getByRole('button', { name: 'Random question', exact: true });
  const lock = page.getByRole('button', { name: 'Lock question', exact: true });
  const requests = [];
  const track = request => { if (new URL(request.url()).pathname === '/api/questions') requests.push(request.url()); };
  page.on('request', track);
  try {
    check(await category.inputValue() === '', 'All categories must be the default');
    check(await difficulty.inputValue() === '', 'Any difficulty must be the default');
    check(await category.locator('option').count() === 11, 'Categories must reflect eligible seed data');
    const first = await title.textContent();
    await lock.click();
    await page.getByRole('textbox', { name: 'New guess' }).fill('10');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await category.selectOption('science'); await difficulty.selectOption('medium');
    check(await title.textContent() === first, 'Filter changes must preserve the active question');
    check(await next.isDisabled(), 'Filter changes must preserve the lock');
    check(await page.getByText('1 guess placed', { exact: true }).isVisible(), 'Filter changes must preserve guesses');
    check(requests.length === 0, 'Changing preferences must not request a question');
    await page.getByRole('button', { name: 'Unlock question', exact: true }).click();
    await next.click();
    await page.getByText('Loading question…', { exact: true }).waitFor();
    check(await lock.isDisabled() && await random.isDisabled(), 'Loading must disable competing question actions');
    await page.waitForFunction(previous => document.querySelector('#question-title')?.textContent !== previous, first);
    check(await page.getByText('0 guesses placed', { exact: true }).isVisible(), 'Replacement must reset guesses');
    check(await page.locator('[aria-label="Category: Science"]').isVisible(), 'Current category must be displayed');
    check(await page.locator('[aria-label="Difficulty: Medium"]').isVisible(), 'Current difficulty must be displayed');
    check(requests[0].includes('category=science') && requests[0].includes('difficulty=medium'), 'Requests must carry preferences');

    const seen = new Set([await title.textContent(), first]);
    for (let i = 0; i < 3; i++) {
      const previous = await title.textContent();
      await random.click();
      await page.waitForFunction(text => document.querySelector('#question-title')?.textContent !== text, previous);
      const question = await title.textContent();
      check(!seen.has(question), 'Random must prefer questions not selected this session'); seen.add(question);
    }

    const beforeEmpty = await title.textContent();
    const empty = route => route.fulfill({ json: { questions: [], error: null } });
    await page.route('**/api/questions?**', empty);
    await next.click();
    await page.getByText('No questions match these preferences.', { exact: false }).waitFor();
    check(await title.textContent() === beforeEmpty, 'An empty response must preserve the current question');
    await page.unroute('**/api/questions?**', empty);
    const fail = route => route.abort('failed');
    await page.route('**/api/questions?**', fail);
    await next.click(); await page.getByText('Unable to load a question. Please try again.', { exact: true }).waitFor();
    check(await title.textContent() === beforeEmpty, 'Network failures must preserve the question');
    await page.unroute('**/api/questions?**', fail);

    // One request for rapid clicks; changing filters cancels it and ignores its late response.
    let held, received;
    const requested = new Promise(resolve => { received = resolve; });
    const hold = route => { held = route; received(); };
    await page.route('**/api/questions?**', hold, { times: 1 });
    const beforeRequests = requests.length;
    await next.evaluate(button => { button.click(); button.click(); });
    await requested;
    check(requests.length === beforeRequests + 1, 'Rapid clicks must issue only one request');
    await category.selectOption('nature'); await difficulty.selectOption('easy');
    check(await next.isEnabled(), 'Editing preferences must cancel pending selection');
    await random.click();
    await page.waitForFunction(text => document.querySelector('#question-title')?.textContent !== text, beforeEmpty);
    const fresh = await title.textContent();
    await held.fulfill({ json: { questions: [{ id: 2147483000, question: 'Stale response?' }], error: null } }).catch(() => {});
    check(await title.textContent() === fresh, 'Cancelled responses must not replace a newer question');
    check(await page.locator('[aria-label="Category: Nature"]').isVisible(), 'The new request must use the new preferences');

    await page.reload(); await page.waitForLoadState('networkidle');
    check(await category.inputValue() === 'nature' && await difficulty.inputValue() === 'easy', 'Preferences must survive reload');
    check(await title.textContent() === first, 'Restored preferences must not automatically replace the initial question');
    await page.evaluate(() => localStorage.setItem('no-way:question-preferences', '{"category":"removed","difficulty":"invalid"}'));
    await page.reload(); await page.waitForLoadState('networkidle');
    check(await category.inputValue() === '' && await difficulty.inputValue() === '', 'Invalid saved preferences must default safely');

    const legacy = route => route.fulfill({ json: { questions: [{ id: 2147483000, question: 'How many legacy test objects?' }], error: null } });
    await page.route('**/api/questions?**', legacy, { times: 1 });
    await next.click(); await page.getByText('How many legacy test objects?', { exact: true }).waitFor();
    check(await page.locator('[aria-label="Category: Number trivia"]').isVisible(), 'Legacy categories must have a readable fallback');
    check(await page.locator('[aria-label="Difficulty: Not specified"]').isVisible(), 'Legacy difficulty must have a readable fallback');

    await page.reload(); await page.waitForLoadState('networkidle');
    await category.selectOption('science'); await difficulty.selectOption('medium');
    await lock.click();
    await page.getByRole('textbox', { name: 'New guess' }).fill('1000000000000');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
    await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();
    check(await page.getByText('About the answer', { exact: true }).isVisible(), 'Verified explanation must remain on results');
    await category.selectOption('nature'); await difficulty.selectOption('easy');
    await page.getByRole('button', { name: 'Play another round', exact: true }).click();
    await title.waitFor();
    check(await page.locator('[aria-label="Category: Nature"]').isVisible(), 'Next round must respect preferences');
    check(await page.locator('[aria-label="Difficulty: Easy"]').isVisible(), 'Next round must respect difficulty');

    for (const width of [320, 390, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      check((await category.boundingBox()).height >= 44, 'Selects need accessible touch targets');
    }
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    check(await category.inputValue() === '' && await difficulty.inputValue() === '', 'Clear filters must restore defaults');
    return { filters: 'passed', lockingAndGuesses: 'passed', randomHistory: 'passed', emptyAndErrors: 'passed', races: 'passed', persistence: 'passed', legacy: 'passed', results: 'passed', responsive: 'passed' };
  } finally { page.off('request', track); }
}
