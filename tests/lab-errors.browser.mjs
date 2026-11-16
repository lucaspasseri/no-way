// UI contract coverage. The isolated preview still renders the real app; only
// /api/question-lab is mocked so each error can be inspected deterministically.
import { publicDiagnostics } from '../src/features/lab/diagnostics.mjs';
import { defaultLabConfig } from '../src/features/lab/config.mjs';

const primary = 'particle-ai/particle-1:free';
const fallback = 'nvidia/nemotron-3.5-super-vl:free';
const id = '5c1e777c-5d51-4fb0-8136-078bd28347f5';
function diagnostic(category) {
  const record = { id, batchNumber: 2, attemptNumber: 2, durationMs: 128,
    request: { primaryModel: primary, fallbackModels: [fallback] },
    routing: { confirmedAttempts: [], successfulModel: null }, http: { status: 429 },
    validation: { received: null, accepted: null, rejected: null } };
  let code = 'AI_RATE_LIMIT';
  if (category === 'daily_quota') {
    record.routing.notSelected = true;
    record.rateLimit = { kind: 'free_tier_daily', limitSource: 'openrouter_free_tier_daily', limit: 50, remaining: 0,
      resetAt: '2026-11-16T00:00:00.000Z', retryAt: '2026-11-16T00:00:00.000Z' };
  } else if (category === 'temporary_rate_limit') record.rateLimit = { kind: 'free_tier_per_minute', retryAt: '2026-11-16T00:00:00.000Z' };
  else if (category === 'provider_unavailable') { record.http.status = 503; code = 'AI_UNAVAILABLE'; }
  else if (category === 'insufficient_credits') { record.http.status = 402; code = 'AI_CREDITS'; }
  else if (category === 'invalid_response') { record.http.status = 200; code = 'AI_INVALID_RESPONSE'; }
  else if (category === 'validation_failure') {
    record.http.status = 200; record.validation = { received: 3, accepted: 1, rejected: 2 }; code = 'QUESTIONS_REJECTED';
  }
  return publicDiagnostics(record, code);
}

export default async function verifyLabErrors(page, { baseURL = 'http://127.0.0.1:3107', screenshotDirectory } = {}) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.clock.install({ time: new Date('2026-11-15T23:59:00.000Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async text => { window.__copiedDiagnostics = text; } } }));
  let category = 'daily_quota', locale = 'en', calls = 0;
  const pack = () => ({ id, config: { ...defaultLabConfig, locale }, accepted: 2, attempts: 2, maxAttempts: 7, rejected: 0,
    questions: [{ id: 1, question: 'How many faces does a regular octahedron have?', category: 'mathematics' }],
    status: 'generating', errorDetails: diagnostic(category), lastError: 'Saved diagnostic failure' });
  const route = async route => {
    const body = route.request().postDataJSON();
    if (body?.action === 'advance') { calls++; return route.fulfill({ status: 429, json: { pack: pack(), details: diagnostic(category), error: diagnostic(category).message } }); }
    return route.fulfill({ json: { pack: pack() } });
  };
  await page.route('**/api/question-lab**', route);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const changeLocale = async value => {
    locale = value;
    await page.context().addCookies([{ name: 'no-way-preferences', value: encodeURIComponent(JSON.stringify({ locale })), url: baseURL }]);
  };
  try {
    await changeLocale('en');
    await page.goto(baseURL + '/question-lab');
    await page.evaluate(id => sessionStorage.setItem('no-way:lab-pack', id), id);
    await page.reload();
    await page.getByRole('heading', { name: 'Daily AI request limit reached', exact: true }).waitFor();
    check(await page.getByText('Not selected (confirmed)', { exact: true }).count() === 2, 'Both configured models must be explicitly not selected');
    check(await page.getByRole('button', { name: 'Resume generation', exact: true }).count() === 0, 'Active daily cooldown must not offer retry');
    check(await page.getByText('2 of 10 questions saved in this pack.', { exact: true }).isVisible(), 'Overall accepted questions must be preserved');
    await page.getByText('Technical details', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
    await page.getByText('Diagnostics copied', { exact: true }).waitFor();
    const copied = await page.evaluate(() => JSON.parse(window.__copiedDiagnostics));
    check(copied.models.confirmedAttempts.length === 0 && !('responseSnapshot' in copied), 'Copied diagnostics must stay sanitized and honest');
    await page.clock.fastForward(65000);
    await page.getByRole('button', { name: 'Resume generation', exact: true }).waitFor();
    check(await page.getByText(/renewed quota or capacity is not guaranteed/).isVisible(), 'Expired cooldown must disclose uncertainty');
    check(calls === 0, 'A countdown must not submit network retries');
    await page.clock.setFixedTime(new Date('2026-11-15T23:59:00.000Z'));
    await changeLocale('pt-BR'); await page.reload();
    await page.getByRole('heading', { name: 'Limite diário de requisições de IA atingido', exact: true }).waitFor();
    // The browser context is configured with America/Sao_Paulo by the runner.
    check(await page.locator('time').textContent() === '15 de nov. de 2026, 21:00', 'Reset must show Brasília date and time in Portuguese');
    // Exclude the development toolbar from product layout/screenshots.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const dimensions = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.runFor(100);
      await page.waitForFunction(() => document.documentElement.scrollWidth === innerWidth, null, { polling: 100, timeout: 5000 });
      check(await page.evaluate(() => document.documentElement.scrollWidth) === width, `Error card overflows at ${width}px`);
      dimensions.push(width);
    }
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-daily-quota-pt-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav summary').click();
    await page.getByRole('button', { name: 'Ativar tema escuro', exact: true }).click();
    await page.locator('nav summary').click();
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/lab-daily-quota-pt-mobile-dark.png`, fullPage: true });
    await changeLocale('en');
    const inspected = [];
    for (const [value, title] of [['temporary_rate_limit', 'AI requests temporarily limited'], ['unknown_limit', 'AI requests temporarily limited'],
      ['provider_unavailable', 'AI provider unavailable'], ['insufficient_credits', 'AI credit restriction'],
      ['invalid_response', 'AI response could not be used'], ['validation_failure', 'Some questions did not pass screening']]) {
      category = value; await page.reload();
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      if (value === 'unknown_limit') check(await page.getByText('Time unknown', { exact: true }).isVisible(), 'Unknown limit must not invent a reset');
      if (value === 'insufficient_credits') check(await page.getByRole('button', { name: 'Resume generation', exact: true }).count() === 0, 'Credits must not offer a pointless retry');
      if (value === 'validation_failure') check(await page.getByText('3 questions received; 1 accepted and 2 rejected in this batch.', { exact: true }).isVisible(), 'Batch validation counts must be shown separately');
      inspected.push(value);
    }
    check(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
    return { inspected, locales: ['en', 'pt-BR'], dimensions, copiedDiagnostics: 'passed', cooldownExpiry: 'passed', automaticRetries: calls, errors };
  } finally { await page.unroute('**/api/question-lab**', route); }
}
