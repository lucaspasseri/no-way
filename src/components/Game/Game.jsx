"use client";

import React from "react";
import styles from "./Game.module.css";
import QuestionCard from "../QuestionCard";
import random from "@/utils/random";
import GuessSection from "../GuessSection";

function Game({ questions }) {
	const [currentQuestion, setCurrentQuestion] = React.useState(questions[0]);
	const [isLocked, setIsLocked] = React.useState(false);

	function toggleLockQuestion() {
		setIsLocked(prev => !prev);
	}

	function handleNextQuestion() {
		const index = questions.findIndex(item => item.id === currentQuestion.id);

		if (index === -1 || isLocked) return;

		const nextQuestionIndex = index === questions.length - 1 ? 0 : index + 1;
		setCurrentQuestion(questions[nextQuestionIndex]);
	}

	function handleRandomQuestion() {
		const filteredQuestions = questions.filter(
			question => question.id !== currentQuestion.id,
		);

		const randomIndex = random(0, filteredQuestions.length);
		setCurrentQuestion(filteredQuestions[randomIndex]);
	}

	return (
		<div className={styles.container}>
			<QuestionCard
				currentQuestion={currentQuestion}
				handleRandomQuestion={handleNextQuestion}
			>
				<div className={styles.controlPainel}>
					<button onClick={toggleLockQuestion}>
						{isLocked ? "Unlock Question" : "Lock Question"}
					</button>
					<div className={styles.changeQuestionContainer}>
						<button onClick={handleRandomQuestion} disabled={isLocked}>
							Randomize Question
						</button>
						<button onClick={handleNextQuestion} disabled={isLocked}>
							Next Question
						</button>
					</div>
				</div>
			</QuestionCard>

			<GuessSection isLocked={isLocked} currentQuestion={currentQuestion} />
		</div>
	);
}

export default Game;
