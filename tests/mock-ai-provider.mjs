// Explicit opt-in test preload. Never imported by app code and never uses a key.
// Intercepts the HTTP boundary so browser tests exercise the real server/DB flow.
import { setTimeout } from 'node:timers/promises';
import { labCandidatesPt } from './fixtures/lab-candidates-pt.mjs';
import { labCandidates } from './fixtures/lab-candidates.mjs';
import { similarQuestion } from '../db/question-validation.mjs';
import bank from '../db/seed/questions.json' with { type: 'json' };

if (process.env.NO_WAY_TEST_AI !== '1' || process.env.OPENROUTER_API_KEY !== 'isolated-test-key') throw new Error('Test provider requires explicit isolated-test configuration.');
const originalFetch = globalThis.fetch;
const recoveryCalls = new Map();
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (!url.startsWith('https://openrouter.ai/api/')) return originalFetch(input, init);
  const body = JSON.parse(init?.body ?? await input.clone().text());
  const prompt = body.input;
  const count = Number(/Generate exactly (\d+)/.exec(prompt)?.[1] ?? 5);
  const existing = /Do not repeat these question texts \(JSON data\): (\[.*\])/.exec(prompt);
  const texts = existing ? JSON.parse(existing[1]) : [];
  const recoveryScenario = prompt.includes('Browser recovery outage') ? 'outage' : prompt.includes('Browser recovery limit') ? 'limit' : null;
  if (recoveryScenario) {
    const key = recoveryScenario + ':' + (prompt.includes('natural Brazilian Portuguese') ? 'pt-BR' : 'en');
    const seen = recoveryCalls.get(key) ?? 0;
    recoveryCalls.set(key, seen + 1);
    if (!seen) return Response.json({ error: { code: recoveryScenario === 'outage' ? 503 : 429, message: 'Synthetic recovery failure',
      ...(recoveryScenario === 'limit' && { metadata: { limit_source: 'upstream_provider_shared_pool', provider_name: 'Synthetic provider' } }) } },
      { status: recoveryScenario === 'outage' ? 503 : 429, ...(recoveryScenario === 'limit' && { headers: { 'Retry-After': '60' } }) });
  }
  if (prompt.includes('Browser provider timeout')) throw new DOMException('Synthetic provider deadline', 'TimeoutError');
  const localized = prompt.includes('natural Brazilian Portuguese');
  let candidates = (localized ? labCandidatesPt : labCandidates).filter(question => !bank.some(row => similarQuestion(question.question, row.question))
    && !texts.some(text => similarQuestion(question.question, text))).slice(0, count);
  if (prompt.includes('Browser provider failure')) return Response.json({ error: { message: 'test provider unavailable', code: 503 } }, { status: 503 });
  if (prompt.includes('Browser partial pack')) candidates = texts.some(text => text === labCandidates[16].question) ? [] : labCandidates.slice(16, 18);
  if (prompt.includes('Browser interruption test')) candidates = labCandidates.slice(20, 22);
  await setTimeout(800, undefined, { signal: init?.signal ?? input.signal });
  return Response.json({ id: 'resp_isolated_test', object: 'response', created_at: 1, status: 'completed', model: recoveryScenario ? body.model : 'test/model',
    completed_at: 2, error: null, incomplete_details: null, frequency_penalty: null, presence_penalty: null,
    temperature: null, top_p: null, instructions: null, metadata: null, parallel_tool_calls: false, tool_choice: 'auto', tools: [],
    output: [{ id: 'msg_isolated_test', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify({ candidates }), annotations: [] }] }] });
};
