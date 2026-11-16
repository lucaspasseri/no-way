'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Copy, GitBranch, Shield, X } from 'react-feather';
import { useI18n } from '@/i18n/LocalizationProvider';
import { cooldownActive, cooldownUntil, formatRetryTime, modelName, sanitizePublicDetails } from '@/features/lab/diagnostics.mjs';
import styles from './LabErrorResult.module.css';
import RecoverySummary from './RecoverySummary';

export function ModelRouting({ models, recovery, latest = false, showIdentifiers = true }) {
  const { t } = useI18n();
  if (!models?.primary && !models?.successful) return null;
  const entries = [models.primary, ...models.fallbacks].filter(Boolean);
  if (models.successful && !entries.includes(models.successful)) entries.push(models.successful);
  const skipped = id => recovery?.steps?.findLast(step => ['request','skipped'].includes(step.action) && step.model === id)?.action === 'skipped';
  const status = id => id === models.successful ? 'Used successfully' : models.confirmedAttempts.includes(id) ? 'Attempted (confirmed)' : skipped(id) ? 'Skipped during cooldown'
    : models.notSelected ? 'Not selected (confirmed)' : id === models.primary ? 'Requested' : 'Available as fallback';
  return <section className={styles.routing} aria-label={t('Model routing')}>
    <h3><GitBranch size={15} aria-hidden='true' />{t('Model routing')}<span>{latest && <>{t('Latest batch')} · </>}OpenRouter</span></h3>
    <ol>{entries.map((id, index) => <li key={id} data-success={id === models.successful}>
      <span className={styles.modelNumber} aria-hidden='true'>{id === models.successful ? <CheckCircle size={16} /> : String(index + 1).padStart(2, '0')}</span>
      <div><small>{t(id === models.primary ? 'Primary model' : id === models.successful ? 'Actual model' : 'Fallback model')}</small><strong>{modelName(id)}</strong></div>
      <span className={styles.badge}>{t(status(id))}</span>
    </li>)}</ol>
    <p>{t(models.notSelected ? 'The request was rejected before any model was selected.' : models.successful
      ? 'The answering model is confirmed. Other configured models are not confirmed attempts.'
      : models.confirmedAttempts.length ? 'Only explicitly reported attempts are shown as confirmed.'
      : 'Fallbacks were configured; model attempts are unknown.')}</p>
    {showIdentifiers && <details className={styles.technical}><summary>{t('Technical details')}</summary><dl>{entries.map(id => <div key={id}>
      <dt>{t(status(id))}</dt><dd>{id}</dd></div>)}</dl></details>}
  </section>;
}

export default function LabErrorResult({ details: input, pack, now, onRetry, onSettings, onKeep, onDismiss }) {
  const { t, locale, formatNumber } = useI18n();
  const [copyState, setCopyState] = useState('');
  const details = sanitizePublicDetails(input);
  if (!details) return null;
  const daily = details.category === 'daily_quota';
  const rate = details.rateLimit;
  const retryAt = cooldownUntil(details);
  const waiting = cooldownActive(details, now);
  const expired = retryAt && retryAt <= now;
  const Icon = daily || details.category === 'temporary_rate_limit' ? Clock : AlertCircle;
  const accepted = pack?.accepted ?? 0;
  const exhausted = pack && pack.attempts >= pack.maxAttempts;
  const canRetry = details.retryable && !waiting && (!daily || retryAt);
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(sanitizePublicDetails(details), null, 2)); setCopyState('Diagnostics copied'); }
    catch { setCopyState('Copy unavailable. Select the details below.'); }
  }
  const technical = [
    ['Error category', details.category], ['Error code', details.code], ['HTTP status', details.request.httpStatus],
    ['Primary model ID', details.models.primary], ['Fallback model IDs', details.models.fallbacks.join(', ') || t('None reported')],
    ['Actual model ID', details.models.successful], ['Confirmed model attempts', details.models.confirmedAttempts.join(', ') || t('None reported')],
    ['Routing status', t({ confirmed: 'Confirmed', partial: 'Partial information', unknown: 'Unknown' }[details.models.routingStatus])],
    ['Limit source', rate?.source], ['Request duration (ms)', details.request.durationMs],
    ['Batch', details.request.batchNumber], ['Attempt', details.request.attemptNumber], ['Reference ID', details.referenceId],
  ];
  const retryMinutes = retryAt ? Math.max(1, Math.ceil((retryAt - now) / 60000)) : null;
  return <section className={styles.result} aria-label={t('Generation report')}>
    <div className={styles.summary} role='alert'>
      <span className={styles.icon}><Icon size={23} aria-hidden='true' /></span>
      <div><span className={styles.eyebrow}>{t(daily ? 'DAILY QUOTA' : details.category === 'validation_failure' ? 'SCREENING REPORT'
        : pack?.status === 'generating' ? 'GENERATION PAUSED' : 'GENERATION STOPPED')}{details.request.httpStatus != null && ` · HTTP ${details.request.httpStatus}`}</span>
        <h2>{t(details.title)}</h2><p>{t(details.message)}</p></div>
      <button className={styles.dismiss} onClick={onDismiss} aria-label={t('Dismiss report')}><X size={18} /></button>
    </div>
    {rate && <div className={styles.availability}>
      <dl>{rate.limit != null && <div><dt>{t('Request limit')}</dt><dd>{formatNumber(rate.limit)}</dd></div>}
        {rate.remaining != null && <div><dt>{t('Requests remaining')}</dt><dd>{formatNumber(rate.remaining)}</dd></div>}
        <div className={styles.reset}><dt>{t(rate.timing === 'local_policy' ? 'Local safety wait' : rate.availableAt ? 'Next eligible model check' : daily ? 'Recorded quota reset' : 'Retry availability')}</dt><dd>{retryAt ? <time dateTime={new Date(retryAt).toISOString()}>{formatRetryTime(retryAt, locale)}</time> : t('Time unknown')}</dd>
          {waiting && <small>{new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(retryMinutes >= 60 ? Math.ceil(retryMinutes / 60) : retryMinutes, retryMinutes >= 60 ? 'hour' : 'minute')}</small>}</div></dl>
      {daily && <p>{t('Switching free models or generating another pack will not bypass this account-wide daily limit.')}</p>}
      {rate.timing === 'local_policy' && <p>{t('The provider did not supply a reset. The Lab is briefly pausing requests to avoid repeated failures. This wait does not guarantee renewed quota.')}</p>}
      <p>{t(expired ? 'The recorded wait has ended. You can try again, but renewed quota or capacity is not guaranteed.'
        : waiting ? 'Retrying before this time is unlikely to work.' : 'The provider did not supply a retry time. No reset time has been assumed.')}</p>
    </div>}
    <div className={styles.body}>
      <ModelRouting models={details.models} recovery={details.recovery} showIdentifiers={false} />
      <section className={styles.outcome}><h3><Shield size={15} aria-hidden='true' />{t('What happened to my questions?')}</h3>
        {details.request.attemptNumber != null && <p>{t('Latest request · batch {batch}, attempt {attempt}', { batch: details.request.batchNumber, attempt: details.request.attemptNumber })}</p>}
        <p>{t(details.models.notSelected ? 'This request was rejected before any questions were generated.'
          : details.category === 'invalid_response' ? 'The AI response could not be parsed into a usable batch.'
          : details.category === 'validation_failure' ? '{received} questions received; {accepted} accepted and {rejected} rejected in this batch.'
          : 'This request did not add any questions to the pack.', details.validation ?? {})}</p>
        <strong>{pack ? t('{accepted} of {requested} questions saved in this pack.', { accepted, requested: pack.config.count }) : t('No questions were added by this request.')}</strong>
        {accepted > 0 && <p>{t('Your accepted questions are preserved. Keep them to review and play.')}</p>}
      </section>
    </div>
    {details.recovery && <div className={styles.recovery}><RecoverySummary recovery={details.recovery} failure /></div>}
    <div className={styles.actions}><h3>{t('What can I do now?')}</h3>
      {exhausted && <p>{t('This pack has reached its attempt limit. Generate a new pack or keep any accepted questions.')}</p>}
      <p>{t(daily && !expired ? rate?.timing === 'local_policy' ? 'No quota reset was supplied. Wait before checking availability again.' : 'Wait for the recorded reset before trying again. If no reset was supplied, check back later.'
        : !details.retryable ? 'Return to settings or ask the game host to review the AI connection.' : 'Try again when available, or keep the questions already saved.')}</p>
      <div>{canRetry && <button className='button' onClick={onRetry}>{t(pack?.status === 'generating' ? 'Resume generation' : 'Regenerate pack')}</button>}
        {accepted > 0 && <button className='button button-secondary' onClick={onKeep}>{t('Review saved questions')}</button>}
        <button className={styles.textButton} onClick={onSettings}>{t('Return to AI Lab settings')}</button></div>
    </div>
    <details className={styles.technical}><summary>{t('Technical details')}</summary>
      <dl>{technical.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value ?? t('Unknown')}</dd></div>)}</dl>
      <button className={styles.textButton} onClick={copy}><Copy size={14} aria-hidden='true' />{t('Copy diagnostics')}</button><span role='status'>{t(copyState)}</span>
    </details>
  </section>;
}
