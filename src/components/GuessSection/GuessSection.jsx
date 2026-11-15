"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import GuessInput from "../GuessInput";
import LastGuessSection from "../LastGuessSection";
import GuessesList from "../GuessesList";
import styles from "./GuessSection.module.css";
import { useGameId } from '@/features/game/GameIds';

/** @param {Pick<import('@/features/game/game-rules.mjs').GameState, 'guesses' | 'isLocked'> & { canChallenge: boolean, challengeFailed: boolean, challengePending: boolean, challengeError: string | null, onSubmitGuess: (value: number) => void, onChallenge: () => void }} props */
export default function GuessSection({
  guesses,
  isLocked,
  canChallenge,
  challengeFailed,
  challengePending,
  challengeError,
  onSubmitGuess,
  onChallenge
}) {
  const {
    t
  } = useI18n();
  const lastGuess = guesses.at(-1) ?? null;
  const headingId = useGameId('guesses-heading');
  return <div className={styles.container}>
      <div className={styles.playFlow}>
        <GuessInput addGuess={onSubmitGuess} previousGuess={lastGuess?.value ?? null} disabled={!isLocked || challengePending} />
        <LastGuessSection lastGuess={lastGuess} canChallenge={canChallenge} onChallenge={onChallenge} />
        <p className={styles.feedback} role='status'>
          {challengePending ? t("Checking challenge…") : (challengeError && t(challengeError)) || challengeFailed && t("Challenge failed! The guess is still valid. Keep playing.")}
        </p>
      </div>
      <section className={styles.leaderboard} aria-labelledby={headingId}>
        <div className={styles.heading}>
          <h2 id={headingId}>{t("Guess history")}</h2>
          <span>{t(guesses.length === 1 ? '{count} guess placed' : '{count} guesses placed', { count: guesses.length })}</span>
        </div>
        <GuessesList list={guesses} />
      </section>
    </div>;
}
