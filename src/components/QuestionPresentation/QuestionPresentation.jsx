"use client";

import React from "react";
import styles from "./QuestionPresentation.module.css";
import QuestionCard from "../QuestionCard";
import AnswerInput from "../AnswerInput";
import GuessesList from "../GuessesList";

function QuestionPresentation({ questionArr }) {
	const [question, setQuestion] = React.useState(null);

	React.useEffect(() => {
		const randomIndex = Math.floor(Math.random() * questionArr.length);

		setQuestion(questionArr[randomIndex]);
	}, []);

	function handleRandomQuestion() {
		const randomIndex = Math.floor(Math.random() * questionArr.length);

		setQuestion(questionArr[randomIndex]);
	}

	return (
		<div className={styles.container}>
			{question && (
				<QuestionCard
					currentQuestion={question}
					handleRandomQuestion={handleRandomQuestion}
				/>
			)}
			<div className={styles.control}>
				<button onClick={handleRandomQuestion}> Refresh</button>
			</div>

			<AnswerInput />
			<GuessesList />
		</div>
	);
}

export default QuestionPresentation;
