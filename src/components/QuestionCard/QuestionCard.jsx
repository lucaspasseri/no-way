import React from "react";
import styles from "./QuestionCard.module.css";
import BigLetter from "../BigLetter";

function QuestionCard({ currentQuestion, children }) {
	const { id, question, "src-label": srcLabel, src } = currentQuestion;

	return (
		<div key={id} className={styles.container}>
			<div className={styles.main}>
				<BigLetter letter={"Q"} />

				<div className={styles.questionAndDetailsContainer}>
					<div className={styles.details}>
						<div className={styles.category}></div>
						<div className={styles.questionNumber}>{`#${id}`}</div>
					</div>
					<div className={styles.questionContainer}>
						<p>{question}</p>
					</div>
				</div>
			</div>
			<div className={styles.sourceContainer}>
				<h4>
					Source: <a href={src}>{srcLabel}</a>
				</h4>
			</div>
			{children}
		</div>
	);
}

export default QuestionCard;
