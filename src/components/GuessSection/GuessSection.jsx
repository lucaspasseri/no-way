import { CheckCircle, Info } from "react-feather";
import GuessInput from "../GuessInput";
import LastGuessSection from "../LastGuessSection";
import GuessesList from "../GuessesList";
import { formatNumber } from "@/features/game/game-rules.mjs";
import styles from "./GuessSection.module.css";

/** @param {Pick<import('@/features/game/game-rules.mjs').GameState, 'guesses' | 'isLocked' | 'challenge'> & { canChallenge: boolean, onSubmitGuess: (value: number) => void, onChallenge: () => void }} props */
export default function GuessSection({ guesses, isLocked, challenge, canChallenge, onSubmitGuess, onChallenge }) {
  const lastGuess = guesses.at(-1) ?? null;
  return (
    <div className={styles.container}>
      <div className={styles.playFlow}>
        <GuessInput addGuess={onSubmitGuess} previousGuess={lastGuess?.value ?? null} disabled={!isLocked} />
        <LastGuessSection lastGuess={lastGuess} canChallenge={canChallenge} onChallenge={onChallenge} />
        <div className={styles.announcement} role='status' aria-atomic='true'>
          {challenge && <section className={styles.result + " surface-enter"} aria-labelledby='result-title'>
            {challenge.success ? <CheckCircle size={20} aria-hidden='true' /> : <Info size={20} aria-hidden='true' />}
            <div>
              <h2 id='result-title'>{challenge.success ? "Good call! That guess is too high." : "That guess holds up!"}</h2>
              <p>{formatNumber(challenge.guess)} is {challenge.success ? "greater than" : "less than or equal to"} the answer.</p>
              <p className={styles.answer}>The answer: <strong>{formatNumber(challenge.answer)}</strong></p>
            </div>
          </section>}
        </div>
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
