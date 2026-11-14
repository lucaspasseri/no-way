import { ArrowRight, Lock, Shuffle, Unlock } from 'react-feather';
import { metadataLabel } from '@/features/game/question-selection.mjs';
import BigLetter from '../BigLetter';
import styles from './QuestionCard.module.css';

export default function QuestionCard({ currentQuestion, isLocked, canChangeQuestion, pending, preferences, onToggleLock, onNextQuestion, onRandomQuestion, headingRef }) {
  const { id, curatedId, question, category, difficulty } = currentQuestion ?? {};
  return (
    <section className={styles.container} aria-labelledby='question-title'>
      <div className={styles.main + ' surface-enter'} key={id}>
        <BigLetter letter='Q' />
        <div className={styles.questionAndDetails}>
          <div className={styles.details}>
            <div className={styles.chips}>
              <span className={styles.category} aria-label={`Category: ${category ? metadataLabel(category) : 'Number trivia'}`}>{category ? metadataLabel(category) : 'Number trivia'}</span>
              <span className={styles.category} aria-label={`Difficulty: ${difficulty ? metadataLabel(difficulty) : 'Not specified'}`}>{difficulty ? metadataLabel(difficulty) : 'Difficulty not specified'}</span>
            </div>
            <div className={styles.metadata}>
              {id != null && <span className={styles.questionNumber}>#{String(curatedId ?? id).padStart(2, '0')}</span>}
              <span className={styles.status}>
                {isLocked ? <Lock size={12} aria-hidden='true' /> : <Unlock size={12} aria-hidden='true' />}
                {isLocked ? 'Locked' : 'Unlocked'}
              </span>
            </div>
          </div>
          <h2 id='question-title' ref={headingRef} tabIndex={-1}>{question || 'No questions available. Please try again later.'}</h2>
        </div>
      </div>
      <footer className={styles.footer}>
        {preferences}
        <div className={styles.actions} role='group' aria-label='Question actions' aria-busy={pending}>
          <button className='button button-secondary' onClick={onToggleLock} disabled={pending || !currentQuestion} aria-pressed={isLocked} aria-describedby='question-controls-hint'>
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
