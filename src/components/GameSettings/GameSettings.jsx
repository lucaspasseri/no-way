"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { useEffect, useRef } from 'react';
import { ChevronDown, RotateCcw, Settings } from 'react-feather';
import Link from 'next/link';
import ToggleTheme from '../ToggleTheme';
import styles from './GameSettings.module.css';
import { useGameId } from '@/features/game/GameIds';

/** @param {{ canReset: boolean, onResetGuesses: () => void }} props */
export default function GameSettings({
  canReset,
  onResetGuesses
}) {
  const { t, locale, unitSystem, updatePreferences } = useI18n();
  const settingsRef = useRef(null);
  const hintId = useGameId('reset-guesses-hint');
  useEffect(() => {
    const settings = settingsRef.current;
    function handlePointerDown(event) {
      if (!settings.contains(event.target)) settings.open = false;
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape' && settings.open) {
        settings.open = false;
        settings.querySelector('summary').focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  function handleReset() {
    onResetGuesses();
    const settings = settingsRef.current;
    settings.open = false;
    settings.querySelector('summary').focus();
  }
  return <details className={styles.container} ref={settingsRef} onBlur={event => {
    // Safari can blur the summary without focusing a tapped button. Keep it
    // visible until the click lands; outside taps are handled by pointerdown.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.open = false;
    }
  }}>
      <summary aria-label={t("Game settings")}>
        <Settings size={16} aria-hidden='true' /> {t("Settings")} <ChevronDown size={14} aria-hidden='true' className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <Link href='/question-lab' className={styles.labLink} onClick={() => {
        settingsRef.current.open = false;
      }}>{t("✳ AI Question Lab")} <span>{t("Experimental")}</span></Link>
        <fieldset className={styles.localization}>
          <legend>{t('Language & Measurements')}</legend>
          <label htmlFor={hintId + '-language'}>{t('Language')}</label>
          <select id={hintId + '-language'} value={locale} onChange={event => updatePreferences({ locale: event.target.value })}>
            <option value='en'>English</option><option value='pt-BR'>Português (Brasil)</option>
          </select>
          <label htmlFor={hintId + '-units'}>{t('Measurement system')}</label>
          <select id={hintId + '-units'} value={unitSystem} onChange={event => updatePreferences({ unitSystem: event.target.value })}>
            <option value='metric'>{t('Metric')}</option><option value='original'>{t('Original units')}</option>
          </select>
          <p>{t('Language updates immediately. Measurements apply to the next question; current guesses are kept.')}</p>
        </fieldset>
        <div className={styles.actions}>
          <ToggleTheme />
          <button className='button button-secondary button-danger' onClick={handleReset} disabled={!canReset} aria-describedby={hintId}>
            <RotateCcw size={16} aria-hidden='true' />{t("Reset guesses")} </button>
        </div>
        <p id={hintId}>{t("Reset clears guesses and restarts the timer. The question stays locked. Available during play when a locked question has guesses.")}</p>
      </div>
    </details>;
}
