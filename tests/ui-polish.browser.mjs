// Run against tests/lab-preview.mjs. This suite never calls an AI provider.
export default async function verifyUiPolish(page, { baseURL = 'http://127.0.0.1:3107', screenshotDirectory } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(baseURL, { waitUntil: 'commit' });
    const loading = page.getByRole('status', { name: 'Loading game', exact: true });
    // Development deliberately exposes the streaming fallback; a warm cache can
    // skip it. Never add a delay to the application to make this assertion pass.
    if (await loading.isVisible()) {
      const label = loading.getByText('Loading questions…', { exact: true });
      check(await label.evaluate(element => getComputedStyle(element).clipPath === 'inset(50%)'), 'The loading announcement must be visually hidden');
      if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/classic-loading.png` });
    }
    const question = page.locator('#question-title');
    await question.waitFor();
    await page.waitForLoadState('networkidle');
    const originalQuestion = await question.textContent();
    const originalBox = await question.boundingBox();
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const heldRequest = async route => { await waiting; await route.fulfill({ status: 503, json: { error: 'Unavailable' } }); };
    await page.route('**/api/questions?**', heldRequest);
    await page.getByRole('button', { name: 'Next question', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /^Loading question…$/ }).waitFor();
    check(await question.textContent() === originalQuestion, 'Selection must retain the current question while loading');
    check((await question.boundingBox()).y === originalBox.y, 'Loading must not shift the question');
    check(await page.getByRole('button', { name: 'Lock question', exact: true }).isDisabled(), 'Question actions must wait for selection');
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/classic-question-loading.png` });
    release();
    await page.getByText('Unable to load a question. Please try again.', { exact: true }).waitFor();
    check(await question.textContent() === originalQuestion, 'An error must preserve the playable question');
    await page.unroute('**/api/questions?**', heldRequest);

    const dimensions = [];
    for (const path of ['/', '/question-lab']) {
      await page.goto(baseURL + path);
      await page.getByRole('button', { name: 'Game settings', exact: true }).waitFor();
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 320 ? 480 : 900 });
        const trigger = page.getByRole('button', { name: 'Game settings', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Game settings', exact: true });
        await dialog.waitFor();
        const bounds = await dialog.boundingBox();
        check(bounds.x >= 0 && bounds.x + bounds.width <= width, `Settings exceeds the viewport at ${width}px on ${path}`);
        check(bounds.y >= 0 && bounds.y + bounds.height <= (width === 320 ? 480 : 900), 'Settings must fit short viewports');
        check(await dialog.evaluate(element => element.matches(':modal')), 'Settings must use the top layer');
        check(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), `Page overflows at ${width}px on ${path}`);
        check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Opening settings must move focus inside');
        // Neither programmatic focus nor Tab may enter the inert page.
        await page.getByRole('link', { name: 'No Way', exact: true }).evaluate(element => element.focus());
        check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Underlying branding must be inert');
        const last = dialog.getByRole('button').last();
        if (await last.isEnabled()) await last.focus();
        else await dialog.getByRole('button', { name: 'Switch to dark mode', exact: true }).focus();
        await page.keyboard.press('Tab');
        // Native dialogs may give browser chrome one Tab stop at the boundary.
        // Page content must stay inert; the next Tab returns to the dialog.
        check(await dialog.evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body), 'Tab must not focus underlying page content');
        await page.keyboard.press('Tab');
        check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Tab must return to settings');
        await page.getByRole('button', { name: 'Close settings', exact: true }).focus();
        if (path === '/question-lab' && screenshotDirectory && [390, 1440].includes(width)) {
          await page.screenshot({ path: `${screenshotDirectory}/settings-${width}.png` });
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        check(await trigger.evaluate(element => element === document.activeElement), 'Escape must restore focus to settings');
        await trigger.click();
        await page.mouse.click(2, 2);
        await dialog.waitFor({ state: 'hidden' });
        dimensions.push({ path, width });
      }
      await page.getByRole('link', { name: 'No Way', exact: true }).click();
      await question.waitFor();
      check(new URL(page.url()).pathname === '/', 'Branding must navigate home');
    }
    const icons = await page.locator('link[rel="icon"]').evaluateAll(elements => elements.map(element => ({ href: element.href, type: element.type })));
    for (const extension of ['.ico', '.svg']) {
      const icon = icons.find(icon => new URL(icon.href).pathname.endsWith(extension));
      check(icon, `Metadata must include ${extension}`);
      const response = await page.request.get(icon.href);
      check(response.ok() && /image\//.test(response.headers()['content-type']), `${extension} must be served as an image`);
    }
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/classic-branding.png`, fullPage: true });
    // Branding is ordinary App Router navigation: an active classic session survives.
    await page.getByRole('button', { name: 'Lock question', exact: true }).click();
    await page.getByRole('textbox', { name: 'New guess' }).fill('5');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await page.getByRole('link', { name: /AI Question Lab/ }).click();
    await page.getByRole('heading', { name: /AI Question Lab/ }).waitFor();
    await page.getByRole('link', { name: 'No Way', exact: true }).click();
    await page.getByText('1 guess placed', { exact: true }).waitFor();
    check(await page.getByRole('textbox', { name: 'New guess' }).isEnabled(), 'Brand navigation must preserve the lock');
    check(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
    return { settings: dimensions, loadingAndError: 'passed', brandingAndFavicon: 'passed', sessionPreservation: 'passed', errors };
  } finally { page.off('pageerror', onError); }
}
