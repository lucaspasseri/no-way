import { it } from 'node:test';
import assert from 'node:assert/strict';
import questions from '../db/seed/questions.json' with { type: 'json' };

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const production = process.env.TEST_MODE === 'production';

it('streams the automatic loading fallback before the async game in development', { skip: production }, async () => {
  const response = await fetch(baseURL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  assert.equal(response.status, 200);
  const decoder = new TextDecoder();
  let html = '';
  let sawSuspendedFallback = false;
  for await (const chunk of response.body) {
    html += decoder.decode(chunk, { stream: true });
    if (html.includes('aria-label="Loading game"') && !html.includes('id="question-title"')) {
      sawSuspendedFallback = true;
    }
  }
  html += decoder.decode();
  assert.ok(sawSuspendedFallback, 'The fallback must arrive while the game is still suspended');
  assert.ok(html.includes('id="question-title"'), 'The game must eventually replace the fallback');
  assert.ok(html.includes(questions[0].question), 'The Server Component must pass initial database data to the game');
});

it('serves public fields from the seeded database through the real API', async () => {
  const response = await fetch(`${baseURL}/api/questions`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const publicQuestions = questions.slice(0, 1).map(({ question, category, unit, difficulty, curatedId }) => ({ id: 1, question, category, unit, difficulty, curatedId }));
  assert.deepEqual(await response.json(), { questions: publicQuestions, error: null });
});

it('streams the completed database-backed game in production', { skip: !production }, async () => {
  const response = await fetch(baseURL);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('id="question-title"'));
  assert.ok(html.includes(questions[0].question));
});
