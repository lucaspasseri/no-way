/** Pass a Playwright Page connected to tests/lab-preview.mjs (mocked provider).
 * Exercises the real routes, database, generation screening, and existing game.
 */
export default async function verifyQuestionLab(page, { baseURL = 'http://127.0.0.1:3107', screenshotDirectory } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const payloads = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const track = async response => {
    if (!response.url().includes('/api/question-lab') || !response.ok()) return;
    try { payloads.push(await response.json()); } catch { /* Aborted navigation. */ }
  };
  page.on('response', track);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(baseURL);
    const question = page.locator('[id$="question-title"]:visible');
    await question.waitFor();
    await page.waitForLoadState('networkidle');
    const regularQuestion = await question.textContent();
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    await page.getByRole('textbox', { name: 'New guess' }).fill('12');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('1 guess placed', { exact: true }).waitFor();
    await page.locator('button[aria-label="Game settings"]:visible').click();
    await page.getByRole('link', { name: /AI Question Lab/ }).click();
    await page.getByRole('heading', { name: /AI Question Lab/ }).waitFor();
    await page.getByRole('button', { name: 'Categories', exact: true }).click();
    check(await page.getByRole('button', { name: 'Science', exact: true }).isVisible(), 'Categories must come from the seeded bank');
    await page.getByRole('button', { name: 'My own topic', exact: true }).click();
    await page.getByLabel('Your rabbit hole').fill('Pokémon');
    await page.getByLabel('Who’s at the table?').selectOption('custom');
    await page.getByLabel('Describe your challenge').fill('Questions a 10-year-old could answer');
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-configuration.png`, fullPage: true });
    const generate = page.getByRole('button', { name: 'Generate 10 questions', exact: true });
    await generate.dblclick();
    await page.getByText('EXPERIMENT IN PROGRESS', { exact: true }).waitFor();
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-generation.png`, fullPage: true });
    await page.getByRole('heading', { name: 'A fresh pack. A new rabbit hole.' }).waitFor({ timeout: 90000 });
    check(await page.getByText('Unverified', { exact: true }).isVisible(), 'Results must disclose unverified status');
    check(await page.getByText('Answer sealed', { exact: true }).count() === 3, 'Preview answers must stay sealed');
    const pack = payloads.map(payload => payload.pack).filter(Boolean).at(-1);
    check(pack.accepted === 10 && pack.attempts === 5, 'Duplicate clicks must generate exactly one pack in five small batches');
    for (const payload of payloads) for (const question of payload.pack?.questions ?? []) {
      check(!('answer' in question) && !('explanation' in question) && !('src' in question) && !('sourceUrl' in question), 'Preview/step responses must not reveal answers or evidence');
    }
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-results.png`, fullPage: true });
    await page.getByRole('link', { name: 'Start playing', exact: true }).click();
    await question.waitFor();
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'New guess' });
    await input.fill('0'); await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
    await page.getByText('Challenge failed! The guess is still valid. Keep playing.', { exact: true }).waitFor();
    await input.fill('1000000'); await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
    await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();
    check(await page.getByText('Generated answer', { exact: true }).isVisible(), 'Experimental outcomes must not claim factual correctness');
    check(await page.getByText('Correct Answer', { exact: true }).count() === 0, 'Curated correctness label must not appear for generated answers');
    await page.getByRole('button', { name: 'Report questionable answer', exact: true }).click();
    await page.getByRole('button', { name: 'Question reported', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Play another round', exact: true }).click();
    const seen = [pack.questions[0].question];
    for (let index = 1; index < 10; index++) {
      await question.waitFor();
      const text = await question.textContent(); check(!seen.includes(text), 'Pack questions must never repeat'); seen.push(text);
      if (index < 9) await page.getByRole('button', { name: 'Next question', exact: true }).click();
    }
    check(await page.getByRole('button', { name: 'Next question', exact: true }).isDisabled(), 'An exhausted pack must not wrap or enter the curated pool');
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    await input.fill('1000000'); await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
    await page.getByRole('link', { name: 'Generate another batch', exact: true }).waitFor();
    await page.getByText('2 of 10 available questions played.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to AI Lab', exact: true }).click();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).waitFor();
    check(await page.getByText('Pokémon', { exact: false }).count() > 0, 'Returning must restore the generation summary');
    await page.getByRole('link', { name: 'Back to game', exact: true }).click();
    await page.getByRole('link', { name: 'Back to main game', exact: true }).click();
    await question.waitFor();
    check(await question.textContent() === regularQuestion, 'Returning must restore the original question');
    check(await page.getByText('1 guess placed', { exact: true }).isVisible(), 'Lab navigation must retain regular guesses');
    check(await input.isEnabled(), 'Lab navigation must retain the question lock');

    await page.locator('button[aria-label="Game settings"]:visible').click();
    await page.getByRole('link', { name: /AI Question Lab/ }).click();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
    await page.getByLabel('Your rabbit hole').fill('Browser partial pack');
    await page.getByRole('button', { name: 'Generate 10 questions', exact: true }).click();
    await page.getByText(/Only 2 of 10 questions passed screening/).waitFor({ timeout: 90000 });
    check(await page.getByRole('link', { name: 'Start playing', exact: true }).isVisible(), 'An accepted partial pack must be playable');
    const partialPack = payloads.map(payload => payload.pack).filter(Boolean).at(-1);
    await page.getByRole('link', { name: 'Start playing', exact: true }).click();
    await page.getByText('2 of 10 requested questions are available. This batch is ready to play.', { exact: true }).waitFor();
    for (let index = 0; index < 2; index++) {
      await question.waitFor();
      await page.getByRole('button', { name: 'Lock question', exact: true }).click();
      await input.fill('1000000');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
      await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();
      if (index === 0) await page.getByRole('button', { name: 'Play another round', exact: true }).click();
    }
    await page.getByText('2 of 2 available questions played.', { exact: true }).waitFor();
    check(await page.locator('main').getByRole('alert').count() === 0, 'Partial batch completion is a normal result');
    if (screenshotDirectory) {
      await page.screenshot({ path: `${screenshotDirectory}/partial-batch-complete.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      check(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'Partial results must fit a mobile viewport');
      await page.screenshot({ path: `${screenshotDirectory}/partial-batch-complete-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 960 });
    }
    const attempts = partialPack.attempts;
    await page.getByRole('link', { name: 'Generate another batch', exact: true }).click();
    await page.getByRole('button', { name: 'Generate 10 questions', exact: true }).waitFor();
    check(await page.getByLabel('Your rabbit hole').inputValue() === 'Browser partial pack', 'Generation preferences must be retained');
    check(payloads.map(payload => payload.pack).filter(Boolean).at(-1).attempts === attempts, 'Opening generation settings must not make a paid request');
    await page.getByRole('link', { name: 'Back to game', exact: true }).click();
    await page.getByRole('link', { name: 'Back to AI Lab', exact: true }).click();
    await page.getByText(/Only 2 of 10 questions passed screening/).waitFor();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
    await page.getByLabel('Your rabbit hole').fill('Browser provider failure');
    await page.getByRole('button', { name: 'Generate 10 questions', exact: true }).click();
    await page.getByRole('button', { name: 'Resume generation', exact: true }).waitFor({ timeout: 60000 });
    check(await page.getByRole('alert').filter({ hasText: /provider/ }).isVisible(), 'Provider failure must offer recovery');
    check(await page.getByRole('link', { name: 'Start playing', exact: true }).count() === 0, 'An empty failed batch must not be playable');

    const dimensions = [];
    await page.getByRole('button', { name: 'Return to AI Lab settings', exact: true }).click();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      const actual = await page.evaluate(() => document.documentElement.scrollWidth);
      check(actual === width, `Lab overflows at ${width}px`); dimensions.push({ width, actual });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('nav button[aria-haspopup="dialog"]').click();
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.keyboard.press('Escape');
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-dark.png`, fullPage: true });
    check(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
    return { generated: 10, screenedAttempts: 5, uniqueQuestionsPlayed: seen.length, partial: 2, providerRecovery: 'passed', roundPreservation: 'passed', publicAnswersHidden: 'passed', dimensions, errors };
  } finally { page.off('response', track); }
}

export async function verifyInterruptedPack(page, { baseURL = 'http://127.0.0.1:3107' } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(baseURL);
  await page.locator('#question-title').waitFor();
  await page.waitForLoadState('networkidle');
  await page.locator('button[aria-label="Game settings"]:visible').click();
  await page.getByRole('link', { name: /AI Question Lab/ }).click();
  await page.getByRole('button', { name: 'My own topic', exact: true }).click();
  await page.getByLabel('Your rabbit hole').fill('Browser interruption test');
  const started = page.waitForRequest(request => request.url().endsWith('/api/question-lab') && request.postDataJSON()?.action === 'advance');
  await page.getByRole('button', { name: 'Generate 10 questions', exact: true }).click();
  const request = await started;
  const { id } = request.postDataJSON();
  await page.getByRole('link', { name: 'Back to game', exact: true }).click();
  await page.locator('#question-title:visible').waitFor();
  let saved;
  for (let retry = 0; retry < 40; retry++) {
    saved = (await (await page.request.get(`${baseURL}/api/question-lab?id=${id}`)).json()).pack;
    if (saved?.attempts === 1) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  check(saved?.attempts === 1 && saved.accepted > 0, 'An in-flight batch must commit accepted questions after navigation');
  await page.locator('button[aria-label="Game settings"]:visible').click();
  await page.getByRole('link', { name: /AI Question Lab/ }).click();
  await page.getByRole('button', { name: 'Resume generation', exact: true }).waitFor();
  const paused = (await (await page.request.get(`${baseURL}/api/question-lab?id=${id}`)).json()).pack;
  check(paused.attempts === 1, 'Returning must not automatically start another paid batch');
  await page.getByRole('button', { name: /^(Keep these \d+ questions|Review saved questions)$/ }).click();
  await page.getByRole('link', { name: 'Start playing', exact: true }).waitFor();
  const final = (await (await page.request.get(`${baseURL}/api/question-lab?id=${id}`)).json()).pack;
  check(final.status === 'partial' && final.attempts === 1 && final.accepted === saved.accepted, 'Keeping a partial pack must preserve accepted data without another provider call');
  return { interruption: 'passed', saved: saved.accepted, automaticRequests: 0, keepPartial: 'passed' };
}

export async function verifyProviderTimeouts(page, { baseURL = 'http://127.0.0.1:3107' } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(baseURL + '/question-lab');
  await page.getByRole('button', { name: 'My own topic', exact: true }).click();
  await page.getByLabel('Your rabbit hole').fill('Browser provider timeout');
  await page.getByRole('button', { name: 'Generate 10 questions', exact: true }).click();
  const resume = page.getByRole('button', { name: 'Resume generation', exact: true });
  await resume.waitFor();
  check(await page.getByRole('alert').filter({ hasText: 'timed out' }).isVisible(), 'A provider timeout must have a specific reason');
  for (let attempt = 1; attempt < 7; attempt++) {
    await resume.click();
    if (attempt < 6) await resume.waitFor();
  }
  const reason = page.getByText('This pack has reached its attempt limit. Generate a new pack or keep any accepted questions.', { exact: true });
  await reason.waitFor();
  check(!(await reason.textContent()).includes('attempts remaining'), 'Exhausted packs must not offer unavailable retries');
  check(await page.getByText('No usable question batch was returned.', { exact: false }).isVisible(), 'No candidate response is different from rejected questions');
  check(await resume.count() === 0, 'Exhausted packs must offer regeneration');
  await page.reload();
  await reason.waitFor();
  check(await page.getByRole('link', { name: 'Start playing', exact: true }).count() === 0, 'A failed empty pack must remain unplayable after reload');
  return { typedTimeout: 'passed', boundedAttempts: 7, exhaustedMessage: 'passed', restoredReason: 'passed' };
}
