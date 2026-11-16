// Public, deliberately lossy projection. Never spread a trace or provider error.
export const errorCopy = {
  daily_quota: ['Daily AI request limit reached', 'OpenRouter has exhausted the available daily free-model quota.'],
  temporary_rate_limit: ['AI requests temporarily limited', 'OpenRouter is temporarily restricting requests. Please wait before trying again.'],
  provider_unavailable: ['AI provider unavailable', 'The provider is temporarily unavailable or overloaded. This does not confirm a daily quota restriction.'],
  authentication: ['AI access needs attention', 'The game host needs to check the AI connection and account permissions.'],
  insufficient_credits: ['AI credit restriction', 'The AI account has a credit or spending restriction. The game host needs to review it.'],
  timeout: ['AI response timed out', 'The AI provider timed out before finishing this batch.'],
  network: ['Could not reach the AI provider', 'The server could not connect to the AI provider. Your saved questions are still available.'],
  invalid_response: ['AI response could not be used', 'The AI returned an incomplete or unreadable response. This batch could not be screened.'],
  validation_failure: ['Some questions did not pass screening', 'The AI returned questions, but some did not meet the pack requirements. Accepted questions have been preserved.'],
  unknown: ['Generation could not continue', 'The AI request could not be completed. Your saved questions are still available.'],
};
const codes = {
  AI_AUTHENTICATION: 'authentication', AI_ACCESS_DENIED: 'authentication', AI_NOT_CONFIGURED: 'authentication',
  AI_CREDITS: 'insufficient_credits', AI_TIMEOUT: 'timeout', AI_NETWORK_ERROR: 'network',
  AI_UNAVAILABLE: 'provider_unavailable', AI_MODEL_UNAVAILABLE: 'provider_unavailable',
  AI_INVALID_RESPONSE: 'invalid_response', INVALID_AI_RESPONSE: 'invalid_response', AI_EMPTY_RESPONSE: 'invalid_response',
  AI_OUTPUT_LIMIT: 'invalid_response', AI_INCOMPLETE_RESPONSE: 'invalid_response', QUESTIONS_REJECTED: 'validation_failure',
  AI_RATE_LIMIT: 'temporary_rate_limit', AI_PROVIDER_ERROR: 'unknown', AI_MODEL_INVALID: 'unknown',
  AI_REQUEST_INVALID: 'unknown', AI_REQUEST_REJECTED: 'unknown',
};
const modelId = value => typeof value === 'string' && value.length <= 200 && !/sk-|redacted/i.test(value)
  && /^[a-z0-9~][a-z0-9._~-]*\/[a-z0-9][a-z0-9._:~/-]*$/i.test(value) ? value : null;
const models = values => [...new Set((Array.isArray(values) ? values : []).slice(0, 30).map(modelId).filter(Boolean))];
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const reference = value => /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value ?? '') ? value : undefined;

export function publicModels(record) {
  const successful = modelId(record?.routing?.successfulModel);
  const confirmedAttempts = models(record?.routing?.confirmedAttempts?.map(attempt => attempt.model));
  return { primary: modelId(record?.request?.primaryModel), fallbacks: models(record?.request?.fallbackModels), successful,
    confirmedAttempts, notSelected: record?.routing?.notSelected === true && !successful && !confirmedAttempts.length,
    routingStatus: record?.routing?.notSelected === true && !successful && !confirmedAttempts.length ? 'confirmed'
      : confirmedAttempts.length ? 'confirmed' : successful ? 'partial' : 'unknown' };
}

export function publicDiagnostics(record, applicationCode = 'AI_PROVIDER_ERROR') {
  const code = record?.parsing?.httpJSON === 'invalid' && record?.http?.status < 400 ? 'AI_INVALID_RESPONSE'
    : Object.hasOwn(codes, applicationCode) ? applicationCode : 'AI_PROVIDER_ERROR';
  const rate = record?.rateLimit;
  const category = rate?.kind === 'free_tier_daily' ? 'daily_quota'
    : rate?.kind === 'credit_or_budget' ? 'insufficient_credits'
    : rate?.kind === 'upstream_provider_capacity' ? 'provider_unavailable'
    : ['free_tier_per_minute', 'unknown_rate_limit'].includes(rate?.kind) ? 'temporary_rate_limit'
    : record?.error?.category === 'authentication' || record?.error?.category === 'access_denied' ? 'authentication'
    : record?.error?.category === 'network' ? 'network'
    : record?.error?.category === 'timeout' ? 'timeout' : codes[code];
  const httpStatus = number(record?.http?.status);
  return { code, category, title: errorCopy[category][0], message: errorCopy[category][1], models: publicModels(record),
    rateLimit: (rate && rate.kind !== 'none') || code === 'AI_RATE_LIMIT' ? {
      source: ['openrouter_free_tier_daily', 'openrouter_free_tier_per_day', 'openrouter_free_tier_per_minute',
        'upstream_provider', 'upstream_provider_capacity'].includes(rate?.limitSource) ? rate.limitSource : null,
      limit: number(rate?.limit), remaining: number(rate?.remaining), resetAt: date(rate?.resetAt), retryAt: date(rate?.retryAt),
      accountWide: rate?.kind === 'free_tier_daily',
    } : null,
    request: { batchNumber: number(record?.batchNumber), attemptNumber: number(record?.attemptNumber),
      httpStatus, durationMs: number(record?.durationMs) },
    validation: { received: number(record?.validation?.received), accepted: number(record?.validation?.accepted), rejected: number(record?.validation?.rejected) },
    retryable: !['authentication', 'insufficient_credits'].includes(category) && !['AI_MODEL_INVALID', 'AI_REQUEST_INVALID', 'AI_REQUEST_REJECTED'].includes(code),
    ...(reference(record?.id) && { referenceId: reference(record.id) }),
  };
}

// Apply the allowlist again when reading stored data or copying diagnostics.
export function sanitizePublicDetails(details) {
  if (!details || !Object.hasOwn(errorCopy, details.category)) return null;
  const { category, models: routing, request, rateLimit, validation } = details;
  const projected = publicDiagnostics({ id: details.referenceId, batchNumber: request?.batchNumber, attemptNumber: request?.attemptNumber,
    http: { status: request?.httpStatus }, durationMs: request?.durationMs,
    request: { primaryModel: routing?.primary, fallbackModels: routing?.fallbacks },
    routing: { successfulModel: routing?.successful, confirmedAttempts: routing?.confirmedAttempts?.map(model => ({ model })), notSelected: routing?.notSelected },
    validation }, details.code);
  return { ...projected, category, title: errorCopy[category][0], message: errorCopy[category][1],
    retryable: projected.retryable && !['authentication', 'insufficient_credits'].includes(category),
    rateLimit: rateLimit ? { source: ['openrouter_free_tier_daily', 'openrouter_free_tier_per_day', 'openrouter_free_tier_per_minute', 'upstream_provider', 'upstream_provider_capacity'].includes(rateLimit.source) ? rateLimit.source : null,
      limit: number(rateLimit.limit), remaining: number(rateLimit.remaining), resetAt: date(rateLimit.resetAt), retryAt: date(rateLimit.retryAt),
      accountWide: category === 'daily_quota' && rateLimit.accountWide === true } : null };
}

export function cooldownUntil(details) {
  const rate = details?.rateLimit;
  const dates = [rate?.retryAt, ...(rate?.accountWide ? [rate.resetAt] : [])].map(value => Date.parse(value)).filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : null;
}
export function cooldownActive(details, now = Date.now()) { return (cooldownUntil(details) ?? 0) > now; }
export function diagnosticStatus(details) {
  const status = details?.request?.httpStatus;
  return status >= 400 && status <= 599 ? status : ['daily_quota', 'temporary_rate_limit'].includes(details?.category) ? 429
    : details?.category === 'timeout' ? 504 : 502;
}
export function formatRetryTime(timestamp, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone && { timeZone }) }).format(new Date(timestamp));
}
export function modelName(id) {
  if (!id) return 'Unknown';
  return id.split('/').slice(1).join('/').replace(/:free$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
