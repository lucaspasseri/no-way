/** Run with a Playwright Page against tests/lab-preview.mjs (mock AI only). */
export default async function verifyLocalization(page, { baseURL = 'http://127.0.0.1:3107' } = {}) {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.context().clearCookies();
  await page.goto(baseURL);
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.reload();
  await page.getByRole('heading', { name: 'No Way', exact: true }).waitFor();
  await page.getByLabel('Game settings', { exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Language', { exact: true }).filter({ visible: true }).selectOption('pt-BR');
  check(await page.getByLabel('Sistema de medidas', { exact: true }).filter({ visible: true }).inputValue() === 'metric', 'Portuguese initially defaults to metric');
  await page.getByLabel('Sistema de medidas', { exact: true }).filter({ visible: true }).selectOption('original');
  await page.getByLabel('Idioma', { exact: true }).filter({ visible: true }).selectOption('en');
  await page.getByLabel('Language', { exact: true }).filter({ visible: true }).selectOption('pt-BR');
  check(await page.getByLabel('Sistema de medidas', { exact: true }).filter({ visible: true }).inputValue() === 'original', 'An explicit original-unit preference survives language switches');
  await page.getByLabel('Sistema de medidas', { exact: true }).filter({ visible: true }).selectOption('metric');
  await page.getByLabel('Configurações do jogo', { exact: true }).filter({ visible: true }).click();
  const original = await page.locator('#question-title').textContent();
  await page.getByRole('button', { name: 'Bloquear pergunta', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Novo palpite', exact: true });
  await input.fill('1,5');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  check((await page.locator('#latest-guess-value').textContent()).trim() === '1,5', 'Portuguese decimals are parsed and formatted correctly');
  await page.getByLabel('Configurações do jogo', { exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Idioma', { exact: true }).filter({ visible: true }).selectOption('en');
  await page.getByLabel('Game settings', { exact: true }).filter({ visible: true }).click();
  check((await page.locator('#latest-guess-value').textContent()).trim() === '1.5', 'Language switching preserves the numeric guess');
  check(await page.getByRole('button', { name: 'Unlock question', exact: true }).isEnabled(), 'Language switching preserves the lock');
  await page.getByLabel('Game settings', { exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Language', { exact: true }).filter({ visible: true }).selectOption('pt-BR');
  await page.getByLabel('Configurações do jogo', { exact: true }).filter({ visible: true }).click();
  check(await page.locator('#question-title').textContent() === original, 'Question identity and translated wording are stable');
  await input.fill('1.234,5'); await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Contestar palpite', exact: true }).click();
  await page.getByRole('heading', { name: 'Contestação bem-sucedida!', exact: true }).waitFor();
  check(await page.getByText('Resposta correta', { exact: true }).isVisible(), 'Localized gameplay reveals the answer only on success');
  check(await page.getByText(/A IAU define uma unidade astronômica/).isVisible(), 'Answer explanations are also localized');
  await page.setViewportSize({ width: 390, height: 900 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Portuguese results fit a mobile viewport');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Use real endpoints to verify the derived metric representation end to end.
  const selected = await (await page.request.get(baseURL + '/api/questions?after=48&locale=pt-BR&unitSystem=metric')).json();
  const q = selected.questions[0];
  check(q.question.includes('Lago Superior') && q.localization.converted && !('answer' in q), 'Metric selection preserves IDs and hides answers');
  const equal = await (await page.request.post(baseURL + '/api/challenge', { data: { questionId: q.id, guess: 406, localization: { locale: 'pt-BR', unitSystem: 'metric' } } })).json();
  const above = await (await page.request.post(baseURL + '/api/challenge', { data: { questionId: q.id, guess: 407, localization: { locale: 'pt-BR', unitSystem: 'metric' } } })).json();
  check(equal.result.success === false && above.result.answer === 406, 'Server challenge uses the displayed whole-meter rounding');
  const response = await page.request.get(baseURL);
  const html = await response.text();
  check(/<html[^>]*lang="pt-BR"/.test(html) && html.includes('Quantos milhões'), 'Server HTML starts in saved Portuguese');
  await page.reload();
  check(await page.locator('html').getAttribute('lang') === 'pt-BR', 'Saved preferences survive reload');

  await page.getByLabel('Configurações do jogo', { exact: true }).filter({ visible: true }).click();
  await page.getByRole('link', { name: /Laboratório de perguntas com IA/ }).click();
  await page.getByRole('button', { name: 'Meu próprio tema', exact: true }).click();
  await page.getByLabel('Seu universo de curiosidades', { exact: true }).filter({ visible: true }).fill('Biologia molecular');
  await page.getByRole('button', { name: 'Gerar 10 perguntas', exact: true }).click();
  await page.getByRole('heading', { name: 'Um novo pacote. Um mundo para explorar.', exact: true }).waitFor({ timeout: 60000 });
  check(await page.getByText('Sem verificação', { exact: true }).isVisible(), 'Portuguese generation preserves unverified status');
  await page.setViewportSize({ width: 390, height: 900 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Portuguese pack summaries fit a mobile viewport');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Começar a jogar', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear pergunta', exact: true }).click();
  const packQuestion = await page.locator('main:visible [id$="question-title"]').textContent();
  await page.getByRole('textbox', { name: 'Novo palpite', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByLabel('Configurações do jogo', { exact: true }).filter({ visible: true }).click();
  await page.getByLabel('Idioma', { exact: true }).filter({ visible: true }).selectOption('en');
  await page.getByLabel('Measurement system', { exact: true }).filter({ visible: true }).selectOption('original');
  await page.getByLabel('Game settings', { exact: true }).filter({ visible: true }).click();
  check(await page.locator('main:visible [id$="question-title"]').textContent() === packQuestion, 'Changing preferences preserves generated text and answers');
  check((await page.locator('main:visible [id$="latest-guess-value"]').textContent()).trim() === '1', 'Changing preferences keeps active pack guesses');
  await page.getByRole('textbox', { name: 'New guess', exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Doubt guess', exact: true }).click();
  await page.getByRole('heading', { name: 'Challenge successful!', exact: true }).waitFor();
  check(await page.getByText('Generated answer', { exact: true }).isVisible(), 'Frozen pack still challenges correctly');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Translated screens must fit the viewport');
  }
  return { preferences: 'passed', classic: 'passed', rounding: 'passed', portugueseLab: 'passed', frozenPack: 'passed', overflow: 'passed' };
}
