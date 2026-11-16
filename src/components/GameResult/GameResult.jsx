"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { ArrowRight, BookOpen, CheckCircle, ExternalLink } from 'react-feather';
import { getGuessDifference } from '@/features/game/game-rules.mjs';
import styles from './GameResult.module.css';
import { useGameId } from '@/features/game/GameIds';
import Link from 'next/link';

/** @param {{ result: import('@/features/game/game-rules.mjs').ChallengeResult, onNextRound: () => void, error: string | null, pending: boolean, preferences: import('react').ReactNode, headingRef: import('react').RefObject<HTMLHeadingElement | null> }} props */
export default function GameResult({
  result,
  onNextRound,
  error,
  headingRef,
  pending,
  preferences,
  complete = false,
  pack = null,
  playedCount = 0
}) {
  const {
    locale,
    t,
    formatNumber
  } = useI18n();
  const {
    guess,
    answer,
    question
  } = result;
  const prefix = useGameId('');
  const {
    explanation,
    'src-label': sourceLabel,
    src
  } = question;
  const displayedExplanation = question.explanationTexts?.[locale] ?? explanation;
  const explanationLocale = question.explanationTexts?.[locale] ? locale : question.contentLocale ?? 'en';
  const difference = formatNumber(getGuessDifference(guess, answer));
  const experimental = question.verification === 'unverified';
  const answerLabel = experimental ? t("Generated answer") : t("Correct Answer");
  return <section className={`${styles.container} ${styles.success}`} aria-labelledby={prefix + 'result-title'}>
      <header className={styles.hero}>
        <div className={styles.outcomeIcon}><CheckCircle size={28} aria-hidden='true' /></div>
        <p className={styles.eyebrow}>{t("Round complete")}</p>
        <h2 id={prefix + 'result-title'} tabIndex={-1} ref={headingRef} aria-describedby={prefix + 'result-description'}> {t("Challenge successful!")} </h2>
        <p id={prefix + 'result-description'}>{experimental ? t("The last guess was higher than the AI-generated answer. Its accuracy is unverified.") : t("The last guess was higher than the correct answer.")}</p>
      </header>

      <section className={styles.comparison} aria-labelledby={prefix + 'result-question'}>
        <p className={styles.eyebrow}>{t("The question")}</p>
        <h3 lang={question.contentLocale ?? locale} id={prefix + 'result-question'}>{question.localization?.texts[locale] ?? question.question}</h3>
        <dl className={styles.numbers}>
          <div className={styles.guessCard}>
            <dt>{t("Last Guess")}</dt>
            <dd>{formatNumber(guess)}</dd>
          </div>
          <div className={styles.answerCard}>
            <dt>{answerLabel}</dt>
            <dd>{formatNumber(answer)}</dd>
          </div>
        </dl>
        <p className={styles.difference}>{t('The guess exceeded the answer by {value}.', { value: difference })}</p>
      </section>

      {(explanation || sourceLabel || src) && <section className={styles.explanation} aria-labelledby={prefix + 'answer-explanation'}>
          <h3 id={prefix + 'answer-explanation'}><BookOpen size={16} aria-hidden='true' />{t("About the answer")}</h3>
          {displayedExplanation && <>{locale === 'pt-BR' && explanationLocale === 'en' && <p>{t('Original reference text (English)')}</p>}{question.localization?.converted && <p>{t('Source explanation uses original units.')}</p>}<p lang={explanationLocale}>{displayedExplanation}</p></>}
          {(sourceLabel || src) && <p className={styles.source}>{t("Source:")} {src ? <a href={src} target='_blank' rel='noreferrer'>{sourceLabel ? t(sourceLabel) : t("View reference")}<ExternalLink size={12} aria-hidden='true' /><span className={styles.srOnly}> {t("(opens in a new tab)")}</span></a> : t(sourceLabel)}</p>}
        </section>}

      <footer className={styles.actions}>
        {preferences}
        {error && <p className={styles.error} role='alert'>{t(error)}</p>}
        {complete && pack ? <>
          <p className={styles.packSummary} role='status'><strong>{t('Pack complete')}</strong><br /><span>{t('{played} of {total} available questions played.', { played: playedCount, total: pack.questions.length })}</span></p>
          <Link className='button' href='/question-lab?configure=1'>{t('Generate another batch')}<ArrowRight size={17} aria-hidden='true' /></Link>
        </> : <button className='button' onClick={onNextRound} disabled={pending}>{t("Play another round")}<ArrowRight size={17} aria-hidden='true' /></button>}
        {pack && <nav className={styles.packNavigation} aria-label={t('Batch navigation')}>
          <Link className='button button-secondary' href='/question-lab'>{t('Back to AI Lab')}</Link>
          <Link href='/'>{t('Back to main game')}</Link>
        </nav>}
      </footer>
    </section>;
}
