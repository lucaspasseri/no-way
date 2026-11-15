import { HelpCircle } from "react-feather";
import { formatNumber } from "@/features/game/game-rules.mjs";
import styles from "./LastGuessSection.module.css";
import { useGameId } from '@/features/game/GameIds';

/** @param {{ lastGuess: import('@/features/game/game-rules.mjs').Guess | null, canChallenge: boolean, onChallenge: () => void }} props */
export default function LastGuessSection({ lastGuess, canChallenge, onChallenge }) {
  const prefix = useGameId('');
  return (
    <section className={styles.container} aria-labelledby={prefix + 'latest-guess-heading'}>
      <div className={styles.guess}>
        <h2 id={prefix + 'latest-guess-heading'}>Latest guess</h2>
        <strong id={prefix + 'latest-guess-value'} className={styles.value + " number-pulse"} key={lastGuess?.id ?? "empty"}>
          {lastGuess ? formatNumber(lastGuess.value) : "—"}
        </strong>
        {!lastGuess && <p className={styles.empty}>Place a guess to enable a challenge.</p>}
      </div>
      <button className='button button-challenge' disabled={!canChallenge} onClick={onChallenge} aria-describedby={prefix + 'latest-guess-value'}>
        <HelpCircle size={17} aria-hidden='true' />Doubt guess
      </button>
    </section>
  );
}
