'use client';

import { CheckCircle, RefreshCw } from 'react-feather';
import { useI18n } from '@/i18n/LocalizationProvider';
import { modelName, publicRecovery } from '@/features/lab/diagnostics.mjs';
import styles from './RecoverySummary.module.css';

const reasons = {
  provider_failure: 'The provider was temporarily unavailable.', model_rate_limit: 'The requested model was temporarily rate limited.',
  free_rate_limit: 'Free-model requests were temporarily limited.', unknown_rate_limit: 'The provider reported a rate limit with an unknown scope.',
  active_cooldown: 'A configured model was skipped during an active cooldown.', connection_failure: 'A connection could not be established.',
  uncertain_completion: 'The previous request may have completed. It was not replayed automatically.',
  content_failure: 'Content errors go through screening; automatic provider recovery does not repair them.',
  authentication: 'AI access needs attention.', invalid_request: 'The provider could not accept the request settings.',
  credit_restriction: 'The AI account has a credit or spending restriction.', daily_quota: 'The daily free-model quota was exhausted.',
  attempt_budget: 'The recovery attempt budget was reached.', deadline: 'The wait would exceed the recovery deadline.',
  cancelled: 'Further recovery was cancelled.', storage_failure: 'Shared availability could not be checked.',
  unknown_failure: 'No safe automatic recovery was available.', success: 'The AI response was received.',
};
export default function RecoverySummary({ recovery: input, failure = false }) {
  const { t } = useI18n();
  const recovery = publicRecovery(input);
  if (!recovery) return null;
  const complete = recovery.outcome === 'completed';
  const interesting = recovery.usedAlternative || recovery.providerCalls > 1 || recovery.steps.some(step => step.action === 'skipped');
  if (!interesting && (!failure || complete)) return null;
  return <section className={styles.summary} aria-label={t('Recovery summary')}>
    <div className={styles.heading} role={complete ? 'status' : undefined}>
      {complete ? <CheckCircle size={17} aria-hidden='true' /> : <RefreshCw size={17} aria-hidden='true' />}
      <div><h3>{t(complete ? 'Generation recovered' : 'Recovery stopped')}</h3>
        {recovery.batchNumber != null && <p>{t('Batch')} {recovery.batchNumber}</p>}
        <p>{t(complete ? recovery.usedAlternative ? 'Questions were generated using an approved alternative model.'
          : 'Questions were generated after a temporary connection or provider failure.'
          : 'Automatic recovery stopped within the configured limits. Saved questions are preserved.')}</p>
        {recovery.usedAlternative && <p>{t('Requested: {requested} · Used: {actual}', { requested: modelName(recovery.requestedModels[0]), actual: modelName(recovery.successfulModel) })}</p>}
        {complete && <p>{t('Recovery does not validate questions. Normal screening still applies.')}</p>}
      </div>
    </div>
    <details><summary>{t('Recovery details')} · {t('{count} provider requests', { count: recovery.providerCalls })}</summary>
      <p>{t('Batch {batch} · Recovery reference {reference}', { batch: recovery.batchNumber, reference: recovery.id })}</p>
      <p>{t('These are application requests. A sent request does not confirm that a provider selected a model.')}</p>
      <ol>{recovery.steps.map((step,index) => <li key={index}>
        <strong>{t({ request: 'AI request sent', retry: 'Retry scheduled', fallback: 'Approved alternative selected', skipped: 'Skipped during cooldown',
          stop: 'Recovery stopped', completed: 'AI response received' }[step.action])}{step.model && ` · ${modelName(step.model)}`}</strong>
        {step.action !== 'request' && <span>{t(reasons[step.reason] ?? reasons.unknown_failure)}</span>}
        {step.httpStatus != null && <small>HTTP {step.httpStatus}</small>}
      </li>)}</ol>
    </details>
  </section>;
}
