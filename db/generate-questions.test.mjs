import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
let request;
mock.module('../scripts/openrouter.mjs', { namedExports: { requestOpenRouter: options => request(options) } });
const { generateCandidates } = await import('./generate-questions.mjs');

it('requests bounded structured candidates and never supplies approval metadata', async () => {
  request = async options => {
    assert.equal(options.maxOutputTokens, 3000);
    assert.equal(options.responseSchema.properties.candidates.maxItems, 5);
    assert.equal(options.responseSchema.additionalProperties, false);
    assert.ok(!('status' in options.responseSchema.properties.candidates.items.properties));
    assert.match(options.prompt, /exactly 2/);
    return { model: 'provider/model', text: JSON.stringify({ candidates: [{ question: 'one' }, { question: 'two' }] }) };
  };
  const batch = await generateCandidates({ count: 2 });
  assert.equal(batch.model, 'provider/model');
  assert.equal(batch.candidates.length, 2);
});

it('fails clearly on unavailable providers, bad JSON, wrong counts, and invalid batch sizes', async () => {
  const failure = new Error('sanitized provider failure');
  request = async () => { throw failure; };
  await assert.rejects(generateCandidates(), error => error === failure);
  for (const text of ['not json', '{}', '{"candidates":[]}', '{"candidates":[{}],"status":"approved"}']) {
    request = async () => ({ model: 'provider/model', text });
    await assert.rejects(generateCandidates(), { code: 'INVALID_AI_RESPONSE' });
  }
  for (const count of [0, 6, NaN, 1.5]) await assert.rejects(generateCandidates({ count }), { code: 'INVALID_BATCH' });
});
