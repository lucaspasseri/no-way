import { ChevronDown, RotateCcw, Settings } from 'react-feather';
import ToggleTheme from '../ToggleTheme';
import styles from './GameSettings.module.css';

/** @param {{ canReset: boolean, onResetGuesses: () => void }} props */
export default function GameSettings({ canReset, onResetGuesses }) {
  return (
    <details className={styles.container}>
      <summary>
        <Settings size={16} aria-hidden='true' />
        Game settings
        <ChevronDown size={14} aria-hidden='true' className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <div className={styles.actions}>
          <ToggleTheme />
          <button className='button button-secondary button-danger' onClick={onResetGuesses} disabled={!canReset} aria-describedby='reset-guesses-hint'>
            <RotateCcw size={16} aria-hidden='true' />Reset guesses
          </button>
        </div>
        <p id='reset-guesses-hint'>Reset clears guesses and the revealed answer, and restarts the timer. The question stays locked. Available when a locked question has guesses.</p>
      </div>
    </details>
  );
}
