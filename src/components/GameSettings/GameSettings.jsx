import { useEffect, useRef } from 'react';
import { ChevronDown, RotateCcw, Settings } from 'react-feather';
import Link from 'next/link';
import ToggleTheme from '../ToggleTheme';
import styles from './GameSettings.module.css';
import { useGameId } from '@/features/game/GameIds';

/** @param {{ canReset: boolean, onResetGuesses: () => void }} props */
export default function GameSettings({ canReset, onResetGuesses }) {
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

  return (
    <details className={styles.container} ref={settingsRef} onBlur={event => {
      // Safari can blur the summary without focusing a tapped button. Keep it
      // visible until the click lands; outside taps are handled by pointerdown.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.open = false;
      }
    }}>
      <summary aria-label='Game settings'>
        <Settings size={16} aria-hidden='true' />
        Settings
        <ChevronDown size={14} aria-hidden='true' className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <Link href='/question-lab' className={styles.labLink} onClick={() => { settingsRef.current.open = false; }}>✳ AI Question Lab <span>Experimental</span></Link>
        <div className={styles.actions}>
          <ToggleTheme />
          <button className='button button-secondary button-danger' onClick={handleReset} disabled={!canReset} aria-describedby={hintId}>
            <RotateCcw size={16} aria-hidden='true' />Reset guesses
          </button>
        </div>
        <p id={hintId}>Reset clears guesses and restarts the timer. The question stays locked. Available during play when a locked question has guesses.</p>
      </div>
    </details>
  );
}
