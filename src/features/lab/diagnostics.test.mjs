import { it } from 'node:test';
import assert from 'node:assert/strict';
import { publicDiagnostics, sanitizePublicDetails, cooldownActive, cooldownUntil, diagnosticStatus, errorCopy, formatRetryTime } from './diagnostics.mjs';
import { advanceGeneration } from '../../server/lab-generation.mjs';
import { defaultLabConfig } from './config.mjs';
import { dictionaries, translate } from '../../i18n/translations.mjs';
import { dailyQuotaResponse, openrouterResponse } from '../../../tests/fixtures/openrouter-responses.mjs';
import { labCandidates } from '../../../tests/fixtures/lab-candidates.mjs';
import { DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '../../../scripts/openrouter.mjs';
import { labRequest } from './client.mjs';

const initial = () => ({ questions: [], attempts: 0, rejected: 0, status: 'generating', lastError: null, reports: [] });
async function generate(t, response, state = initial()) {
  const key = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-diagnostics-secret';
  t.after(() => { if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key; });
  t.mock.method(globalThis, 'fetch', response);
  return advanceGeneration(defaultLabConfig, state, [], undefined, { packId: '5c1e777c-5d51-4fb0-8136-078bd28347f5', options: { persist: async () => {} } });
}

it('projects the 50-request daily fixture, reset, explicit non-selection and no invented attempts', async t => {
  const data = await generate(t, async () => Response.json(dailyQuotaResponse(), { status: 429 }));
  const error = data.errorDetails;
  assert.equal(error.category, 'daily_quota'); assert.equal(error.request.httpStatus, 429);
  assert.deepEqual(error.rateLimit, { source: 'openrouter_free_tier_daily', limit: 50, remaining: 0,
    resetAt: '2026-11-16T00:00:00.000Z', retryAt: '2026-11-16T00:00:00.000Z', accountWide: true });
  assert.equal(error.models.primary, DEFAULT_MODEL); assert.deepEqual(error.models.fallbacks, DEFAULT_FALLBACK_MODELS);
  assert.equal(error.models.notSelected, true); assert.deepEqual(error.models.confirmedAttempts, []);
  assert.equal(error.models.successful, null); assert.equal(error.models.routingStatus, 'confirmed');
  assert.equal(error.request.batchNumber, 1); assert.equal(error.request.attemptNumber, 1);
  assert.ok(error.referenceId); assert.ok(error.request.durationMs >= 0);
  assert.equal(cooldownActive(error, Date.parse('2026-11-15T23:00:00Z')), true);
  assert.equal(cooldownActive(error, Date.parse('2026-11-16T00:00:00Z')), false);
});

it('uses Retry-After seconds or an HTTP date without inventing a daily limit', async t => {
  for (const retry of ['30', 'Mon, 16 Nov 2026 01:00:00 GMT']) await t.test(retry, async child => {
    const began = Date.now();
    const data = await generate(child, async () => Response.json({ error: { code: 429, message: 'limited' } }, { status: 429, headers: { 'Retry-After': retry } }));
    const error = data.errorDetails;
    assert.equal(error.category, 'temporary_rate_limit'); assert.equal(error.rateLimit.limit, null);
    assert.equal(error.rateLimit.resetAt, null); assert.equal(error.rateLimit.accountWide, false);
    if (retry === '30') assert.ok(Date.parse(error.rateLimit.retryAt) >= began + 30000);
    else assert.equal(error.rateLimit.retryAt, '2026-11-16T01:00:00.000Z');
  });
});

it('keeps unknown 429 reset and routing unknown, including a configured fallback', async t => {
  const data = await generate(t, async () => Response.json({ error: { code: 429, message: 'Daily quota? Try in ten minutes!' },
    openrouter_metadata: { attempt: 0, strategy: 'fallback' } }, { status: 429 }));
  assert.equal(data.errorDetails.category, 'temporary_rate_limit');
  assert.equal(data.errorDetails.rateLimit.retryAt, null); assert.equal(data.errorDetails.rateLimit.resetAt, null);
  assert.equal(data.models.notSelected, false); assert.equal(data.models.routingStatus, 'unknown');
  assert.deepEqual(data.models.confirmedAttempts, []); assert.equal(data.models.fallbacks.length, 1);
});

it('distinguishes upstream capacity, provider outage, credits and authentication', async t => {
  for (const [status, metadata, category] of [[429, { limit_source: 'upstream_provider_pool' }, 'provider_unavailable'],
    [503, {}, 'provider_unavailable'], [402, {}, 'insufficient_credits'], [401, {}, 'authentication']]) {
    await t.test(String(status), async child => {
      const data = await generate(child, async () => Response.json({ error: { code: status, message: 'private raw body', metadata } }, { status }));
      assert.equal(data.errorDetails.category, category); assert.equal(diagnosticStatus(data.errorDetails), status);
      if ([401, 402].includes(status)) assert.equal(data.errorDetails.retryable, false);
      assert.doesNotMatch(JSON.stringify(data.errorDetails), /private raw body/);
    });
  }
});

it('reports network errors and deadlines without inventing HTTP responses', async t => {
  for (const [name, category] of [['TypeError', 'network'], ['TimeoutError', 'timeout']]) await t.test(name, async child => {
    const data = await generate(child, async () => { throw Object.assign(new Error('private failure'), { name }); });
    assert.equal(data.errorDetails.category, category); assert.equal(data.errorDetails.request.httpStatus, null);
    assert.equal(diagnosticStatus(data.errorDetails), category === 'timeout' ? 504 : 502);
  });
});

it('handles malformed wire JSON and malformed candidate JSON', async t => {
  for (const response of [() => new Response('secret malformed payload'), () => Response.json(openrouterResponse('broken candidate JSON'))]) await t.test('malformed response', async child => {
    const data = await generate(child, async () => response());
    assert.equal(data.errorDetails.category, 'invalid_response'); assert.equal(data.questions.length, 0);
    assert.doesNotMatch(JSON.stringify(data.errorDetails), /secret malformed|broken candidate/);
  });
});

it('preserves partial results and distinguishes batch validation counts from pack totals', async t => {
  const data = await generate(t, async () => Response.json(openrouterResponse(JSON.stringify({ candidates: [labCandidates[1], { ...labCandidates[2], answer: -1 }] }))),
    { ...initial(), questions: [labCandidates[0]], attempts: 1 });
  assert.equal(data.questions.length, 2); assert.equal(data.errorDetails.category, 'validation_failure');
  assert.deepEqual(data.errorDetails.validation, { received: 2, accepted: 1, rejected: 1 });
  assert.equal(data.errorDetails.request.attemptNumber, 2);
});

it('confirms answering primary/fallback models using response evidence only', async t => {
  for (const model of [DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS[0]]) await t.test(model, async child => {
    const data = await generate(child, async () => Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0, 2) }), { model })));
    assert.equal(data.models.successful, model); assert.deepEqual(data.models.confirmedAttempts, []);
    assert.equal(data.models.routingStatus, 'partial'); assert.equal(data.errorDetails, null);
  });
});

it('stops provider calls during daily cooldown, keeps accepted questions and allows a check after expiry', async t => {
  const fetch = t.mock.fn(async () => Response.json(dailyQuotaResponse(new Date(Date.now() + 3600000).toISOString()), { status: 429 }));
  const data = await generate(t, fetch, { ...initial(), questions: [labCandidates[0]] });
  const blocked = await advanceGeneration(defaultLabConfig, data, [], () => assert.fail('Cooldown must not call the provider'));
  assert.equal(blocked.attempts, 1); assert.equal(blocked.questions.length, 1); assert.equal(fetch.mock.callCount(), 1);
  const expired = structuredClone(data); expired.errorDetails.rateLimit.resetAt = expired.errorDetails.rateLimit.retryAt = '2020-01-01T00:00:00Z';
  const retry = await advanceGeneration(defaultLabConfig, expired, [], async () => ({ candidates: [labCandidates[1]], model: DEFAULT_MODEL }));
  assert.equal(retry.attempts, 2); assert.equal(retry.questions.length, 2); assert.equal(retry.errorDetails, null);
  assert.equal(cooldownUntil({ rateLimit: { accountWide: true, retryAt: '2026-11-15T21:00:00Z', resetAt: '2026-11-16T00:00:00Z' } }), Date.parse('2026-11-16T00:00:00Z'));
});

it('stops the current generation on daily exhaustion even without a reset time', async t => {
  const response = dailyQuotaResponse(); delete response.error.metadata.headers;
  const data = await generate(t, async () => Response.json(response, { status: 429 }));
  assert.equal(data.status, 'failed'); assert.equal(data.attempts, 1); assert.equal(data.errorDetails.rateLimit.resetAt, null);
});

it('formats the supplied reset in Brasília local time for both languages', () => {
  const timestamp = '2026-11-16T00:00:00.000Z';
  assert.match(formatRetryTime(timestamp, 'pt-BR', 'America/Sao_Paulo'), /15 de nov\. de 2026, 21:00/);
  assert.match(formatRetryTime(timestamp, 'en', 'America/Sao_Paulo'), /Nov 15, 2026, 9:00 PM/);
  for (const [title, message] of Object.values(errorCopy)) for (const key of [title, message]) {
    assert.ok(Object.hasOwn(dictionaries.en, key)); assert.ok(Object.hasOwn(dictionaries['pt-BR'], key));
    assert.notEqual(translate('pt-BR', key), translate('en', key));
  }
});

it('allowlists public/copy diagnostics and rejects raw secrets, bodies and arbitrary fields', () => {
  const details = publicDiagnostics({ id: '5c1e777c-5d51-4fb0-8136-078bd28347f5', request: { primaryModel: 'test/model', fallbackModels: ['Bearer secret', 'test/alternative'] },
    error: { message: 'private-provider-message', metadata: { authorization: 'secret' } }, responseSnapshot: { private: 'secret' }, http: { status: 503, headers: { authorization: 'secret' } } }, 'AI_UNAVAILABLE');
  const copied = sanitizePublicDetails({ ...details, stack: 'private-stack', authorization: 'secret', responseSnapshot: 'private-payload' });
  assert.deepEqual(copied.models.fallbacks, ['test/alternative']);
  assert.doesNotMatch(JSON.stringify(copied), /secret|private|authorization|responseSnapshot|metadata|stack/);
  const budget = sanitizePublicDetails(publicDiagnostics({ rateLimit: { kind: 'credit_or_budget' } }, 'AI_RATE_LIMIT'));
  assert.equal(budget.retryable, false);
});

it('exposes only explicit routing attempts, never every configured fallback', () => {
  const details = publicDiagnostics({ request: { primaryModel: DEFAULT_MODEL, fallbackModels: [...DEFAULT_FALLBACK_MODELS, 'test/untried'] },
    routing: { confirmedAttempts: [{ model: DEFAULT_MODEL }, { model: DEFAULT_FALLBACK_MODELS[0] }], successfulModel: DEFAULT_FALLBACK_MODELS[0] } });
  assert.deepEqual(details.models.confirmedAttempts, [DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS[0]]);
  assert.equal(details.models.routingStatus, 'confirmed');
  assert.equal(details.models.successful, DEFAULT_FALLBACK_MODELS[0]);
});

it('retains structured errors and saved packs in the client on a non-2xx response', async t => {
  const details = publicDiagnostics({ http: { status: 503 } }, 'AI_UNAVAILABLE');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: details.message, details, pack: { accepted: 2 } }, { status: 503 }));
  await assert.rejects(labRequest({ action: 'advance' }), error => error.status === 503 && error.pack.accepted === 2 && error.details.category === 'provider_unavailable');
});
