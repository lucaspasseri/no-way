import { useState } from 'react';
import { ArrowRight } from 'react-feather';
import { formatNumber, validateGuess } from '@/features/game/game-rules.mjs';
import styles from './GuessInput.module.css';
import { useGameId } from '@/features/game/GameIds';

/** @param {{ addGuess: (value: number) => void, previousGuess: number | null, disabled: boolean }} props */
export default function GuessInput({ addGuess, previousGuess = null, disabled = false }) {
  const prefix = useGameId('');
  const [guess, setGuess] = useState('');
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const error = wasSubmitted && !disabled ? validateGuess(guess, previousGuess) : null;

  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    const validationError = validateGuess(guess, previousGuess);
    setWasSubmitted(true);
    if (validationError) return;
    addGuess(Number(guess));
    setGuess('');
    setWasSubmitted(false);
  }
  return (
    <form className={styles.container} onSubmit={handleSubmit} noValidate>
      <div className={styles.header}>
        <label htmlFor={prefix + 'guess-input'}><span aria-hidden='true' />New guess</label>
        <span id={prefix + 'guess-hint'}>{previousGuess === null ? 'Start at 0 or higher' : <>Must be &gt; <strong>{formatNumber(previousGuess)}</strong></>}</span>
      </div>
      <div className={styles.field}>
        <input
          id={prefix + 'guess-input'}
          type='number'
          name='guess'
          inputMode='decimal'
          step='any'
          min='0'
          value={guess}
          onChange={event => {
            setGuess(event.target.value);
            setWasSubmitted(false);
          }}
          disabled={disabled}
          placeholder='Type your number…'
          aria-describedby={prefix + 'guess-hint' + (error ? ' ' + prefix + 'guess-error' : '') + (disabled ? ' ' + prefix + 'guess-disabled' : '')}
          aria-invalid={Boolean(error)}
        />
        <button className='button' type='submit' disabled={disabled || guess.trim() === ''}>Send <ArrowRight size={16} aria-hidden='true' /></button>
      </div>
      {error && <p id={prefix + 'guess-error'} className={styles.error} role='alert'>{error}</p>}
      {disabled && <p id={prefix + 'guess-disabled'} className={styles.hint}>Lock the question to start guessing.</p>}
    </form>
  );
}
