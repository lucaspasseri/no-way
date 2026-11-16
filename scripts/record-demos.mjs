import { execFileSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { startIsolatedPreview } from '../tests/isolated-preview.mjs';

const viewport = { width: 1120, height: 1000 };
const output = resolve('docs/assets/demos');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const hold = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const exact = name => ({ name, exact: true });
const button = (page, name) => page.getByRole('button', exact(name));
const heading = (page, name) => page.getByRole('heading', exact(name));
const restrictOrigin = (context, origin) => context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());

async function caption(page, text, simulated = false) {
  await page.evaluate(({ text, simulated }) => {
    let banner = document.querySelector('[data-demo-caption]');
    if (!banner) {
      banner = document.createElement('div');
      banner.dataset.demoCaption = 'true';
      banner.style.cssText = 'position:fixed;inset:0 0 auto;z-index:2;padding:8px 16px;background:#1e1b2e;color:#fff;font:600 14px/20px system-ui,sans-serif;text-align:center;pointer-events:none;';
      document.body.append(banner);
    }
    banner.textContent = (simulated ? 'SIMULATED AI DEMO · ' : '') + text;
  }, { text, simulated });
}

async function ready(page, baseURL, path = '/') {
  await page.goto(baseURL + path);
  await page.locator('main').waitFor();
  await button(page, 'Game settings').waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'nextjs-portal { display:none!important; } html { scroll-padding-top:56px; }' });
}

async function typeGuess(page, text) {
  const input = page.getByRole('textbox', exact('New guess'));
  await input.fill('');
  await input.pressSequentially(text, { delay: 90 });
  await button(page, 'Send').click();
}

async function core(page) {
  await caption(page, 'Core gameplay · Lock a question and make your estimate.');
  await hold(1000);
  await button(page, 'Lock question').click();
  await typeGuess(page, '100');
  await page.getByText('1 guess placed', { exact: true }).waitFor();
  await hold(900);
  await caption(page, 'Every new guess must be higher. How about 200?');
  await typeGuess(page, '200');
  await page.getByText('2 guesses placed', { exact: true }).waitFor();
  await hold(900);
  await caption(page, 'Think the latest guess is too high? Doubt it.');
  await button(page, 'Doubt guess').click();
  await heading(page, 'Challenge successful!').waitFor();
  await page.getByText('149.6', { exact: true }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await hold(1700);
  await page.screenshot({ path: join(output, 'core-gameplay.png'), fullPage: true });
  await button(page, 'Play another round').click();
  await page.locator('#question-title').waitFor();
  await caption(page, 'A new question. A new round.');
  await hold(1300);
}

async function lab(page) {
  await caption(page, 'Choose your topic, difficulty and audience.', true);
  await hold(800);
  await button(page, 'Categories').click();
  await button(page, 'Science').waitFor();
  await hold(600);
  await button(page, 'My own topic').click();
  await page.getByLabel('Your rabbit hole', { exact: true }).fill('Everyday numbers');
  await button(page, 'Easy').click();
  await page.getByLabel('Who’s at the table?', { exact: true }).selectOption('elementary');
  await page.getByLabel('Who’s at the table?', { exact: true }).scrollIntoViewIfNeeded();
  await hold(1200);
  await caption(page, 'Generate a pack · Local fixtures stand in for the AI provider.', true);
  await button(page, 'Generate 10 questions').click();
  await page.getByText('EXPERIMENT IN PROGRESS', { exact: true }).waitFor();
  await heading(page, 'A fresh pack. A new rabbit hole.').waitFor({ timeout: 60000 });
  await page.getByText('Unverified', { exact: true }).waitFor();
  const play = page.getByRole('link', exact('Start playing'));
  const id = (await play.getAttribute('href')).split('/').at(-1);
  const response = await page.request.get(new URL('/api/question-lab?id=' + encodeURIComponent(id), page.url()).href);
  const { pack } = await response.json();
  if (!response.ok() || pack.accepted !== 10 || pack.status !== 'ready' || pack.attempts !== 5) throw new Error('The simulated pack did not pass real screening as expected.');
  if (pack.questions.some(question => 'answer' in question || 'explanation' in question)) throw new Error('Preview responses must keep answers sealed.');
  await caption(page, '10 accepted questions · Answers stay sealed until a successful challenge.', true);
  await heading(page, 'A fresh pack. A new rabbit hole.').scrollIntoViewIfNeeded();
  await hold(1800);
  await play.click();
  await page.locator('[id$="question-title"]:visible').waitFor();
  await caption(page, 'Play the generated pack using the same guessing rules.', true);
  await button(page, 'Lock question').click();
  await typeGuess(page, '12');
  await page.getByText('1 guess placed', { exact: true }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await hold(1400);
  await page.screenshot({ path: join(output, 'ai-lab.png') });
}

async function customization(page) {
  await caption(page, 'Make it yours · Language, measurements and theme.');
  await button(page, 'Game settings').click();
  await hold(900);
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.getByLabel('Sistema de medidas', { exact: true }).waitFor();
  await hold(1200);
  await page.getByLabel('Sistema de medidas', { exact: true }).selectOption('original');
  await hold(600);
  await page.getByLabel('Sistema de medidas', { exact: true }).selectOption('metric');
  await button(page, 'Ativar tema escuro').click();
  await hold(1300);
  await page.keyboard.press('Escape');
  await caption(page, 'Português, dark mode and your choice of questions.');
  await page.getByLabel('Categoria', { exact: true }).selectOption('geography');
  await page.getByLabel('Dificuldade', { exact: true }).selectOption('easy');
  await hold(800);
  const previous = await page.locator('#question-title').textContent();
  await button(page, 'Próxima pergunta').click();
  await page.waitForFunction(text => document.querySelector('#question-title')?.textContent !== text, previous);
  await hold(1300);
  await page.screenshot({ path: join(output, 'customization.png') });
  await button(page, 'Configurações do jogo').click();
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await page.keyboard.press('Escape');
  await caption(page, 'Switch back to English without losing your place.');
  await hold(1100);
}

function probe(file) {
  return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
}

async function convert(name, path, start, duration, simulated) {
  const target = join(output, name + '.gif');
  const speed = Math.min(1, 14.5 / duration);
  const filter = `setpts=${speed}*(PTS-STARTPTS),fps=10,scale=840:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', path,
    '-filter_complex', filter, '-loop', '0', '-threads', '1', target]);
  const metadata = probe(target), stream = metadata.streams[0];
  const bytes = (await stat(target)).size;
  const seconds = Number(metadata.format.duration);
  if (seconds < 7 || seconds > 16 || bytes > 5 * 1024 * 1024 || Number(stream.nb_read_frames) < 2) throw new Error(`Unexpected GIF size/duration for ${name}.`);
  console.log(`${name}: ${seconds.toFixed(1)}s, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
  return { file: name + '.gif', preview: name + '.png', seconds, width: stream.width, height: stream.height,
    frames: Number(stream.nb_read_frames), bytes, simulatedAI: simulated };
}

async function main() {
  if (process.argv.length > 2) throw new Error('This recorder takes no arguments and always uses an isolated local app.');
  for (const binary of [ffmpeg, ffprobe]) execFileSync(binary, ['-version'], { stdio: 'ignore' });
  await mkdir(output, { recursive: true });
  console.log('Preparing an isolated app, temporary PostgreSQL and mocked AI provider…');
  const preview = await startIsolatedPreview({ quiet: true });
  let browser;
  const stop = async () => { await browser?.close(); await preview.close(); process.exit(130); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL && { channel: process.env.PLAYWRIGHT_CHANNEL }) });
    const warm = await browser.newPage({ viewport });
    await restrictOrigin(warm.context(), preview.baseURL);
    for (const path of ['/', '/question-lab', '/question-lab/play/00000000-0000-4000-8000-000000000000']) await warm.goto(preview.baseURL + path);
    await warm.close();
    const clips = [];
    for (const [name, path, scene, simulated] of [['core-gameplay', '/', core, false], ['ai-lab', '/question-lab', lab, true], ['customization', '/', customization, false]]) {
      console.log(`Recording ${name}…`);
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
        recordVideo: { dir: join(preview.directory, 'videos'), size: viewport } });
      // No page can contact production or another remote origin during a recording.
      await restrictOrigin(context, preview.baseURL);
      const page = await context.newPage();
      const videoEpoch = performance.now();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await ready(page, preview.baseURL, path);
        if (path === '/') await page.locator('#question-title').waitFor();
        else await button(page, 'Generate 10 questions').waitFor();
        const started = performance.now();
        await scene(page);
        const ended = performance.now();
        if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
        const video = page.video();
        await context.close();
        clips.push(await convert(name, await video.path(), (started - videoEpoch) / 1000, (ended - started) / 1000, simulated));
      } finally { await context.close(); }
    }
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await restrictOrigin(mobile, preview.baseURL);
    const page = await mobile.newPage();
    await ready(page, preview.baseURL);
    await button(page, 'Game settings').tap();
    await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
    await button(page, 'Ativar tema escuro').tap();
    await button(page, 'Fechar configurações').tap();
    await page.screenshot({ path: join(output, 'customization-mobile.png') });
    await mobile.close();
    await writeFile(join(output, 'manifest.json'), JSON.stringify({ viewport, fps: 10, source: 'isolated local app', aiProvider: 'deterministic test fixtures; no live model requests', clips }, null, 2) + '\n');
    console.log('Demos saved to docs/assets/demos/. Intermediate videos are removed with the temporary app.');
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, stop);
    await browser?.close();
    await preview.close();
  }
}

// No .env is loaded by this command; the isolated child receives only test configuration.
try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
