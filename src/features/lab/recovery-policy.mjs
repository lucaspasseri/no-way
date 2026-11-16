// Lab policy only. The SDK transport remains a single request with retries off.
const integer = (value, fallback, min, max) => /^\d+$/.test(String(value ?? '')) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
export function recoveryConfig(env = process.env) {
  return { enabled: env.AI_RECOVERY_ENABLED !== 'false',
    maxAttempts: integer(env.AI_RECOVERY_MAX_ATTEMPTS, 3, 1, 3),
    maxDurationMs: integer(env.AI_RECOVERY_MAX_DURATION_MS, 22000, 100, 22000),
    baseDelayMs: integer(env.AI_RECOVERY_BASE_DELAY_MS, 1000, 1, 4000),
    maxDelayMs: integer(env.AI_RECOVERY_MAX_DELAY_MS, 4000, 1, 4000),
    defaultCooldownMs: integer(env.AI_RECOVERY_DEFAULT_COOLDOWN_MS, 30000, 1000, 300000) };
}
export function retryDelay(attempt, config, random = Math.random) {
  const ceiling = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** Math.min(attempt - 1, 8));
  return Math.ceil(ceiling * (.5 + Math.max(0, Math.min(1, random())) / 2));
}

// No text matching, guessed UTC resets, or presumed provider-wide restrictions.
export function recoveryFailure(evidence = {}, code, model, now, config) {
  const { rateLimit: rate, effectiveStatus: status, transportCode, hasHTTP, stage } = evidence;
  const content = !(status >= 400) && (['AI_INVALID_RESPONSE', 'INVALID_AI_RESPONSE', 'AI_EMPTY_RESPONSE', 'AI_OUTPUT_LIMIT', 'AI_INCOMPLETE_RESPONSE'].includes(code)
    || stage === 'candidate_parsing' || stage === 'validation');
  const explicitTime = Math.max(...[rate?.retryAt, rate?.resetAt].map(Date.parse).filter(Number.isFinite), 0);
  const cooldown = (scope, reason) => ({ scope, model: scope === 'model' ? model : null, reason,
    until: new Date(Math.max(now + 1000, explicitTime || now + config.defaultCooldownMs)).toISOString(),
    timing: explicitTime > now ? 'provider' : 'local_policy' });
  if (content) return { reason: 'content_failure', retry: false, fallback: false, cooldown: null };
  if (rate?.kind === 'free_tier_daily') return { reason: 'daily_quota', retry: false, fallback: true, cooldown: cooldown('free_models', 'daily_quota') };
  if (rate?.kind === 'credit_or_budget') return { reason: 'credit_restriction', retry: false, fallback: false, cooldown: cooldown('credential', 'credit_restriction') };
  if ([401,403].includes(status) || ['AI_AUTHENTICATION','AI_ACCESS_DENIED','AI_NOT_CONFIGURED'].includes(code)) return { reason: 'authentication', retry: false, fallback: false, cooldown: null };
  if ([400,404,422].includes(status) || ['AI_MODEL_INVALID','AI_REQUEST_INVALID','AI_REQUEST_REJECTED','AI_MODEL_UNAVAILABLE'].includes(code)) return { reason: 'invalid_request', retry: false, fallback: false, cooldown: null };
  if (status === 429 || code === 'AI_RATE_LIMIT') {
    const scope = rate?.kind === 'free_tier_per_minute' ? 'free_models'
      : rate?.kind === 'upstream_provider_capacity' ? 'model' : 'request';
    return { reason: scope === 'model' ? 'model_rate_limit' : scope === 'free_models' ? 'free_rate_limit' : 'unknown_rate_limit',
      retry: true, fallback: scope !== 'request', cooldown: cooldown(scope, 'rate_limit') };
  }
  if ([408,500,502,503,504].includes(status)) return { reason: 'provider_failure', retry: true, fallback: true, cooldown: null };
  // A local timeout/reset after dispatch may already have incurred a charge.
  // Replay only transport errors proving a connection could not be established.
  if (!hasHTTP && ['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(transportCode)) return { reason: 'connection_failure', retry: true, fallback: false, cooldown: null };
  return { reason: ['AI_TIMEOUT','AI_NETWORK_ERROR'].includes(code) || !hasHTTP && transportCode ? 'uncertain_completion' : 'unknown_failure', retry: false, fallback: false, cooldown: null };
}

export function cooldownApplies(cooldown, model) {
  return cooldown.scope === 'credential' || cooldown.scope === 'request'
    || cooldown.scope === 'free_models' && model.endsWith(':free')
    || cooldown.scope === 'model' && cooldown.model === model;
}
export function eligibleModels(models, cooldowns, now) {
  return models.filter(model => !cooldowns.some(cooldown => Date.parse(cooldown.until) > now && cooldownApplies(cooldown, model)));
}
export function nextAvailability(models, cooldowns, now) {
  if (!models.length) return null;
  return Math.min(...models.map(model => Math.max(now, ...cooldowns.filter(item => cooldownApplies(item,model))
    .map(item => Date.parse(item.until)).filter(Number.isFinite))));
}
