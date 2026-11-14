import styles from "./page.module.css";
import { connection } from "next/server";
import { selectQuestion, getQuestionOptions } from "@/server/questions.mjs";
import Game from "@/components/Game";

export default async function Home() {
  // Read live curated questions only on a real request, never during a build.
  await connection();
  const [question, options] = await Promise.all([selectQuestion(), getQuestionOptions()]);
  return <main className={styles.main}><Game questions={question ? [question] : []} options={options} /></main>;
}
