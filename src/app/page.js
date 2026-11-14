import styles from "./page.module.css";
import { connection } from "next/server";
import { getQuestions, publicQuestion } from "@/server/questions.mjs";
import Game from "@/components/Game";

export default async function Home() {
  // Read live curated questions only on a real request, never during a build.
  await connection();
  const questions = await getQuestions();
  return <main className={styles.main}><Game questions={questions.map(publicQuestion)} /></main>;
}
