"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import GameSettings from "../GameSettings";
import Brand from '../Brand/Brand';
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
      <Brand heading><span role='status'>{totalQuestions} {totalQuestions === 1 ? t("question") : t("questions")}</span></Brand>
      <GameSettings canReset={canReset} onResetGuesses={onResetGuesses} />
    </header>;
}
