import styles from "./page.module.css";
import { connection } from "next/server";
import { getQuestions } from "@/server/questions.mjs";
import Game from "@/components/Game";

export default async function Home() {
  // Demonstrate streaming on real navigations, even with Cache Components and prefetching.
  // Production can still prerender the unchanged local question bank.
  if (process.env.NODE_ENV === "development") {
    await connection();
  }
  const questions = await getQuestions();
  return <main className={styles.main}><Game questions={questions} /></main>;
}
