import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { recoverLabBatch } from './lab-recovery.mjs';
import { advanceGeneration } from './lab-generation.mjs';
import { recoveryConfig, recoveryFailure, retryDelay } from '../features/lab/recovery-policy.mjs';
import { createLabTrace } from '../lib/openrouter-tracing.mjs';
import { publicDiagnostics, publicRecovery } from '../features/lab/diagnostics.mjs';
import { generateCandidates } from '../../db/generate-questions.mjs';
import { defaultLabConfig } from '../features/lab/config.mjs';
import { openrouterResponse, dailyQuotaResponse } from '../../tests/fixtures/openrouter-responses.mjs';
import { labCandidates } from '../../tests/fixtures/lab-candidates.mjs';

const primary = 'test/primary:free', fallback = 'test/fallback:free';
beforeEach(t => {
  const names = ['OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENROUTER_FALLBACK_MODELS','AI_RECOVERY_ENABLED'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.OPENROUTER_API_KEY = 'recovery-test-secret'; process.env.OPENROUTER_MODEL = primary;
  process.env.OPENROUTER_FALLBACK_MODELS = fallback; delete process.env.AI_RECOVERY_ENABLED;
  t.after(() => { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
});
function memoryCooldowns() {
  const rows = [];
  return { rows, active: async (_namespace,_route,now) => rows.filter(row => Date.parse(row.until) > now),
    put: async (_namespace,_route,limit,details) => { rows.push({ ...limit, details }); } };
}
const success = model => Response.json(openrouterResponse(JSON.stringify({ candidates: labCandidates.slice(0,2) }), { model }));
const httpError = (status, metadata = {}, headers = {}) => Response.json({ error: { code: status, message: 'private provider message recovery-test-secret', metadata } }, { status, headers });
async function run(t, respond, overrides = {}) {
  let clock = Date.now(); const waits = [], records = new Map();
  const trace = createLabTrace({ packId: randomUUID(), batchNumber: 1, attemptNumber: 1, requestedCount: 2 }, { persist: async row => records.set(row.id, structuredClone(row)) });
  const fetch = t.mock.method(globalThis,'fetch',async request => {
    const model = (await request.clone().json()).model;
    return respond(model, fetch.mock.callCount(), ms => { clock += ms; });
  });
  const cooldowns = overrides.cooldowns ?? memoryCooldowns();
  let result, error;
  try { result = await recoverLabBatch({ generate: generateCandidates, options: { count: 2, allowPartial: true }, trace,
    budget: 7, startAttempt: 1, cooldowns, models: [primary,fallback], now: () => clock, elapsed: () => clock,
    random: () => 1, wait: async (ms, signal) => { signal.throwIfAborted(); waits.push(ms); clock += ms; }, ...overrides }); }
  catch (failure) { error = failure; }
  return { result, error, records: [...records.values()], trace, fetch, waits, cooldowns };
}

it('recovers a transient 503 using only the configured ordered alternative and one shared budget', async t => {
  const { result, trace, fetch, records, waits } = await run(t, (model,call) => call === 1 ? httpError(503) : success(model));
  assert.equal(result.batch.model,fallback); assert.equal(result.calls,2); assert.equal(fetch.mock.callCount(),2);
  assert.deepEqual(waits,[1000]);
  assert.equal(trace.publicModels().primary,primary); assert.equal(trace.publicModels().successful,fallback);
  assert.deepEqual(records.map(row => row.attemptNumber),[1,2]);
  assert.equal(new Set(records.map(row => row.recovery.id)).size,1);
  assert.equal(trace.publicRecovery().usedAlternative,true);
  assert.doesNotMatch(JSON.stringify(records),/recovery-test-secret|private provider message recovery-test-secret/);
});

it('retries a proven connection failure on the same model, without fabricating provider attempts', async t => {
  const { result, trace, records } = await run(t,(model,call) => {
    if (call === 1) throw new TypeError('connection refused',{ cause: { code: 'ECONNREFUSED' } });
    return success(model);
  });
  assert.equal(result.batch.model,primary); assert.equal(result.calls,2);
  assert.equal(records[0].http,null); assert.deepEqual(trace.publicModels().confirmedAttempts,[]);
  assert.equal(trace.publicRecovery().usedAlternative,false);
});

it('does not replay a local timeout or an interrupted request with uncertain completion', async t => {
  for (const error of [new DOMException('deadline','TimeoutError'), new TypeError('socket reset',{cause:{code:'ECONNRESET'}})]) await t.test(error.name, async child => {
    const result = await run(child,()=>{ throw error; });
    assert.equal(result.fetch.mock.callCount(),1); assert.ok(result.error);
    assert.equal(result.trace.publicRecovery().steps.at(-1).reason,'uncertain_completion');
  });
});

it('honors a short Retry-After without fallback for an unknown 429 scope', async t => {
  const { result, waits, trace } = await run(t,(model,call) => call === 1 ? httpError(429,{}, {'Retry-After':'1'}) : success(model));
  assert.equal(result.batch.model,primary); assert.equal(result.calls,2); assert.ok(waits[0] >= 1000);
  assert.equal(trace.publicRecovery().steps.find(step=>step.action==='retry').reason,'unknown_rate_limit');
});

it('honors a free-model minute wait and shrinks later request timeouts',async t=>{
  const {result,records,waits}=await run(t,(model,call,advance)=>{
    if(call===1){advance(10000);return httpError(503);}
    return success(model);
  });
  assert.equal(result.calls,2);assert.equal(waits[0],1000);
  assert.ok(records[1].request.timeoutMs<=11000);
  await t.test('free models share the minute bucket',async child=>{
    const next=await run(child,(model,call)=>call===1?httpError(429,{limit_source:'openrouter_free_tier_per_minute'},{'Retry-After':'1'}):success(model));
    assert.equal(next.result.batch.model,primary);assert.equal(next.result.calls,2);
    assert.equal(next.cooldowns.rows[0].scope,'free_models');
  });
});

it('persists a bounded local cooldown for unknown 429 timing and sends no further request', async t => {
  const { error, fetch, cooldowns } = await run(t,()=>httpError(429));
  assert.ok(error); assert.equal(fetch.mock.callCount(),1);
  assert.equal(cooldowns.rows[0].scope,'request'); assert.equal(cooldowns.rows[0].timing,'local_policy');
  assert.equal(error.publicDetails.rateLimit.resetAt,null);
  assert.equal(error.publicDetails.rateLimit.retryAt,null);
  assert.ok(error.publicDetails.rateLimit.cooldownUntil);
});

it('skips an active model cooldown, records a non-HTTP skip, and uses an eligible alternative', async t => {
  const cooldowns=memoryCooldowns(); cooldowns.rows.push({scope:'model',model:primary,until:new Date(Date.now()+60000).toISOString(),timing:'provider'});
  const { result, trace, records } = await run(t,model=>success(model),{cooldowns});
  assert.equal(result.calls,1); assert.equal(result.batch.model,fallback); assert.equal(records.length,1);
  assert.equal(trace.publicRecovery().steps[0].action,'skipped');
  assert.equal(trace.publicRecovery().steps[0].httpStatus,null);
});

it('allows an expired cooldown and does not block unrelated models', async t => {
  const cooldowns=memoryCooldowns(); cooldowns.rows.push({scope:'model',model:primary,until:'2020-01-01T00:00:00Z'});
  const { result } = await run(t,model=>success(model),{cooldowns});
  assert.equal(result.batch.model,primary);
});

it('does not bypass account free quota by switching free models and records zero-call cooldown events', async t => {
  const cooldowns=memoryCooldowns();
  cooldowns.rows.push({scope:'free_models',until:new Date(Date.now()+60000).toISOString(),timing:'provider',
    details: publicDiagnostics({rateLimit:{kind:'free_tier_daily'}},'AI_RATE_LIMIT')});
  const { error, fetch, records, trace } = await run(t,()=>assert.fail('Known cooldown must not call OpenRouter'),{cooldowns});
  assert.ok(error); assert.equal(fetch.mock.callCount(),0); assert.equal(trace.publicRecovery().providerCalls,0);
  assert.equal(records.length,1); assert.equal(records[0].eventType,'recovery_decision'); assert.equal(records[0].httpAttemptNumber,null);
  assert.equal(error.publicDetails.category,'daily_quota'); assert.equal(error.publicDetails.models.notSelected,false);
});

it('falls back after a confirmed upstream-model 429 without affecting other configured models', async t => {
  const { result, cooldowns, records } = await run(t,(model,call)=>call===1?httpError(429,{limit_source:'upstream_provider_shared_pool',provider_name:'Provider'},{'Retry-After':'60'}):success(model));
  assert.equal(result.batch.model,fallback); assert.equal(cooldowns.rows[0].scope,'model'); assert.equal(cooldowns.rows[0].model,primary);
  for(const row of records)for(const step of row.recovery.steps)assert.equal(step.cooldown?.details,undefined,'History must not recursively embed operational summaries');
});

it('fails fast for authentication, invalid settings, credit restrictions and daily quota', async t => {
  for (const status of [400,401,403,402,422]) await t.test(String(status),async child=>{
    const { fetch,error }=await run(child,()=>httpError(status));
    assert.ok(error);assert.equal(fetch.mock.callCount(),1);
  });
  await t.test('daily quota',async child=>{
    const { fetch,error }=await run(child,()=>Response.json(dailyQuotaResponse(new Date(Date.now()+60000).toISOString()),{status:429}));
    assert.ok(error);assert.equal(fetch.mock.callCount(),1);
  });
});

it('shares a strict maximum across all models and never multiplies nested retries', async t => {
  const { error, fetch, trace, waits }=await run(t,()=>httpError(503),{budget:3});
  assert.ok(error);assert.equal(fetch.mock.callCount(),3);assert.equal(error.recoveryCalls,3);
  assert.deepEqual(waits,[1000,2000]);assert.equal(trace.publicRecovery().outcome,'budget_exhausted');
  const lastBudget=await t.test('remaining pack budget',async child=>{
    const result=await run(child,()=>httpError(503),{budget:1});assert.equal(result.fetch.mock.callCount(),1);
  });
  void lastBudget;
});

it('respects disabled recovery, disabled fallback, and all alternatives being rate limited', async t => {
  await t.test('recovery off',async child=>{
    const result=await run(child,()=>httpError(503),{config:{...recoveryConfig({}),enabled:false}});assert.equal(result.fetch.mock.callCount(),1);
  });
  await t.test('fallback off',async child=>{
    const result=await run(child,(model,call)=>call===1?httpError(503):success(model),{models:[primary]});
    assert.equal(result.result.batch.model,primary);assert.equal(result.trace.publicRecovery().usedAlternative,false);
  });
  await t.test('all limited',async child=>{
    const result=await run(child,()=>httpError(429,{limit_source:'upstream_provider_shared_pool'}));assert.equal(result.fetch.mock.callCount(),2);
  });
});

it('stops at the wall-clock deadline and cancels pending retry waits', async t => {
  await t.test('deadline',async child=>{
    const result=await run(child,(_model,_call,advance)=>{advance(21950);return httpError(503);});
    assert.equal(result.fetch.mock.callCount(),1);assert.equal(result.trace.publicRecovery().outcome,'deadline');
  });
  await t.test('cancelled',async child=>{
    const controller=new AbortController();
    const result=await run(child,()=>httpError(503),{signal:controller.signal,wait:async()=>{controller.abort();throw new DOMException('cancelled','AbortError');}});
    assert.equal(result.fetch.mock.callCount(),1);assert.equal(result.trace.publicRecovery().outcome,'cancelled');
  });
});

it('does not recover invalid JSON or bypass question validation/lifecycle rules', async t => {
  const malformed=await run(t,()=>Response.json(openrouterResponse('not question JSON',{model:primary})));
  assert.equal(malformed.fetch.mock.callCount(),1);assert.ok(malformed.error);
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json(openrouterResponse(JSON.stringify({candidates:[labCandidates[0],{...labCandidates[1],answer:-1}]}),{model:primary})));
  const data=await advanceGeneration(defaultLabConfig,{questions:[],attempts:0,rejected:0,status:'generating',reports:[]},[],undefined,
    {packId:randomUUID(),options:{persist:async()=>{}},recovery:{cooldowns:memoryCooldowns()}});
  assert.equal(fetch.mock.callCount(),1);assert.equal(data.attempts,1);assert.equal(data.questions.length,1);assert.equal(data.rejected,1);
  assert.equal(data.questions[0].status,'generated');assert.equal(data.questions[0].verification,'unverified');assert.equal(data.errorDetails.category,'validation_failure');
});

it('fails closed on cooldown database errors and keeps trace failures outside recovery decisions', async t => {
  const result=await run(t,()=>assert.fail('No provider request is safe without the shared availability check'),
    {cooldowns:{active:async()=>{throw Object.assign(new Error('safe storage error'),{code:'LAB_COOLDOWN_UNAVAILABLE'});}}});
  assert.equal(result.fetch.mock.callCount(),0);assert.equal(result.trace.publicRecovery().outcome,'storage_failure');
  assert.equal(result.error.publicDetails.retryable,false);
  await t.test('write failure after 429',async child=>{
    const next=await run(child,()=>httpError(429),{cooldowns:{active:async()=>[],put:async()=>{throw Object.assign(new Error('safe store failure'),{code:'LAB_COOLDOWN_UNAVAILABLE'});}}});
    assert.equal(next.fetch.mock.callCount(),1);assert.equal(next.trace.publicRecovery().outcome,'storage_failure');assert.equal(next.error.publicDetails.retryable,false);
  });
  await t.test('trace write failure',async child=>{
    child.mock.method(console,'warn',()=>{});
    const trace=createLabTrace({packId:randomUUID(),batchNumber:1,attemptNumber:1,requestedCount:2},{persist:async()=>{throw new Error('private trace storage failure');}});
    const next=await run(child,model=>success(model),{trace});
    assert.equal(next.fetch.mock.callCount(),1);assert.equal(next.result.calls,1);assert.equal(next.error,undefined);
  });
});

it('bounds configuration, jitter, and sanitized recovery summaries',()=>{
  assert.equal(recoveryConfig({AI_RECOVERY_MAX_ATTEMPTS:'1000'}).maxAttempts,3);
  assert.equal(recoveryConfig({AI_RECOVERY_MAX_DURATION_MS:'999999'}).maxDurationMs,22000);
  assert.equal(retryDelay(20,recoveryConfig({}),()=>1),4000);
  const summary=publicRecovery({id:randomUUID(),originalModels:[primary,fallback],steps:[{action:'retry',reason:'provider_failure',model:primary,raw:'private data',authorization:'secret'}],outcome:'completed',providerCalls:2});
  assert.doesNotMatch(JSON.stringify(summary),/private|authorization|secret/);
  assert.equal(recoveryFailure({effectiveStatus:503},'AI_UNAVAILABLE',primary,Date.now(),recoveryConfig({})).retry,true);
});
