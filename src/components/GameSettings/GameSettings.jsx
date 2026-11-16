"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { useRef } from 'react';
import { RotateCcw, Settings, X } from 'react-feather';
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
  const titleId = hintId + '-title';
  function close() { settingsRef.current.close(); }
  function handleReset() {
    onResetGuesses();
    close();
  }
  return <div className={styles.container}>
      <button className={styles.trigger} aria-label={t("Game settings")} aria-haspopup='dialog' onClick={() => settingsRef.current.showModal()}>
        <Settings size={16} aria-hidden='true' /> {t("Settings")}
      </button>
      {/* The native top layer escapes clipping/stacking contexts and makes the
          underlying page inert. Escape, focus trapping and restoration are native. */}
      <dialog className={styles.content} ref={settingsRef} aria-labelledby={titleId} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
        <div className={styles.heading}><h2 id={titleId}>{t("Game settings")}</h2><button className={styles.close} aria-label={t('Close settings')} onClick={close}><X size={20} aria-hidden='true' /></button></div>
        <Link href='/question-lab' className={styles.labLink} onClick={close}>{t("✳ AI Question Lab")} <span>{t("Experimental")}</span></Link>
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
      </dialog>
    </div>;
}
