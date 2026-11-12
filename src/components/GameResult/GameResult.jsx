import { ArrowRight, BookOpen, CheckCircle, ExternalLink } from 'react-feather';
import { formatNumber, getGuessDifference } from '@/features/game/game-rules.mjs';
import styles from './GameResult.module.css';

/** @param {{ result: import('@/features/game/game-rules.mjs').ChallengeResult, onNextRound: () => void, error: string | null, headingRef: import('react').RefObject<HTMLHeadingElement | null> }} props */
export default function GameResult({ result, onNextRound, error, headingRef }) {
  const { guess, answer, question } = result;
  const { explanation, 'src-label': sourceLabel, src } = question;
  const difference = formatNumber(getGuessDifference(guess, answer));

  return (
    <section className={`${styles.container} ${styles.success}`} aria-labelledby='result-title'>
      <header className={styles.hero}>
        <div className={styles.outcomeIcon}><CheckCircle size={28} aria-hidden='true' /></div>
        <p className={styles.eyebrow}>Round complete</p>
        <h2 id='result-title' tabIndex={-1} ref={headingRef} aria-describedby='result-description'>
          Challenge successful!
        </h2>
        <p id='result-description'>The last guess was higher than the correct answer.</p>
      </header>

      <section className={styles.comparison} aria-labelledby='result-question'>
        <p className={styles.eyebrow}>The question</p>
        <h3 id='result-question'>{question.question}</h3>
        <dl className={styles.numbers}>
          <div className={styles.guessCard}>
            <dt>Last Guess</dt>
            <dd>{formatNumber(guess)}</dd>
          </div>
          <div className={styles.answerCard}>
            <dt>Correct Answer</dt>
            <dd>{formatNumber(answer)}</dd>
          </div>
        </dl>
        <p className={styles.difference}>The guess exceeded the correct answer by <strong>{difference}</strong>.</p>
      </section>

      {(explanation || sourceLabel || src) && (
        <section className={styles.explanation} aria-labelledby='answer-explanation'>
          <h3 id='answer-explanation'><BookOpen size={16} aria-hidden='true' />About the answer</h3>
          {explanation && <p>{explanation}</p>}
          {(sourceLabel || src) && <p className={styles.source}>Source: {src
            ? <a href={src} target='_blank' rel='noreferrer'>{sourceLabel || 'View reference'}<ExternalLink size={12} aria-hidden='true' /><span className={styles.srOnly}> (opens in a new tab)</span></a>
            : sourceLabel}</p>}
        </section>
      )}

      <footer className={styles.actions}>
        {error && <p className={styles.error} role='alert'>{error}</p>}
        <button className='button' onClick={onNextRound}>Play another round<ArrowRight size={17} aria-hidden='true' /></button>
      </footer>
    </section>
  );
}
