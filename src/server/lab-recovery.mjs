import 'server-only';
import { setTimeout as sleep } from 'node:timers/promises';
import { selectedModels } from '../../scripts/openrouter.mjs';
import { cooldownNamespace, requestScope } from '../../db/openrouter-cooldowns.mjs';
import { recoveryConfig, recoveryFailure, retryDelay, eligibleModels, cooldownApplies, nextAvailability } from '../features/lab/recovery-policy.mjs';
import { publicDiagnostics, sanitizePublicDetails, cooldownUntil } from '../features/lab/diagnostics.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });
export function cooldownDetails(cooldown, models, availableAt) {
  const details = sanitizePublicDetails(cooldown?.details) ?? publicDiagnostics(null, 'AI_COOLDOWN');
  details.models = { ...details.models, primary: models[0] ?? null, fallbacks: models.slice(1),
    successful: null, confirmedAttempts: [], notSelected: false, routingStatus: 'unknown' };
  details.request = { batchNumber: null, attemptNumber: null, httpStatus: null, durationMs: null };
  details.validation = { received: null, accepted: null, rejected: null };
  details.rateLimit = { ...details.rateLimit, scope: cooldown.scope, cooldownUntil: cooldown.until, timing: cooldown.timing,
    ...(availableAt != null && { availableAt: new Date(availableAt).toISOString() }),
    accountWide: details.category === 'daily_quota' && cooldown.scope === 'free_models' };
  details.recovery = null;
  delete details.referenceId;
  return details;
}

/** One budget across every model and retry. Caller owns pack persistence and
 * screening. No content repair, SDK retry, or automatic validation bypass. */
export async function recoverLabBatch({ generate, options, trace, budget, startAttempt, cooldowns,
  models = selectedModels(), config = recoveryConfig(), signal,
  now = Date.now, elapsed = () => performance.now(), random = Math.random,
  wait = (ms, signal) => sleep(ms, undefined, { signal }) }) {
  const began = elapsed(), namespace = cooldownNamespace(), route = requestScope(models), tried = new Set();
  const maximum = Math.min(budget, config.enabled ? config.maxAttempts : 1);
  const deadline = AbortSignal.timeout(config.maxDurationMs);
  const cancellation = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const remaining = () => config.maxDurationMs - (elapsed() - began);
  let calls = 0, current = models[0], lastError, details = null, outcome = 'failed';
  const localCooldowns = [], skipKeys = new Set();
  let knownCooldowns = [];
  trace.beginRecovery(models);
  async function active() {
    const shared = cooldowns ? await cooldowns.active(namespace, route, now()) : [];
    return knownCooldowns = [...shared, ...localCooldowns].filter(item => Date.parse(item.until) > now());
  }
  function skipped(blocked) {
    for (const model of models) {
      const item = blocked.find(limit => cooldownApplies(limit, model));
      const key = model + item?.until;
      if (item && !skipKeys.has(key)) {
        skipKeys.add(key);
        trace.recoveryDecision({ action: 'skipped', reason: 'active_cooldown', model, cooldown: item });
      }
    }
  }
  try {
    while (calls < maximum) {
      if (signal?.aborted) { outcome = 'cancelled'; throw failure('AI_RECOVERY_CANCELLED', 'Generation recovery was cancelled. Saved questions are preserved.'); }
      if (remaining() <= 0 || deadline.aborted) { outcome = 'deadline'; throw lastError ?? failure('AI_RECOVERY_DEADLINE', 'The recovery deadline was reached.'); }
      const blocked = await active();
      skipped(blocked);
      const available = eligibleModels(config.enabled ? models : models.slice(0,1), blocked, now());
      if (!available.length) {
        outcome = 'cooldown';
        details = cooldownDetails(blocked.sort((a,b) => Date.parse(a.until) - Date.parse(b.until))[0], models,
          nextAvailability(config.enabled ? models : models.slice(0,1),blocked,now()));
        if (!blocked.length) details = publicDiagnostics(null, 'AI_COOLDOWN');
        throw lastError ?? failure('AI_COOLDOWN', details.message);
      }
      if (!available.includes(current)) current = available[0];
      if (current !== models[0] && !calls) trace.recoveryDecision({ action: 'fallback', reason: 'active_cooldown', model: current });
      if (remaining() <= 0 || deadline.aborted || signal?.aborted) continue;
      trace.nextAttempt(startAttempt + calls);
      trace.recoveryDecision({ action: 'request', model: current, attemptNumber: startAttempt + calls });
      calls += 1; tried.add(current);
      try {
        // Preserve an in-flight batch on navigation. The external cancellation
        // signal stops the wait/next request; the total deadline bounds this one.
        const batch = await generate({ ...options, model: current, trace,
          timeoutMs: Math.max(1, Math.min(20000, Math.floor(remaining()))), signal: deadline });
        outcome = 'completed';
        trace.recoveryDecision({ action: 'completed', reason: 'success', model: current, httpStatus: trace.recoveryEvidence().effectiveStatus });
        return { batch, calls };
      } catch (error) {
        lastError = error;
        const evidence = trace.recoveryEvidence();
        const code = trace.publicDetails(error.code).code;
        const decision = recoveryFailure(evidence, code, current, now(), config);
        details = trace.publicDetails(code);
        if (decision.cooldown) {
          details.rateLimit = { ...details.rateLimit, scope: decision.cooldown.scope,
            cooldownUntil: decision.cooldown.until, timing: decision.cooldown.timing,
            accountWide: decision.reason === 'daily_quota' };
          decision.cooldown.details = details;
          localCooldowns.push(decision.cooldown);
          if (cooldowns) await cooldowns.put(namespace, route, decision.cooldown, details);
        }
        const available = eligibleModels(models, await active(), now());
        const alternative = decision.fallback && config.enabled ? available.find(model => !tried.has(model)) : null;
        const retryAt = cooldownUntil(details);
        const delay = Math.max(retryDelay(calls, config, random), retryAt ? retryAt - now() : 0);
        const retry = decision.retry;
        if (!config.enabled || calls >= maximum || (!alternative && !retry)) {
          outcome = calls >= maximum && (alternative || retry) ? 'budget_exhausted' : decision.cooldown ? 'cooldown' : 'failed';
          trace.recoveryDecision({ action: 'stop', reason: calls >= maximum ? 'attempt_budget' : decision.reason, model: current,
            httpStatus: evidence.effectiveStatus, cooldown: decision.cooldown });
          throw error;
        }
        // A different, unaffected model need not wait on this model's limit.
        const pause = alternative ? retryDelay(calls, config, random) : delay;
        if (pause > config.maxDelayMs || pause + 100 >= remaining() || deadline.aborted) {
          outcome = 'deadline'; trace.recoveryDecision({ action: 'stop', reason: 'deadline', model: current }); throw error;
        }
        trace.recoveryDecision({ action: alternative ? 'fallback' : 'retry', reason: decision.reason,
          model: alternative ?? current, httpStatus: evidence.effectiveStatus, delayMs: pause, cooldown: decision.cooldown });
        await trace.flush();
        await wait(pause, cancellation);
        if (alternative) current = alternative;
      }
    }
    outcome = 'budget_exhausted';
    throw lastError ?? failure('AI_PROVIDER_ERROR', 'The generation attempt budget was exhausted.');
  } catch (error) {
    if (error.code === 'LAB_COOLDOWN_UNAVAILABLE') {
      outcome = 'storage_failure'; trace.recoveryDecision({ action: 'stop', reason: 'storage_failure' });
      details = trace.publicDetails('LAB_COOLDOWN_UNAVAILABLE');
    }
    if (signal?.aborted) outcome = 'cancelled';
    else if (deadline.aborted) outcome = 'deadline';
    if (!details) details = trace.publicDetails(error.code);
    if (details.rateLimit?.scope) details.rateLimit.availableAt = new Date(nextAvailability(config.enabled ? models : models.slice(0,1),knownCooldowns,now()) ?? now()).toISOString();
    throw Object.assign(error, { publicDetails: details, recoveryCalls: calls });
  } finally {
    trace.finishRecovery(outcome, calls);
    await trace.flush();
  }
}
