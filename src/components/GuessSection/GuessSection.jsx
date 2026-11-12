import GuessInput from "../GuessInput";
import LastGuessSection from "../LastGuessSection";
import GuessesList from "../GuessesList";
import styles from "./GuessSection.module.css";

/** @param {Pick<import('@/features/game/game-rules.mjs').GameState, 'guesses' | 'isLocked'> & { canChallenge: boolean, onSubmitGuess: (value: number) => void, onChallenge: () => void }} props */
export default function GuessSection({ guesses, isLocked, canChallenge, onSubmitGuess, onChallenge }) {
  const lastGuess = guesses.at(-1) ?? null;
  return (
    <div className={styles.container}>
      <div className={styles.playFlow}>
        <GuessInput addGuess={onSubmitGuess} previousGuess={lastGuess?.value ?? null} disabled={!isLocked} />
        <LastGuessSection lastGuess={lastGuess} canChallenge={canChallenge} onChallenge={onChallenge} />
      </div>
      <section className={styles.leaderboard} aria-labelledby='guesses-heading'>
        <div className={styles.heading}>
          <h2 id='guesses-heading'>Guess history</h2>
          <span>{guesses.length} {guesses.length === 1 ? "guess" : "guesses"} placed</span>
        </div>
        <GuessesList list={guesses} />
      </section>
    </div>
  );
}
