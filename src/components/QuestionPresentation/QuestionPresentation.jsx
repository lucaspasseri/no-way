"use client";

import React from "react";
import styles from "./QuestionPresentation.module.css";
import QuestionCard from "../QuestionCard";
import GuessesList from "../GuessesList";
import GuessInput from "../GuessInput";

function QuestionPresentation({ questionArr }) {
	const [question, setQuestion] = React.useState(null);
	const [guessList, setGuessList] = React.useState([]);
	const [showAnswer, setShowAnswer] = React.useState(false);

	React.useEffect(() => {
		const randomIndex = Math.floor(Math.random() * questionArr.length);

		setQuestion(questionArr[randomIndex]);
	}, []);

	if (question === null) {
		return null;
	}

	const { answer } = question;

	if (showAnswer) {
		return <div>{answer}</div>;
	}

	function handleRandomQuestion() {
		const randomIndex = Math.floor(Math.random() * questionArr.length);
		setQuestion(questionArr[randomIndex]);
	}

	function addGuess(guess) {
		const newGuess = {
			id: guessList.length + 1,
			value: guess,
		};

		setGuessList(prev => [...prev, newGuess]);
	}

	function handleNOWAY() {
		console.log({ answer, guessList });

		if (guessList.length === 0) return;

		const lastGuess = guessList[guessList.length - 1].value;

		if (Number(lastGuess) > Number(answer)) {
			setShowAnswer(true);
		}
	}

	return (
		<div className={styles.container}>
			<QuestionCard
				currentQuestion={question}
				handleRandomQuestion={handleRandomQuestion}
			/>

			<div className={styles.control}>
				<button onClick={handleNOWAY}>NO WAY!!!</button>
				<button onClick={handleRandomQuestion}>Refresh</button>
			</div>

			<GuessInput addGuess={addGuess} />
			<GuessesList list={guessList} />
		</div>
	);
}

export default QuestionPresentation;
