import { TrendingUp } from 'react-feather';
import { formatNumber } from '@/features/game/game-rules.mjs';
import styles from './GuessesLists.module.css';

/** @param {{ list: import('@/features/game/game-rules.mjs').Guess[] }} props */
export default function GuessesList({ list }) {
  return (
    <div className={styles.container}>
      {list.length ? <ol className={styles.list} reversed>
        {list.slice().reverse().map((guess, index) => <li key={guess.id} className={index === 0 ? styles.leading : undefined}>
          <span className={styles.position}>{list.length - index}</span>
          <span className={styles.name}>{index === 0 ? 'Latest guess' : 'Guess ' + (list.length - index)}{index === 0 && <span className={styles.topLabel}>Current top</span>}</span>
          <strong>{formatNumber(guess.value)}</strong>
        </li>)}
      </ol> : <div className={styles.empty}><TrendingUp size={28} aria-hidden='true' /><strong>The ladder starts here</strong><p>Place the first guess.<br />Then keep raising the stakes.</p></div>}
      <p className={styles.rule}>Each guess must be higher than the previous.</p>
      <span className={styles.srOnly} role='status'>{list.length ? 'Guess ' + list.length + ' placed: ' + formatNumber(list.at(-1).value) + '.' : ''}</span>
    </div>
  );
}
