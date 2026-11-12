"use client";

import styles from "./page.module.css";
import gameStyles from "@/components/Game/Game.module.css";

/** @param {{ retry: () => void }} props */
export default function Error({ retry }) {
  return (
    <main className={styles.main}>
      <section className={gameStyles.container} aria-labelledby='load-error-title'>
        <div className={gameStyles.content}>
          <h1 id='load-error-title'>Unable to load the game</h1>
          <p role='alert'>We couldn’t load the questions. Please try again.</p>
          <div><button className='button' onClick={() => retry()}>Try again</button></div>
        </div>
      </section>
    </main>
  );
}
