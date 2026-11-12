"use client";

import React from "react";
import styles from "./Game.module.css";
import QuestionCard from "../QuestionCard";
import random from "@/utils/random";
import GuessSection from "../GuessSection";

function Game({ questions }) {
	const [currentQuestion, setCurrentQuestion] = React.useState(questions[0]);
	const [isLocked, setIsLocked] = React.useState(false);
	const [lockedInTime, setLockedInTime] = React.useState(null);

	function toggleLockQuestion() {
		if (!isLocked && lockedInTime === null) {
			setLockedInTime(performance.now());
		}

		setIsLocked(prev => !prev);
	}

	function selectQuestion(nextQuestion) {
		if (isLocked || nextQuestion.id === currentQuestion.id) return;

		setCurrentQuestion(nextQuestion);
		setIsLocked(false);
		setLockedInTime(null);
	}

	function handleNextQuestion() {
		const index = questions.findIndex(item => item.id === currentQuestion.id);

		if (index === -1 || isLocked) return;

		const nextQuestionIndex = index === questions.length - 1 ? 0 : index + 1;
		selectQuestion(questions[nextQuestionIndex]);
	}

	function handleRandomQuestion() {
		const filteredQuestions = questions.filter(
			question => question.id !== currentQuestion.id,
		);

		if (filteredQuestions.length === 0) return;

		const randomIndex = random(0, filteredQuestions.length);
		selectQuestion(filteredQuestions[randomIndex]);
	}

	function resetLockedInTime() {
		setLockedInTime(performance.now());
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

			<GuessSection
				key={currentQuestion.id}
				isLocked={isLocked}
				lockedInTime={lockedInTime}
				resetLockedInTime={resetLockedInTime}
				currentQuestion={currentQuestion}
			/>
		</div>
	);
}

export default Game;
