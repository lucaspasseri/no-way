import { defaultPreferences, matchingCount, metadataLabel } from '@/features/game/question-selection.mjs';
import styles from './QuestionPreferences.module.css';

export default function QuestionPreferences({ preferences, options, onChange, pending, error }) {
  const count = matchingCount(options, preferences);
  const filtered = Boolean(preferences.category || preferences.difficulty);
  return (
    <div className={styles.container}>
      <fieldset className={styles.fields} aria-describedby='preferences-hint'>
        <legend>Question preferences</legend>
        <div className={styles.field}><label htmlFor='question-category'>Category</label>
          <select id='question-category' value={preferences.category} onChange={event => onChange({ ...preferences, category: event.target.value })}>
            <option value=''>All categories</option>
            {options.categories.map(category => <option key={category} value={category}>{metadataLabel(category)}</option>)}
          </select>
        </div>
        <div className={styles.field}><label htmlFor='question-difficulty'>Difficulty</label>
          <select id='question-difficulty' value={preferences.difficulty} onChange={event => onChange({ ...preferences, difficulty: event.target.value })}>
            <option value=''>Any difficulty</option>
            {options.difficulties.map(difficulty => <option key={difficulty} value={difficulty}>{metadataLabel(difficulty)}</option>)}
          </select>
        </div>
        {filtered && <button className='button button-secondary' onClick={() => onChange(defaultPreferences)}>Clear filters</button>}
      </fieldset>
      <p id='preferences-hint'>Applies when you request another question. Your current round stays as it is.</p>
      <p role='status' aria-live='polite'>{pending ? 'Loading question…' : error || (count === 0
        ? 'No questions match. Choose all categories or any difficulty to broaden your preferences.'
        : `${count} ${count === 1 ? 'question' : 'questions'} available`)}</p>
    </div>
  );
}
