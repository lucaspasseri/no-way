"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { defaultPreferences, matchingCount } from '@/features/game/question-selection.mjs';
import styles from './QuestionPreferences.module.css';
export default function QuestionPreferences({
  preferences,
  options,
  onChange,
  pending,
  error
}) {
  const {
    t,
    metadataLabel
  } = useI18n();
  const count = matchingCount(options, preferences);
  const filtered = Boolean(preferences.category || preferences.difficulty);
  return <div className={styles.container}>
      <fieldset className={styles.fields} aria-describedby='preferences-hint'>
        <legend>{t("Question preferences")}</legend>
        <div className={styles.field}><label htmlFor='question-category'>{t("Category")}</label>
          <select id='question-category' value={preferences.category} onChange={event => onChange({
          ...preferences,
          category: event.target.value
        })}>
            <option value=''>{t("All categories")}</option>
            {options.categories.map(category => <option key={category} value={category}>{metadataLabel(category)}</option>)}
          </select>
        </div>
        <div className={styles.field}><label htmlFor='question-difficulty'>{t("Difficulty")}</label>
          <select id='question-difficulty' value={preferences.difficulty} onChange={event => onChange({
          ...preferences,
          difficulty: event.target.value
        })}>
            <option value=''>{t("Any difficulty")}</option>
            {options.difficulties.map(difficulty => <option key={difficulty} value={difficulty}>{metadataLabel(difficulty)}</option>)}
          </select>
        </div>
        {filtered && <button className='button button-secondary' onClick={() => onChange(defaultPreferences)}>{t("Clear filters")}</button>}
      </fieldset>
      <p id='preferences-hint'>{t("Applies when you request another question. Your current round stays as it is.")}</p>
      <p role='status' aria-live='polite'>{pending ? t("Loading question…") : (error && t(error)) || (count === 0 ? t("No questions match. Choose all categories or any difficulty to broaden your preferences.") : t(count === 1 ? '{count} question available' : '{count} questions available', { count }))}</p>
    </div>;
}
