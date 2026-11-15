"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import styles from "./page.module.css";
import gameStyles from "@/components/Game/Game.module.css";

/** @param {{ retry: () => void }} props */
export default function Error({
  retry
}) {
  const {
    t
  } = useI18n();
  return <main className={styles.main}>
      <section className={gameStyles.container} aria-labelledby='load-error-title'>
        <div className={gameStyles.content}>
          <h1 id='load-error-title'>{t("Unable to load the game")}</h1>
          <p role='alert'>{t("We couldn’t load the questions. Please try again.")}</p>
          <div><button className='button' onClick={() => retry()}>{t("Try again")}</button></div>
        </div>
      </section>
    </main>;
}
