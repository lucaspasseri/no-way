import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLabTrace } from './openrouter-tracing.mjs';
import { advanceGeneration } from '../server/lab-generation.mjs';
import { requestOpenRouter, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '../../scripts/openrouter.mjs';
import { defaultLabConfig } from '../features/lab/config.mjs';
import { labCandidates } from '../../tests/fixtures/lab-candidates.mjs';
import { openrouterResponse } from '../../tests/fixtures/openrouter-responses.mjs';
import { boundedJSON, diagnosticHeaders, rateLimitInfo, redactText, sanitizeDiagnostic, traceLimit } from './openrouter-trace-safety.mjs';

const initial = () => ({ questions: [], attempts: 0, rejected: 0, status: 'generating', lastError: null, reports: [] });
function history() {
  const rows = new Map(), writes = [];
  return { rows, writes, persist: async row => { rows.set(row.id, structuredClone(row)); writes.push(structuredClone(row)); } };
}
async function generate(t, handler, config = defaultLabConfig, state = initial()) {
  const saved = history(), packId = randomUUID();
  const transport = t.mock.method(globalThis, 'fetch', handler);
  const data = await advanceGeneration(config, state, [], undefined, { packId, options: { persist: saved.persist } });
  assert.equal(transport.mock.callCount(), 1);
  assert.equal(saved.rows.size, 1, 'Exactly one trace per actual HTTP invocation');
  const record = [...saved.rows.values()][0];
  assert.equal(record.packId, packId); assert.equal(record.attemptNumber, state.attempts + 1); assert.equal(record.httpAttemptNumber, 1);
  assert.ok(saved.writes.length >= 2 && saved.writes.length <= 4, 'Bounded checkpoints, not one record per lifecycle stage');
  return { ...saved, record, data, transport };
}
beforeEach(t => {
  const previous = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL, fallbacks: process.env.OPENROUTER_FALLBACK_MODELS };
  process.env.OPENROUTER_API_KEY = 'trace-test-secret-key';
  delete process.env.OPENROUTER_MODEL; delete process.env.OPENROUTER_FALLBACK_MODELS;
  t.after(() => {
    for (const [name, value] of Object.entries({ OPENROUTER_API_KEY: previous.key, OPENROUTER_MODEL: previous.model, OPENROUTER_FALLBACK_MODELS: previous.fallbacks })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
});
it('traces HTTP 200, SDK and candidate parsing, validation, actual config, usage and application decision', async t => {
  const result = await generate(t, async request => {
    assert.equal(request.headers.get('X-OpenRouter-Metadata'), 'enabled');
    assert.equal(request.headers.get('Authorization'), 'Bearer trace-test-secret-key');
    const sent = await request.clone().json();
    assert.deepEqual(sent.models, [DEFAULT_MODEL, ...DEFAULT_FALLBACK_MODELS]);
    return Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0, 2) })), { headers: { 'X-Request-ID': 'req_test', 'Set-Cookie': 'secret-cookie' } });
  });
  const { record, data } = result;
  assert.equal(record.outcome, 'accepted'); assert.equal(data.questions.length, 2); assert.equal(data.attempts, 1);
  assert.equal(record.http.status, 200); assert.equal(record.http.headers['x-request-id'], 'req_test');
  assert.equal(record.request.timeoutMs, 20000); assert.equal(record.request.requestedCount, 2);
  assert.deepEqual(record.parsing, { httpJSON: 'parsed', sdkResponse: 'parsed', candidates: 'parsed' });
  assert.deepEqual(record.validation, { received: 2, accepted: 2, rejected: 0, reasons: {} });
  assert.equal(record.response.usage.total_tokens, 150); assert.equal(record.response.cost, .0001);
  assert.equal(record.application.generationDecision, 'generating');
  assert.equal(record.response.id, 'resp_test_trace'); assert.equal(record.response.generationId, null);
  assert.equal(record.routing.successfulModel, DEFAULT_MODEL); assert.deepEqual(record.routing.confirmedAttempts, []);
  assert.equal(record.routing.information, 'answering_model_only');
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /trace-test-secret-key|secret-cookie|Generate exactly|Test fixture/);
  assert.ok(!serialized.includes(labCandidates[0].question)); assert.ok(record.durationMs >= 0); assert.ok(record.completedAt);
  assert.equal(result.writes[0].outcome, 'in_flight');
  assert.equal(result.writes[1].outcome, 'http_received');
});
it('preserves HTTP 429 headers, original sanitized error and embedded rate headers before public transformation', async t => {
  const { record, data, writes } = await generate(t, async () => Response.json({ error: { code: 429,
    message: 'Provider capacity exhausted for trace-test-secret-key, contact person@example.org.',
    metadata: { limit_source: 'upstream_provider_shared_pool', provider_name: 'Test Provider', provider_code: 'capacity',
      headers: { 'Retry-After': '25', 'X-RateLimit-Remaining': '0', Authorization: 'Bearer trace-test-secret-key' } } } },
  { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60', 'X-Request-ID': 'req_429' } }));
  assert.equal(record.http.status, 429); assert.equal(record.http.statusText, 'Too Many Requests');
  assert.equal(record.http.headers['retry-after'], '60'); assert.equal(record.rateLimit.embeddedHeaders['retry-after'], '25');
  assert.equal(Date.parse(record.rateLimit.retryAt) - Date.parse(record.http.headersAt), 60000);
  assert.equal(record.rateLimit.kind, 'upstream_provider_capacity');
  assert.equal(record.error.category, 'rate_limit'); assert.equal(record.error.applicationCode, 'AI_RATE_LIMIT');
  assert.equal(record.error.metadata.provider_name, 'Test Provider'); assert.equal(record.response.provider, 'Test Provider');
  assert.match(record.error.message, /Provider capacity exhausted/); assert.equal(record.responseSnapshot.error.message, record.error.message); assert.doesNotMatch(JSON.stringify(record), /trace-test-secret-key|person@example.org|Bearer/);
  assert.equal(data.lastErrorCode, 'AI_RATE_LIMIT'); assert.equal(data.questions.length, 0);
  assert.equal(writes[1].error.metadata.limit_source, 'upstream_provider_shared_pool');
  assert.equal(record.application.generationDecision, 'generating');
});
it('normalizes seconds/milliseconds reset times and classifies only structured limit sources', async t => {
  for (const [source, kind, reset] of [['openrouter_free_tier_per_minute', 'free_tier_per_minute', '1900000000'],
    ['openrouter_free_tier_daily', 'free_tier_daily', '1900000000000']]) {
    await t.test(source, async child => {
      const { record } = await generate(child, async () => Response.json({ error: { code: 429, message: 'Rate limited', metadata: { limit_source: source } } },
        { status: 429, headers: { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': reset } }));
      assert.equal(record.rateLimit.kind, kind); assert.equal(record.rateLimit.resetAt, new Date(1900000000000).toISOString());
      assert.equal(record.rateLimit.retryAt, record.rateLimit.resetAt);
    });
  }
  const rate = rateLimitInfo(429, {}, { 'retry-after': 'nonsense', 'x-ratelimit-reset': 'nonsense' });
  assert.equal(rate.retryAt, null); assert.equal(rate.kind, 'unknown_rate_limit');
  assert.equal(rateLimitInfo(429, {}, { 'x-ratelimit-limit': '50' }).kind, 'unknown_rate_limit');
  assert.equal(rateLimitInfo(429, {}, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }).retryAt, '2026-10-21T07:28:00.000Z');
});
it('distinguishes credit, budget and provider failures while keeping original metadata', async t => {
  for (const [status, source, category] of [[402, 'openrouter_credits', 'credit_or_budget'], [403, 'openrouter_workspace_budget', 'credit_or_budget'], [500, undefined, 'provider'], [503, undefined, 'provider']]) {
    await t.test(String(status), async child => {
      const { record, data } = await generate(child, async () => Response.json({ error: { code: status, message: 'Original diagnostic', metadata: { limit_source: source, error_type: 'server' } } }, { status }));
      assert.equal(record.error.category, category); assert.equal(record.http.status, status); assert.equal(record.error.message, 'Original diagnostic');
      assert.equal(record.validation.received, null); assert.ok(data.lastErrorCode);
    });
  }
});
it('keeps timeout, abort and network failures with no fabricated HTTP status', async t => {
  for (const [name, expected] of [['TimeoutError', 'timeout'], ['AbortError', 'aborted'], ['TypeError', 'network']]) {
    await t.test(name, async child => {
      const { record } = await generate(child, async () => { throw Object.assign(new Error('fetch failed'), { name }); });
      assert.equal(record.http, null); assert.equal(record.error.category, expected); assert.equal(record.validation.received, null);
    });
  }
});
it('captures malformed HTTP JSON without storing unstructured response text', async t => {
  const { record, data } = await generate(t, async () => new Response('not-json secret-person@example.org prompt text', { headers: { 'content-type': 'application/json' } }));
  assert.equal(record.http.status, 200); assert.equal(record.parsing.httpJSON, 'invalid'); assert.equal(record.error.category, 'response_parsing');
  assert.equal(record.parsing.sdkResponse, 'failed'); assert.equal(record.responseSnapshot.omitted, 'unstructured_body');
  assert.equal(data.questions.length, 0); assert.doesNotMatch(JSON.stringify(record), /secret-person|prompt text/);
});
it('distinguishes invalid candidate JSON from structurally invalid questions', async t => {
  await t.test('candidate JSON', async child => {
    const { record } = await generate(child, async () => Response.json(openrouterResponse('not valid candidate json')));
    assert.equal(record.error.category, 'candidate_parsing'); assert.equal(record.parsing.sdkResponse, 'parsed'); assert.equal(record.parsing.candidates, 'failed');
  });
  await t.test('question screening', async child => {
    const { record, data } = await generate(child, async () => Response.json(openrouterResponse(JSON.stringify({ candidates: [{ ...labCandidates[0], answer: -1 }] }))));
    assert.equal(record.outcome, 'validation_failed'); assert.equal(record.http.status, 200); assert.equal(record.error.category, 'validation');
    assert.deepEqual(record.validation, { received: 1, accepted: 0, rejected: 1, reasons: { INVALID_CANDIDATE: 1 } });
    assert.equal(data.lastError, null); assert.equal(data.rejected, 1);
  });
});
it('records reported router attempts without treating endpoint candidates as proof', async t => {
  const metadata = { requested: DEFAULT_MODEL, strategy: 'fallback', attempt: 2, region: null, is_byok: false, summary: 'Fallback completed',
    endpoints: { total: 1, available: [{ model: 'provider/never-tried', provider: 'Candidate', selected: false }] },
    attempts: [{ model: DEFAULT_MODEL, provider: 'First Provider', status: 429 }, { model: DEFAULT_FALLBACK_MODELS[0], provider: 'Second Provider', status: 200 }] };
  const { record } = await generate(t, async () => Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0, 2) }), {
    model: DEFAULT_FALLBACK_MODELS[0], openrouter_metadata: metadata,
  })));
  assert.equal(record.routing.confirmedAttempts.length, 2); assert.equal(record.routing.information, 'reported_attempts');
  assert.equal(record.routing.successfulModel, DEFAULT_FALLBACK_MODELS[0]); assert.equal(record.routing.reportedAttemptNumber, 2);
  assert.ok(!record.routing.confirmedAttempts.some(item => item.model === 'provider/never-tried'));
  assert.equal(record.response.openrouterMetadata.endpoints.available[0].model, 'provider/never-tried');
});
it('does not fail a successful generation if diagnostics persistence fails', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0, 2) }))));
  const data = await advanceGeneration(defaultLabConfig, initial(), [], undefined, { packId: randomUUID(), options: { persist: async () => { throw new Error('private DB secret'); } } });
  assert.equal(data.questions.length, 2); assert.equal(data.lastError, null);
});
it('retains shared pack correlation and logical batch numbering across failed and accepted advances', async t => {
  const saved = history(), packId = randomUUID();
  let call = 0;
  t.mock.method(globalThis, 'fetch', async () => ++call === 1 ? Response.json({ error: { code: 429, message: 'Capacity' } }, { status: 429 })
    : Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice((call - 2) * 2, (call - 1) * 2) }))));
  let data = initial();
  for (let i = 0; i < 3; i++) data = await advanceGeneration(defaultLabConfig, data, [], undefined, { packId, options: { persist: saved.persist } });
  assert.equal(saved.rows.size, 3); assert.equal(call, 3); assert.equal(data.attempts, 3);
  assert.deepEqual([...saved.rows.values()].map(row => [row.packId, row.batchNumber, row.attemptNumber]), [[packId,1,1],[packId,1,2],[packId,2,3]]);
});
it('captures a body-read deadline after HTTP 200 and does not leave unhandled cancellation promises', async t => {
  const saved = history(), trace = createLabTrace({ packId: randomUUID(), batchNumber: 1, attemptNumber: 1, requestedCount: 2 }, { persist: saved.persist });
  t.mock.method(globalThis, 'fetch', request => Promise.resolve(new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(' '));
    request.signal.addEventListener('abort', () => controller.error(request.signal.reason), { once: true });
  } }), { headers: { 'content-type': 'application/json' } })));
  const keepAlive = setTimeout(()=>{},500); t.after(()=>clearTimeout(keepAlive));
  await assert.rejects(requestOpenRouter({ timeoutMs: 30, trace }), { code: 'AI_TIMEOUT' });
  const record = [...saved.rows.values()][0];
  assert.equal(record.http.status, 200); assert.equal(record.error.category, 'timeout'); assert.equal(saved.rows.size, 1);
});
it('redacts secrets, personal fields, prompts and unknown metadata strings with strict size limits', () => {
  const secret = 'a-secret-that-must-go';
  const value = sanitizeDiagnostic({ message: `${secret} Bearer another-token sk-or-v1-abcdef person@example.org https://host/?key=secret`,
    raw: JSON.stringify({ error: { message: secret, metadata: { api_key: secret, flagged_input: 'private prompt', provider_name: 'Provider' } } }),
    input: 'full private prompt', user_id: 'person123', Authorization: 'secret', custom: 'private arbitrary text',
    headers: { 'Retry-After': '60', 'Set-Cookie': 'secret' } }, [secret]);
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /a-secret-that-must-go|another-token|sk-or|person@example|full private|person123|private prompt|private arbitrary/);
  assert.equal(value.headers['retry-after'], '60'); assert.equal(value.headers['set-cookie'], undefined);
  assert.equal(value.raw.error.metadata.provider_name, 'Provider');
  assert.equal(boundedJSON({ message: 'x'.repeat(100000) }).truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(boundedJSON({ message: 'x'.repeat(100000) }))) < traceLimit);
  assert.deepEqual(diagnosticHeaders({ Authorization: 'secret', 'Retry-After': '60' }), { 'retry-after': '60' });
  assert.doesNotMatch(redactText('Bearer token sk-test-token user@example.com'), /sk-test|user@example|Bearer token/);
});

it('redacts multiline and JSON-escaped prompt echoes before normalizing whitespace',()=>{
  const prompt='Private original prompt\nSubject: Maria Silva\nDo not persist this text';
  for(const echo of [prompt,prompt.replaceAll('\n',' '),JSON.stringify(prompt).slice(1,-1)]) {
    assert.doesNotMatch(redactText('Failed input: '+echo,[prompt]),/Private original|Maria Silva|persist this text/);
  }
});
it('captures structured upstream errors inside an HTTP 200 envelope',async t=>{
  const {record}=await generate(t,async()=>Response.json(openrouterResponse('',{status:'failed',error:{code:'rate_limit_exceeded',message:'Temporarily unavailable',metadata:{limit_source:'upstream_provider_shared_pool'}}})));
  assert.equal(record.http.status,200);assert.equal(record.error.category,'rate_limit');assert.equal(record.rateLimit.kind,'upstream_provider_capacity');
});
it('bounds oversized response snapshots without preventing SDK parsing or generation',async t=>{
  const {record,data}=await generate(t,async()=>Response.json(openrouterResponse(JSON.stringify({candidates:labCandidates.slice(0,2)}),{metadata:{unknown:'x'.repeat(100000)}})));
  assert.equal(data.questions.length,2);assert.equal(record.parsing.httpJSON,'capture_truncated');
  assert.ok(Buffer.byteLength(JSON.stringify(record))<=traceLimit);
});

it('keeps routing unknown when only configured or selected endpoint candidates are available',async t=>{
  const {record}=await generate(t,async()=>Response.json(openrouterResponse(JSON.stringify({candidates:labCandidates.slice(0,2)}),{
    id:'gen-documentation-123',openrouter_metadata:{requested:DEFAULT_MODEL,strategy:'fallback',attempt:2,region:null,is_byok:false,summary:'Selection result',
      endpoints:{total:2,available:[{model:DEFAULT_MODEL,provider:'Candidate Provider',selected:true},{model:DEFAULT_FALLBACK_MODELS[0],provider:'Other Provider',selected:false}]}}
  })));
  assert.deepEqual(record.routing.confirmedAttempts,[]);assert.equal(record.routing.reportedAttemptNumber,2);
  assert.equal(record.routing.information,'answering_model_only');assert.equal(record.response.provider,'Candidate Provider');
  assert.equal(record.response.generationId,'gen-documentation-123');
});

it('retains received counts for invalid batch shapes and groups specific screening failures',async t=>{
  await t.test('invalid batch count',async child=>{
    const {record}=await generate(child,async()=>Response.json(openrouterResponse(JSON.stringify({candidates:[{},{},{}]}))));
    assert.equal(record.error.category,'candidate_parsing');assert.equal(record.validation.received,3);assert.equal(record.validation.rejected,null);
  });
  await t.test('answer disclosed',async child=>{
    const {record}=await generate(child,async()=>Response.json(openrouterResponse(JSON.stringify({candidates:[{...labCandidates[0],question:'How many faces does this regular octahedron with 8 faces have?'}]}))));
    assert.deepEqual(record.validation.reasons,{ANSWER_DISCLOSED:1});
  });
});

it('keeps slow failing diagnostics outside the provider timeout',async t=>{
  t.mock.method(console,'warn',()=>{});
  t.mock.method(globalThis,'fetch',async()=>Response.json(openrouterResponse('OK')));
  const trace=createLabTrace({packId:randomUUID(),batchNumber:1,attemptNumber:1,requestedCount:2},{persist:async()=>{
    await new Promise(resolve=>setTimeout(resolve,200));throw new Error('Private diagnostics failure');
  }});
  const result=await requestOpenRouter({timeoutMs:100,trace});
  await trace.flush();
  assert.equal(result.text,'OK');
});

it('does not reclassify a rate limit when diagnostics finish after the HTTP deadline',async t=>{
  t.mock.method(console,'warn',()=>{});
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:{code:429,message:'Capacity'}},{status:429}));
  const trace=createLabTrace({packId:randomUUID(),batchNumber:1,attemptNumber:1,requestedCount:2},{persist:async()=>{
    await new Promise(resolve=>setTimeout(resolve,200));throw new Error('Private diagnostics failure');
  }});
  await assert.rejects(requestOpenRouter({timeoutMs:100,trace}),{code:'AI_RATE_LIMIT'});
});
