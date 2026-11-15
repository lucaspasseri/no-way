"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { useState } from 'react';
import { ArrowRight } from 'react-feather';
import { parseNumber } from '@/i18n/config.mjs';
import { validateGuess } from '@/features/game/game-rules.mjs';
import styles from './GuessInput.module.css';
import { useGameId } from '@/features/game/GameIds';

/** @param {{ addGuess: (value: number) => void, previousGuess: number | null, disabled: boolean }} props */
export default function GuessInput({
  addGuess,
  previousGuess = null,
  disabled = false
}) {
  const {
    locale,
    t,
    formatNumber
  } = useI18n();
  const prefix = useGameId('');
  const [guess, setGuess] = useState('');
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const rawError = wasSubmitted && !disabled ? validateGuess(guess.trim() === '' ? '' : parseNumber(guess, locale), previousGuess) : null;
  const error = rawError?.startsWith('Your guess must be higher than ') ? t('Your guess must be higher than {value}.', { value: formatNumber(previousGuess) }) : rawError && t(rawError);
  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    const validationError = validateGuess(guess.trim() === '' ? '' : parseNumber(guess, locale), previousGuess);
    setWasSubmitted(true);
    if (validationError) return;
    addGuess(parseNumber(guess, locale));
    setGuess('');
    setWasSubmitted(false);
  }
  return <form className={styles.container} onSubmit={handleSubmit} noValidate>
      <div className={styles.header}>
        <label htmlFor={prefix + 'guess-input'}><span aria-hidden='true' />{t("New guess")}</label>
        <span id={prefix + 'guess-hint'}>{previousGuess === null ? t("Start at 0 or higher") : <>{t("Must be >")} <strong>{formatNumber(previousGuess)}</strong></>}</span>
      </div>
      <div className={styles.field}>
        <input id={prefix + 'guess-input'} type='text' name='guess' inputMode='decimal' step='any' min='0' value={guess} onChange={event => {
        setGuess(event.target.value);
        setWasSubmitted(false);
      }} disabled={disabled} placeholder={t("Type your number…")} aria-describedby={prefix + 'guess-hint' + (error ? ' ' + prefix + 'guess-error' : '') + (disabled ? ' ' + prefix + 'guess-disabled' : '')} aria-invalid={Boolean(error)} />
        <button className='button' type='submit' disabled={disabled || guess.trim() === ''}>{t("Send")} <ArrowRight size={16} aria-hidden='true' /></button>
      </div>
      {error && <p id={prefix + 'guess-error'} className={styles.error} role='alert'>{t(error)}</p>}
      {disabled && <p id={prefix + 'guess-disabled'} className={styles.hint}>{t("Lock the question to start guessing.")}</p>}
    </form>;
}
