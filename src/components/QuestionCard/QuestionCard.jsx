import React from "react";
import styles from "./QuestionCard.module.css";

function QuestionCard({ currentQuestion }) {
	const { id, question, answer, "src-label": srcLabel, src } = currentQuestion;

	return (
		<div key={id} className={styles.container}>
			<div>
				<h3>{question}</h3>
				<p>{answer}</p>
			</div>
			<div>
				<h4>Source</h4>
				<a href={src}>{srcLabel}</a>
			</div>
		</div>
	);
}

export default QuestionCard;
