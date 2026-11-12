import styles from "./page.module.css";
import questions from "../data/questions.json";
import Game from "@/components/Game";

export default function Home() {
  return <main className={styles.main}><Game questions={questions} /></main>;
}
