'use client';

import { useI18n } from "@/i18n/LocalizationProvider";
import { useState } from 'react';
import Link from 'next/link';
import { Flag } from 'react-feather';
import { topicLabel } from '@/features/lab/config.mjs';
import { labRequest } from '@/features/lab/client.mjs';
import styles from './ExperimentalPack.module.css';
export default function ExperimentalPack({
  pack,
  questionId,
  index,
  showNavigation = true
}) {
  const {
    t, locale
  } = useI18n();
  const [reported, setReported] = useState(pack.reported ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function report() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      setReported((await labRequest({
        action: 'report',
        id: pack.id,
        questionId
      })).pack.reported);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  return <aside className={styles.banner} aria-label={t("Experimental question pack")}>
    <div className={styles.top}><strong>{t("✳ Experimental ·")} {t(topicLabel(pack.config, locale))}</strong><span>{index + 1} / {pack.accepted}</span></div>
    <p>{t('This pack keeps its original language and measurements. New preferences apply to new packs.')} · {pack.config.locale ?? 'en'} · {t(pack.config.unitSystem === 'metric' ? 'Metric' : 'Original units')}</p>
    <p>{t("AI-generated answers are unverified and may be incorrect. Casual play only; these results don’t count toward competitive records.")}</p>
    {pack.accepted < pack.config.count && <p>{t('{available} of {requested} requested questions are available. This batch is ready to play.', { available: pack.accepted, requested: pack.config.count })}</p>}
    <div className={styles.actions}>{showNavigation && <><Link href='/'>{t("Return to regular game")}</Link><Link href='/question-lab'>{t("Back to AI Lab")}</Link></>}
      <button onClick={report} disabled={pending || reported.includes(questionId)}><Flag size={12} />{reported.includes(questionId) ? t("Question reported") : pending ? t("Saving report…") : t("Report questionable answer")}</button></div>
    {reported.includes(questionId) && <p role='status'>{t("Flag saved with this temporary pack. No factual review has been performed.")}</p>}
    {error && <p role='alert'>{t(error)}</p>}
  </aside>;
}
