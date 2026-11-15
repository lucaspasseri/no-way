"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { useEffect, useState } from 'react';
import { Clock } from 'react-feather';
import styles from './TimerSection.module.css';
function elapsed(now, start) {
  const seconds = now === null || start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

/** @param {{ lockedInTime: number | null, sinceLastGuessTime: number | null }} props */
export default function TimerSection({
  lockedInTime,
  sinceLastGuessTime
}) {
  const {
    t
  } = useI18n();
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (lockedInTime === null) return;
    const interval = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedInTime]);
  return <div className={styles.container}>
      <Clock size={16} aria-hidden='true' />
      <span>{t("Elapsed:")} <strong>{elapsed(now, lockedInTime)}</strong></span>
      {sinceLastGuessTime !== null && <span className={styles.lastGuess}>{t("Last guess:")} <strong>{elapsed(now, sinceLastGuessTime)}</strong></span>}
    </div>;
}
