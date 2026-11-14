import GameSettings from "../GameSettings";
import styles from "./LayoutHeader.module.css";

/** @param {{ totalQuestions: number, canReset: boolean, onResetGuesses: () => void }} props */
export default function LayoutHeader({ totalQuestions, canReset, onResetGuesses }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden='true'>!</span>
        <div>
          <h1>No Way</h1>
          <p role='status'>{totalQuestions} {totalQuestions === 1 ? 'question' : 'questions'}</p>
        </div>
      </div>
      <GameSettings canReset={canReset} onResetGuesses={onResetGuesses} />
    </header>
  );
}
