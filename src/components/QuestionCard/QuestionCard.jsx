"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { ArrowRight, Lock, Shuffle, Unlock } from 'react-feather';
import BigLetter from '../BigLetter';
import styles from './QuestionCard.module.css';
import { useGameId } from '@/features/game/GameIds';
export default function QuestionCard({
  currentQuestion,
  isLocked,
  canChangeQuestion,
  pending,
  preferences,
  onToggleLock,
  onNextQuestion,
  onRandomQuestion,
  headingRef
}) {
  const {
    locale,
    t,
    metadataLabel
  } = useI18n();
  const {
    id,
    curatedId,
    question,
    category,
    difficulty
  } = currentQuestion ?? {};
  const titleId = useGameId('question-title');
  const hintId = useGameId('question-controls-hint');
  return <section className={styles.container} aria-labelledby={titleId}>
      <div className={styles.main + ' surface-enter'} key={id} aria-busy={pending}>
        <BigLetter letter='Q' />
        <div className={styles.questionAndDetails}>
          <div className={styles.details}>
            <div className={styles.chips}>
              <span className={styles.category} aria-label={`${t("Category")}: ${category ? metadataLabel(category) : t("Number trivia")}`}>{category ? metadataLabel(category) : t("Number trivia")}</span>
              <span className={styles.category} aria-label={`${t("Difficulty")}: ${difficulty ? metadataLabel(difficulty) : t("Not specified")}`}>{difficulty ? metadataLabel(difficulty) : t("Difficulty not specified")}</span>
            </div>
            <div className={styles.metadata}>
              {id != null && <span className={styles.questionNumber}>#{String(curatedId ?? id).padStart(2, '0')}</span>}
              <span className={styles.status}>
                {isLocked ? <Lock size={12} aria-hidden='true' /> : <Unlock size={12} aria-hidden='true' />}
                {isLocked ? t("Locked") : t("Unlocked")}
              </span>
            </div>
          </div>
          <h2 lang={currentQuestion?.contentLocale ?? locale} id={titleId} ref={headingRef} tabIndex={-1}>{question || t("No questions available. Please try again later.")}</h2>
          {currentQuestion?.localization?.converted && <p>{t('Units converted · rounded to a whole unit')}</p>}
          {currentQuestion?.localization && !currentQuestion.localization.texts[locale] && <p>{t('English question · translation unavailable')}</p>}
        </div>
      </div>
      <footer className={styles.footer}>
        {preferences}
        <div className={styles.actions} role='group' aria-label={t("Question actions")} aria-busy={pending}>
          <button className='button button-secondary' onClick={onToggleLock} disabled={pending || !currentQuestion} aria-pressed={isLocked} aria-describedby={hintId}>
            {isLocked ? <Unlock size={16} aria-hidden='true' /> : <Lock size={16} aria-hidden='true' />}
            {isLocked ? t("Unlock question") : t("Lock question")}
          </button>
          <button className='button button-secondary' onClick={onNextQuestion} disabled={!canChangeQuestion} aria-describedby={hintId}>
            <ArrowRight size={16} aria-hidden='true' />{t("Next question")} </button>
          <button className='button button-secondary' onClick={onRandomQuestion} disabled={!canChangeQuestion} aria-describedby={hintId}>
            <Shuffle size={16} aria-hidden='true' />{t("Random question")} </button>
        </div>
        <p id={hintId}>{isLocked ? t("Question locked. Unlock to change questions; your guesses will be kept until you change the question.") : t("Lock to start guessing. Choosing a different question clears guesses and the challenge result.")}</p>
      </footer>
    </section>;
}
