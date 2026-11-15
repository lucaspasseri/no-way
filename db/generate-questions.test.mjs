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

it('can retain a smaller genuine lab batch without weakening the operator CLI contract', async () => {
  request = async options => {
    assert.equal(options.timeoutMs, 20000);
    assert.match(options.prompt, /untrusted data/);
    assert.match(options.prompt, /Pokémon/);
    return { model: 'provider/model', text: JSON.stringify({ candidates: [{ question: 'first' }] }) };
  };
  const batch = await generateCandidates({ count: 5, allowPartial: true, timeoutMs: 20000, preferences: { topic: 'Pokémon', knowledge: 'expert' } });
  assert.equal(batch.candidates.length, 1);
});

it('requests native localized generation with explicit unit metadata and unchanged custom topics', async () => {
  for (const locale of ['en', 'pt-BR']) for (const unitSystem of ['original', 'metric']) {
    request = async options => {
      assert.match(options.prompt, locale === 'pt-BR' ? /natural Brazilian Portuguese/ : /Write question and explanation directly in English/);
      assert.ok(options.prompt.includes('Biologia molecular'));
      assert.match(options.prompt, unitSystem === 'metric' ? /Use metric measurements only/ : /Keep the units of the referenced fact/);
      const properties = options.responseSchema.properties.candidates.items.properties;
      assert.ok(properties.locale && properties.measurement);
      assert.ok(!properties.status && !properties.verified);
      return { model: 'test/model', text: '{"candidates":[]}' };
    };
    const result = await generateCandidates({ count: 2, allowPartial: true, preferences: { locale, unitSystem, topic: 'Biologia molecular' } });
    assert.deepEqual(result.candidates, []);
  }
});
