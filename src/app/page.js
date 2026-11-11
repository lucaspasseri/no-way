import fetchFake from "@/utils/fetchFake";
import styles from "./page.module.css";
import jsonData from "../data/questions.json";
import QuestionPresentation from "@/components/QuestionPresentation";
import Game from "@/components/Game";

export default async function Home() {
	const questionArr = await fetchFake(jsonData, 1000);

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<Game questions={questionArr} />
			</main>
		</div>
	);
}
