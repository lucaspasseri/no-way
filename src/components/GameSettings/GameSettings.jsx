import { useEffect, useRef } from 'react';
import { ChevronDown, RotateCcw, Settings } from 'react-feather';
import ToggleTheme from '../ToggleTheme';
import styles from './GameSettings.module.css';

/** @param {{ canReset: boolean, onResetGuesses: () => void }} props */
export default function GameSettings({ canReset, onResetGuesses }) {
  const settingsRef = useRef(null);

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

  return (
    <details className={styles.container} ref={settingsRef} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
      <summary aria-label='Game settings'>
        <Settings size={16} aria-hidden='true' />
        Settings
        <ChevronDown size={14} aria-hidden='true' className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <div className={styles.actions}>
          <ToggleTheme />
          <button className='button button-secondary button-danger' onClick={handleReset} disabled={!canReset} aria-describedby='reset-guesses-hint'>
            <RotateCcw size={16} aria-hidden='true' />Reset guesses
          </button>
        </div>
        <p id='reset-guesses-hint'>Reset clears guesses and restarts the timer. The question stays locked. Available during play when a locked question has guesses.</p>
      </div>
    </details>
  );
}
