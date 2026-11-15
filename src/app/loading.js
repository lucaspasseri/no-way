"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import styles from "./page.module.css";
import gameStyles from "@/components/Game/Game.module.css";
import headerStyles from "@/components/LayoutHeader/LayoutHeader.module.css";
import questionStyles from "@/components/QuestionCard/QuestionCard.module.css";
import guessStyles from "@/components/GuessSection/GuessSection.module.css";
import skeleton from "./loading.module.css";
export default function Loading() {
  const {
    t
  } = useI18n();
  return <main className={styles.main} aria-label={t("Loading game")} role='status' aria-busy='true'>
      <span className={questionStyles.srOnly}>{t("Loading questions…")}</span>
      <div className={gameStyles.container} aria-hidden='true'>
        <div className={headerStyles.header}>
          <div className={headerStyles.brand}>
            <span className={headerStyles.logo}>!</span>
            <div><h1>No Way</h1><div className={`${skeleton.bar} ${skeleton.progress}`} /></div>
          </div>
          <div className={`${skeleton.bar} ${skeleton.settings}`} />
        </div>
        <div className={gameStyles.content}>
          <div className={questionStyles.container}>
            <div className={questionStyles.main}>
              <div className={`${skeleton.bar} ${skeleton.letter}`} />
              <div className={questionStyles.questionAndDetails}>
                <div className={`${skeleton.bar} ${skeleton.category}`} />
                <div className={`${skeleton.bar} ${skeleton.question}`} />
              </div>
            </div>
            <div className={questionStyles.source}><div className={`${skeleton.bar} ${skeleton.source}`} /></div>
            <div className={questionStyles.footer}>
              <div className={`${questionStyles.actions} ${skeleton.actions}`}>
                <div className={skeleton.bar} /><div className={skeleton.bar} /><div className={skeleton.bar} />
              </div>
              <div className={`${skeleton.bar} ${skeleton.hint}`} />
            </div>
          </div>
          <div className={guessStyles.container}>
            <div className={guessStyles.playFlow}>
              <div>
                <div className={`${skeleton.bar} ${skeleton.label}`} />
                <div className={`${skeleton.bar} ${skeleton.input}`} />
                <div className={`${skeleton.bar} ${skeleton.hint}`} />
              </div>
              <div className={`${skeleton.bar} ${skeleton.latest}`} />
            </div>
            <div>
              <div className={`${skeleton.bar} ${skeleton.label}`} />
              <div className={`${skeleton.bar} ${skeleton.history}`} />
            </div>
          </div>
        </div>
        <div className={gameStyles.footer}><div className={`${skeleton.bar} ${skeleton.timer}`} /></div>
      </div>
    </main>;
}
