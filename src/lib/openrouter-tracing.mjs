import { randomUUID, createHash } from 'node:crypto';
import { saveTrace } from '../../db/openrouter-traces.mjs';
import { boundedJSON, diagnosticHeaders, rateLimitInfo, redactText, sanitizeDiagnostic, traceLimit } from './openrouter-trace-safety.mjs';
import { publicDiagnostics, publicModels, publicRecovery } from '../features/lab/diagnostics.mjs';

const wireLimit = 65536;
async function readSnapshot(response, signal) {
  const reader = response.clone().body?.getReader();
  if (!reader) return { body: null, bytes: 0, truncated: false };
  let bytes = 0, text = '', truncated = false;
  const decoder = new TextDecoder();
  const aborted = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', aborted, { once: true });
  try {
    if (signal?.aborted) throw signal.reason;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = wireLimit - bytes;
      bytes += value.byteLength;
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      if (bytes >= wireLimit) { truncated = true; reader.cancel().catch(() => {}); break; }
    }
    if (signal?.aborted) throw signal.reason;
    text += decoder.decode();
    if (truncated) return { body: null, bytes, truncated };
    try { return { body: JSON.parse(text), bytes, truncated }; }
    catch { return { body: null, bytes, truncated, invalidJSON: true }; }
  } finally { signal?.removeEventListener('abort', aborted); reader.releaseLock(); }
}
function safeEnvelope(body, secrets) {
  if (!body || typeof body !== 'object') return null;
  const result = {};
  for (const key of ['id','model','provider','provider_name','status','created_at','completed_at','usage','cost','error','incomplete_details','generation_id','openrouter_metadata','finish_reason']) {
    if (body[key] !== undefined) result[key] = sanitizeDiagnostic(body[key], secrets, 0, key);
  }
  // Preserve response structure without generated questions, echoed prompts,
  // reasoning, sources, user metadata or output content.
  if (Array.isArray(body.output)) result.output = body.output.slice(0, 10).map(item => ({
    type: redactText(item.type ?? '', secrets), status: redactText(item.status ?? '', secrets),
    content: Array.isArray(item.content) ? item.content.slice(0, 10).map(part => ({
      type: redactText(part.type ?? '', secrets), textCharacters: typeof part.text === 'string' ? part.text.length : null,
    })) : [],
  }));
  return boundedJSON(result);
}
function categoryFor(status, rate) {
  if (rate.kind === 'credit_or_budget') return 'credit_or_budget';
  if (status === 429) return 'rate_limit';
  if (status === 401) return 'authentication';
  if (status === 403) return 'access_denied';
  if (status >= 500) return 'provider';
  return 'http';
}

/** Explicit request-scoped collector; never added to a public pack or prompt.
 * Initiates an in-flight insert, checkpoints raw HTTP diagnostics before public
 * error transformation, then updates the same row with parsing/validation outcomes. */
export function createLabTrace(context, { persist = saveTrace } = {}) {
  const records = [], attempted = new Map(), secrets = [];
  let recovery = null, currentAttempt = context.attemptNumber, decisionRecord = null;
  let warned = false, pending = null;
  async function flush(record) {
    try {
      const copy = structuredClone(record);
      if (Buffer.byteLength(JSON.stringify(copy)) > traceLimit) {
        copy.responseSnapshot = { truncated: true };
        if (copy.response) copy.response.openrouterMetadata = { truncated: true };
        if (copy.error) copy.error.metadata = { truncated: true };
        copy.routing.confirmedAttempts = [];
        copy.routing.attemptsTruncated = true;
      }
      const serialized = JSON.stringify(copy);
      if (attempted.get(copy.id) === serialized) return;
      attempted.set(copy.id, serialized);
      await persist(copy);
    } catch {
      // Never forward a database exception: it may contain SQL, a URL or data.
      if (!warned) { warned = true; console.warn('OpenRouter trace persistence failed; generation continues.', { traceId: record.id }); }
    }
  }
  function checkpoint(record) {
    // Serialize writes in order, but never spend the HTTP deadline waiting on
    // diagnostics. The Lab drains this queue before returning its result.
    const copy = structuredClone(record);
    pending = pending ? pending.then(() => flush(copy)) : flush(copy);
  }
  const last = () => records.at(-1);
  function aggregate() {
    const record = last() ?? decisionRecord ?? {};
    if (!recovery) return record;
    return { ...record, request: { ...record.request, primaryModel: recovery.originalModels[0], fallbackModels: recovery.originalModels.slice(1) },
      routing: { ...record.routing, confirmedAttempts: records.flatMap(item => item.routing.confirmedAttempts),
        successfulModel: [...records].reverse().find(item => item.routing.successfulModel)?.routing.successfulModel ?? null,
        notSelected: records.length > 0 && records.every(item => item.routing.notSelected === true) }, recovery };
  }
  return {
    addSensitive(values) { secrets.push(...values.filter(value => typeof value === 'string' && value.length >= 2)); },
    transport(configuration) {
      secrets.push(process.env.OPENROUTER_API_KEY ?? '', process.env.DATABASE_URL ?? '');
      return async request => {
        const startedAt = new Date().toISOString();
        let actualModels = configuration.models;
        // Verify the SDK's serialized configuration, keeping the input only in memory.
        try {
          const sent = await request.clone().json();
          actualModels = Array.isArray(sent.models) ? sent.models : [sent.model];
          if (typeof sent.input === 'string') secrets.push(sent.input);
        } catch { /* Configuration supplied by the caller remains the fallback. */ }
        const record = { version: 1, id: randomUUID(), packId: context.packId,
          eventType: 'http_request', batchNumber: context.batchNumber, attemptNumber: currentAttempt, httpAttemptNumber: records.length + 1,
          environment: process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development',
          startedAt, completedAt: null, durationMs: null, outcome: 'in_flight',
          request: { method: 'POST', endpoint: '/api/v1/responses', models: actualModels,
            primaryModel: actualModels[0], fallbackModels: actualModels.slice(1), requestedCount: context.requestedCount,
            timeoutMs: configuration.timeoutMs, parameters: { maxOutputTokens: configuration.maxOutputTokens, stream: false, store: false,
              reasoningEffort: 'none', requireParameters: Boolean(configuration.responseSchema),
              schemaSHA256: configuration.responseSchema ? createHash('sha256').update(JSON.stringify(configuration.responseSchema)).digest('hex') : null,
              locale: context.locale ?? 'en', unitSystem: context.unitSystem ?? 'original' }, metadataEnabled: true },
          http: null, response: null, error: null,
          parsing: { httpJSON: 'pending', sdkResponse: 'pending', candidates: 'pending' },
          validation: { received: null, accepted: null, rejected: null, reasons: {} },
          routing: { confirmedAttempts: [], successfulModel: null, information: 'unknown' },
        };
        records.push(record);
        checkpoint(record);
        // This is the only modification to the SDK's outgoing request.
        request.headers.set('X-OpenRouter-Metadata', 'enabled');
        const began = performance.now();
        try {
          const response = await globalThis.fetch(request);
          record.http = { status: response.status, statusText: redactText(response.statusText, secrets),
            headersAt: new Date().toISOString(), headersDurationMs: Math.round(performance.now() - began),
            headers: diagnosticHeaders(response.headers, secrets) };
          try {
            const snapshot = await readSnapshot(response, request.signal);
            record.parsing.httpJSON = snapshot.invalidJSON ? 'invalid' : snapshot.truncated ? 'capture_truncated' : 'parsed';
            record.responseSnapshot = snapshot.body ? safeEnvelope(snapshot.body, secrets)
              : { omitted: snapshot.invalidJSON ? 'unstructured_body' : snapshot.truncated ? 'capture_limit' : 'non_object_json', capturedBytes: snapshot.bytes };
            const body = snapshot.body;
            const outputFinish = Array.isArray(body?.output) ? body.output.find(item => typeof item?.finish_reason === 'string')?.finish_reason : null;
            const error = body?.error;
            const metadata = sanitizeDiagnostic(error?.metadata ?? {}, secrets);
            const effectiveStatus = Number.isInteger(error?.code) && error.code >= 400 && error.code <= 599 ? error.code
              : error?.code === 'rate_limit_exceeded' || metadata.error_type === 'rate_limit_exceeded' ? 429 : response.status;
            const rate = rateLimitInfo(effectiveStatus, metadata, record.http.headers, Date.parse(record.http.headersAt));
            record.effectiveStatus = effectiveStatus;
            record.rateLimit = rate;
            record.response = { id: typeof body?.id === 'string' ? redactText(body.id, secrets) : null,
              generationId: [body?.id, body?.generation_id, body?.openrouter_metadata?.generation_id, record.http.headers['x-generation-id']].find(value => typeof value === 'string' && /^gen-[A-Za-z0-9-]{1,124}$/.test(value)) ?? null,
              model: typeof body?.model === 'string' ? redactText(body.model, secrets) : null,
              provider: typeof (body?.provider ?? body?.provider_name ?? error?.metadata?.provider_name) === 'string'
                ? redactText(body?.provider ?? body?.provider_name ?? error?.metadata?.provider_name, secrets) : null,
              usage: boundedJSON(sanitizeDiagnostic(body?.usage ?? null, secrets), 4096),
              cost: typeof body?.usage?.cost === 'number' ? body.usage.cost : typeof body?.cost === 'number' ? body.cost : null,
              completionStatus: typeof body?.status === 'string' ? redactText(body.status, secrets) : null,
              finishReason: typeof (body?.finish_reason ?? body?.incomplete_details?.reason ?? outputFinish) === 'string'
                ? redactText(body?.finish_reason ?? body?.incomplete_details?.reason ?? outputFinish, secrets) : null,
              openrouterMetadata: boundedJSON(sanitizeDiagnostic(body?.openrouter_metadata ?? null, secrets), 12000),
            };
            // Endpoint candidates/selected flags are NOT proof of an attempt.
            const routing = body?.openrouter_metadata;
            if (!record.response.provider && body?.status === 'completed' && Array.isArray(routing?.endpoints?.available)) {
              const selected = routing.endpoints.available.find(endpoint => endpoint.selected === true);
              if (typeof selected?.provider === 'string') record.response.provider = redactText(selected.provider, secrets);
            }
            if (Array.isArray(routing?.attempts)) {
              record.routing.confirmedAttempts = routing.attempts.filter(attempt => typeof attempt?.model === 'string' && typeof attempt?.provider === 'string' && Number.isInteger(attempt.status)).slice(0, 30).map(attempt => ({ model: redactText(attempt.model, secrets).slice(0,200), provider: redactText(attempt.provider, secrets).slice(0,200), status: attempt.status }));
              if (record.routing.confirmedAttempts.length) record.routing.information = 'reported_attempts';
            }
            record.routing.reportedAttemptNumber = Number.isInteger(routing?.attempt) ? routing.attempt : null;
            // Zero attempts plus explicit non-selection of every endpoint is
            // evidence of rejection before selection. A configured list is not.
            record.routing.notSelected = routing?.attempt === 0 && !record.routing.confirmedAttempts.length
              && Array.isArray(routing?.endpoints?.available) && routing.endpoints.available.length > 0
              && routing.endpoints.available.every(endpoint => endpoint.selected === false);
            if (!response.ok || error) {
              record.error = { category: categoryFor(effectiveStatus, rate), code: ['number','string'].includes(typeof error?.code) ? sanitizeDiagnostic(error.code, secrets, 0, 'code') : response.status,
                message: redactText(error?.message ?? response.statusText, secrets), metadata: boundedJSON(metadata, 12000) };
              record.outcome = 'http_error';
            } else record.outcome = 'http_received';
          } catch (error) {
            record.parsing.httpJSON = 'capture_failed';
            record.captureError = { name: redactText(error?.name ?? 'Error', secrets) };
          }
          return response;
        } catch (error) {
          record.error = { category: request.signal?.reason?.name === 'TimeoutError' || error?.name === 'TimeoutError' ? 'timeout'
            : request.signal?.aborted || error?.name === 'AbortError' ? 'aborted' : 'network',
            code: redactText(error?.cause?.code ?? error?.code ?? error?.name ?? 'NETWORK_ERROR', secrets),
            message: redactText(error?.message ?? 'Request failed before HTTP response.', secrets) };
          record.outcome = 'transport_error';
          throw error;
        } finally {
          record.completedAt = new Date().toISOString();
          record.durationMs = Math.max(0, Math.round(performance.now() - began));
          checkpoint(record);
        }
      };
    },
    sdkParsed(response) {
      const record = last(); if (!record) return;
      record.parsing.sdkResponse = 'parsed';
      record.response ??= { id: null, generationId: null, model: null, provider: null, usage: null, cost: null, finishReason: null, completionStatus: response.status, openrouterMetadata: null };
      if (typeof response.id === 'string') {
        record.response.id = redactText(response.id, secrets);
        if (/^gen-[A-Za-z0-9-]{1,124}$/.test(response.id)) record.response.generationId = response.id;
      }
      if (typeof response.model === 'string') record.response.model = redactText(response.model, secrets);
      if (!record.response.usage && response.usage) record.response.usage = boundedJSON(sanitizeDiagnostic(response.usage, secrets), 4096);
      if (record.response.cost === null && typeof response.usage?.cost === 'number') record.response.cost = response.usage.cost;
      if (!record.error) record.outcome = 'response_parsed';
      // A completed response confirms the answering model, never the rest of
      // the configured fallback list. Do not invent provider attribution.
      if (response.status === 'completed' && response.model) {
        record.routing.successfulModel = redactText(response.model, secrets);
        if (record.routing.information === 'unknown') record.routing.information = 'answering_model_only';
      }
    },
    failure(error, stage, applicationCode) {
      const record = last(); if (!record) return;
      const category = record.error?.category ?? (['AI_TIMEOUT'].includes(applicationCode) ? 'timeout'
        : ['AI_INVALID_RESPONSE'].includes(applicationCode) ? 'response_parsing' : stage === 'candidate_parsing' ? 'candidate_parsing' : 'provider');
      record.error ??= { category, code: applicationCode ?? error?.code ?? 'GENERATION_FAILED' };
      record.error.applicationCode = applicationCode ?? error?.code ?? null;
      record.error.exceptionName = redactText(error?.name ?? 'Error', secrets);
      record.error.stage = stage;
      record.outcome = 'failed';
      if (stage === 'sdk' && record.parsing.sdkResponse === 'pending') {
        record.parsing.sdkResponse = !record.http ? 'not_received' : record.parsing.httpJSON === 'invalid' ? 'failed'
          : record.http.status >= 400 || record.responseSnapshot?.error ? 'error_response' : 'failed';
      }
      if (stage === 'candidate_parsing') record.parsing.candidates = 'failed';
    },
    candidatesParsed(count) { const record = last(); if (record) { record.parsing.candidates = 'parsed'; record.validation.received = count; } },
    validated({ received, accepted, rejected, reasons }) {
      const record = last(); if (!record) return;
      record.validation = { received, accepted, rejected, reasons };
      record.outcome = rejected ? (accepted ? 'partial_validation' : 'validation_failed') : received ? 'accepted' : 'empty_batch';
      if (rejected) record.error = { category: 'validation', code: 'QUESTIONS_REJECTED', stage: 'validation' };
    },
    applicationResult(result) { const record = last(); if (record) { record.application = result; record.lifecycleCompletedAt = new Date().toISOString(); } },
    beginRecovery(models) { recovery = { id: randomUUID(), originalModels: [...models], steps: [], outcome: 'running', providerCalls: 0, batchNumber: context.batchNumber }; },
    nextAttempt(number) { currentAttempt = number; },
    recoveryDecision(step) {
      if (recovery && recovery.steps.length < 32) {
        const { cooldown, ...decision } = step;
        // Operational rows carry a public summary; never recursively embed it
        // in every history step. Keep just the bounded availability decision.
        recovery.steps.push({ ...decision, ...(cooldown && { cooldown: {
          scope: cooldown.scope, until: cooldown.until, timing: cooldown.timing,
        } }) });
      }
    },
    finishRecovery(outcome) {
      if (!recovery) return;
      recovery.outcome = outcome; recovery.providerCalls = records.length;
      recovery.successfulModel = last()?.routing?.successfulModel ?? null;
      // No HTTP happened: persist an explicit decision event, never a fake call.
      if (!records.length) decisionRecord = { version: 1, id: randomUUID(), packId: context.packId,
        eventType: 'recovery_decision', batchNumber: context.batchNumber, attemptNumber: currentAttempt, httpAttemptNumber: null,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development', startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(), durationMs: 0, outcome: outcome === 'cooldown' ? 'cooldown_skipped' : 'recovery_stopped',
        request: { models: recovery.originalModels, primaryModel: recovery.originalModels[0], fallbackModels: recovery.originalModels.slice(1) },
        routing: { confirmedAttempts: [], successfulModel: null, information: 'unknown' }, recovery };
    },
    recoveryEvidence() {
      const record = last();
      return { effectiveStatus: record?.effectiveStatus ?? record?.http?.status, rateLimit: record?.rateLimit,
        hasHTTP: Boolean(record?.http), transportCode: record?.error?.code, stage: record?.error?.stage };
    },
    publicDetails(code) { return publicDiagnostics(aggregate(), code); },
    publicModels() { return publicModels(aggregate()); },
    publicRecovery() { return publicRecovery(aggregate().recovery); },
    async drain() { await pending; },
    async flush() {
      for (const record of [...records, ...(decisionRecord ? [decisionRecord] : [])]) {
        if (recovery) record.recovery = structuredClone(recovery);
        checkpoint(record);
      }
      await pending;
    },
  };
}
