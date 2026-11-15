"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import GameSettings from "../GameSettings";
import styles from "./LayoutHeader.module.css";

/** @param {{ totalQuestions: number, canReset: boolean, onResetGuesses: () => void }} props */
export default function LayoutHeader({
  totalQuestions,
  canReset,
  onResetGuesses
}) {
  const {
    t
  } = useI18n();
  return <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden='true'>!</span>
        <div>
          <h1>No Way</h1>
          <p role='status'>{totalQuestions} {totalQuestions === 1 ? t("question") : t("questions")}</p>
        </div>
      </div>
      <GameSettings canReset={canReset} onResetGuesses={onResetGuesses} />
    </header>;
}
