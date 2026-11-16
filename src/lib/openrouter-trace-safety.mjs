// Deliberately conservative diagnostics. No prompts, generated text or arbitrary
// unknown metadata strings are stored. Known diagnostic strings are redacted.
export const snapshotLimit = 16384;
export const traceLimit = 65536;
const forbidden = /authorization|cookie|password|secret|api.?key|access.?token|refresh.?token|credential|^token$|prompt|^input$|^output$|^messages$|content|question|answer|explanation|topic|challenge|flagged_input|user|account|organization|email|phone|address|^ip$|name$/i;
const diagnosticKeys = new Set(['id','code','message','type','status','status_code','statusCode','model','model_slug','provider','provider_name','provider_code','provider_error_code','limit_source','error_type','reason','scope','reset_interval','resets_at','retry_after','retryAt','remedy_hint','raw','region','requested','strategy','summary','name','source','finish_reason','generation_id','request_id','completion_id','error','metadata','headers','data']);
export function redactText(input, secrets = []) {
  let text = String(input);
  for (const secret of secrets.filter(value => typeof value === 'string' && value.length >= 2).sort((a,b)=>b.length-a.length)) {
    for (const variant of [secret, secret.replace(/[\u0000-\u001f\u007f]/g, ' '), JSON.stringify(secret).slice(1,-1)]) text = text.split(variant).join('[REDACTED]');
  }
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]')
    .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
    .replace(/(?:\+\d{1,3}[ -]?)?\(?\d{2,3}\)?[ -]\d{3,5}[ -]\d{4}\b/g, '[PHONE REDACTED]')
    .slice(0, 2000);
}
export function sanitizeDiagnostic(value, secrets = [], depth = 0, key = '') {
  if (key === 'headers' && value && typeof value === 'object') return diagnosticHeaders(value, secrets);
  if (depth > 7) return '[DEPTH LIMIT]';
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (key === 'raw') {
      try { return sanitizeDiagnostic(JSON.parse(value), secrets, depth + 1); } catch { return redactText(value, secrets); }
    }
    return diagnosticKeys.has(key) ? redactText(value, secrets) : '[OMITTED]';
  }
  if (Array.isArray(value)) return value.slice(0, 30).map(item => sanitizeDiagnostic(item, secrets, depth + 1, key));
  if (typeof value !== 'object') return '[OMITTED]';
  return Object.fromEntries(Object.entries(value).slice(0, 60).map(([name, entry]) => {
    // provider_name is a diagnostic label, never an account/person name.
    if (forbidden.test(name) && !['provider_name','input_tokens','output_tokens','total_tokens','prompt_tokens','completion_tokens'].includes(name)) return [name, '[REDACTED]'];
    return [redactText(name, secrets).slice(0, 100), sanitizeDiagnostic(entry, secrets, depth + 1, name)];
  }));
}
export function boundedJSON(value, bytes = snapshotLimit) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) <= bytes) return value;
  // Keep valid JSON and never save a cut-off raw JSON string containing secrets.
  return { truncated: true, sanitizedBytes: Buffer.byteLength(serialized) };
}
const headerNames = new Set(['retry-after','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset',
  'x-openrouter-error-origin','x-generation-id','x-provider-request-id','x-upstream-request-id','x-request-id','request-id','x-openrouter-request-id','x-correlation-id','cf-ray','traceparent','content-type']);
export function diagnosticHeaders(headers, secrets = []) {
  let entries;
  try { entries = headers instanceof Headers ? [...headers] : Object.entries(headers ?? {}); } catch { return {}; }
  return Object.fromEntries(entries.filter(([key])=>headerNames.has(key.toLowerCase())).map(([key,value])=>[key.toLowerCase(),redactText(value,secrets).slice(0,512)]));
}
export function rateLimitInfo(status, metadata = {}, headers = {}, now = Date.now()) {
  const embeddedHeaders = diagnosticHeaders(metadata?.headers);
  const combined = { ...embeddedHeaders, ...headers };
  const source = typeof metadata?.limit_source === 'string' ? metadata.limit_source : null;
  // Structured indicators only: never infer minute/day from an error message,
  // a quota value, reset proximity, or the configured fallback list.
  let kind = status === 429 ? 'unknown_rate_limit' : 'none';
  if (source && /(?:budget|credits|key_limit)/.test(source)) kind = 'credit_or_budget';
  else if (source && /(?:free.*(?:per_min|minute)|(?:per_min|minute).*free)/.test(source)) kind = 'free_tier_per_minute';
  else if (source && /(?:free.*(?:per_day|daily)|(?:per_day|daily).*free)/.test(source)) kind = 'free_tier_daily';
  else if (source?.startsWith('upstream_provider')) kind = 'upstream_provider_capacity';
  else if (status === 402) kind = 'credit_or_budget';
  else if (status === 429 && (metadata?.provider_name || combined['x-openrouter-error-origin'] === 'provider')) kind = 'upstream_provider_capacity';
  let retryAt = null, resetAt = null;
  const retry = combined['retry-after'];
  if (retry && /^\d+(?:\.\d+)?$/.test(retry.trim())) {
    const timestamp = now + Number(retry) * 1000;
    if (Number.isFinite(timestamp) && Math.abs(timestamp) < 8640000000000000) retryAt = new Date(timestamp).toISOString();
  } else if (retry && Number.isFinite(Date.parse(retry))) retryAt = new Date(retry).toISOString();
  const reset = combined['x-ratelimit-reset'];
  if (reset && /^\d+(?:\.\d+)?$/.test(reset.trim())) {
    const number = Number(reset), timestamp = number >= 1e12 ? number : number * 1000;
    if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < 8640000000000000) resetAt = new Date(timestamp).toISOString();
  } else if (reset && Number.isFinite(Date.parse(reset))) resetAt = new Date(reset).toISOString();
  // Documented structured metadata may carry the reset without a header.
  if (!resetAt && typeof metadata?.resets_at === 'string' && Number.isFinite(Date.parse(metadata.resets_at))) resetAt = new Date(metadata.resets_at).toISOString();
  if (!retryAt && typeof metadata?.retryAt === 'string' && Number.isFinite(Date.parse(metadata.retryAt))) retryAt = new Date(metadata.retryAt).toISOString();
  const quotaNumber = value => value !== undefined && value !== null && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  return { kind, limitSource: source, origin: combined['x-openrouter-error-origin'] ?? null, headers: combined, embeddedHeaders,
    limit: quotaNumber(combined['x-ratelimit-limit']), remaining: quotaNumber(combined['x-ratelimit-remaining']), retryAt: retryAt ?? resetAt, resetAt };
}
