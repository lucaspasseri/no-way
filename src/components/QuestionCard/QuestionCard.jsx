import { ArrowRight, BookOpen, ExternalLink, Lock, Shuffle, Unlock } from 'react-feather';
import BigLetter from '../BigLetter';
import styles from './QuestionCard.module.css';

/** @param {{ currentQuestion: import('@/features/game/game-rules.mjs').Question, isLocked: boolean, canChangeQuestion: boolean, onToggleLock: () => void, onNextQuestion: () => void, onRandomQuestion: () => void, headingRef: import('react').RefObject<HTMLHeadingElement | null> }} props */
export default function QuestionCard({ currentQuestion, isLocked, canChangeQuestion, onToggleLock, onNextQuestion, onRandomQuestion, headingRef }) {
  const { id, question, category, 'src-label': sourceLabel, src } = currentQuestion;
  return (
    <section className={styles.container} aria-labelledby='question-title'>
      <div className={styles.main + ' surface-enter'} key={id}>
        <BigLetter letter='Q' />
        <div className={styles.questionAndDetails}>
          <div className={styles.details}>
            <span className={styles.category}>{category || 'Number trivia'}</span>
            <div className={styles.metadata}>
              {id != null && <span className={styles.questionNumber}>#{String(id).padStart(2, '0')}</span>}
              <span className={styles.status}>
                {isLocked ? <Lock size={12} aria-hidden='true' /> : <Unlock size={12} aria-hidden='true' />}
                {isLocked ? 'Locked' : 'Unlocked'}
              </span>
            </div>
          </div>
          <h2 id='question-title' ref={headingRef} tabIndex={-1}>{question}</h2>
        </div>
      </div>
      {(sourceLabel || src) && <div className={styles.source}>
        <BookOpen size={16} aria-hidden='true' />
        <p><span>Source: </span>{src ? <a href={src} target='_blank' rel='noreferrer'>{sourceLabel || 'View reference'}<ExternalLink size={12} aria-hidden='true' /><span className={styles.srOnly}> (opens in a new tab)</span></a> : sourceLabel}</p>
      </div>}
      <footer className={styles.footer}>
        <div className={styles.actions} role='group' aria-label='Question actions'>
          <button className='button button-secondary' onClick={onToggleLock} aria-pressed={isLocked} aria-describedby='question-controls-hint'>
            {isLocked ? <Unlock size={16} aria-hidden='true' /> : <Lock size={16} aria-hidden='true' />}
            {isLocked ? 'Unlock question' : 'Lock question'}
          </button>
          <button className='button button-secondary' onClick={onNextQuestion} disabled={!canChangeQuestion} aria-describedby='question-controls-hint'>
            <ArrowRight size={16} aria-hidden='true' />Next question
          </button>
          <button className='button button-secondary' onClick={onRandomQuestion} disabled={!canChangeQuestion} aria-describedby='question-controls-hint'>
            <Shuffle size={16} aria-hidden='true' />Random question
          </button>
        </div>
        <p id='question-controls-hint'>{isLocked
          ? 'Question locked. Unlock to change questions; your guesses will be kept until you change the question.'
          : 'Lock to start guessing. Choosing a different question clears guesses and the challenge result.'}</p>
      </footer>
    </section>
  );
}
