"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { TrendingUp } from 'react-feather';
import styles from './GuessesLists.module.css';

/** @param {{ list: import('@/features/game/game-rules.mjs').Guess[] }} props */
export default function GuessesList({
  list
}) {
  const {
    t,
    formatNumber
  } = useI18n();
  return <div className={styles.container}>
      {list.length ? <ol className={styles.list} reversed>
        {list.slice().reverse().map((guess, index) => <li key={guess.id} className={index === 0 ? styles.leading : undefined}>
          <span className={styles.position}>{list.length - index}</span>
          <span className={styles.name}>{index === 0 ? t("Latest guess") : t('Guess') + ' ' + (list.length - index)}{index === 0 && <span className={styles.topLabel}>{t("Current top")}</span>}</span>
          <strong>{formatNumber(guess.value)}</strong>
        </li>)}
      </ol> : <div className={styles.empty}><TrendingUp size={28} aria-hidden='true' /><strong>{t("The ladder starts here")}</strong><p>{t("Place the first guess.")}<br />{t("Then keep raising the stakes.")}</p></div>}
      <p className={styles.rule}>{t("Each guess must be higher than the previous.")}</p>
      <span className={styles.srOnly} role='status'>{list.length ? t('Guess {count} placed: {value}.', { count: list.length, value: formatNumber(list.at(-1).value) }) : ''}</span>
    </div>;
}
