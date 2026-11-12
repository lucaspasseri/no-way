"use client";

import QuestionCard from "../QuestionCard";
import GuessSection from "../GuessSection";
import LayoutHeader from "../LayoutHeader";
import TimerSection from "../TimerSection";
import GameSettings from "../GameSettings";
import useGame from "@/features/game/useGame";
import styles from "./Game.module.css";

/** @param {{ questions: import('@/features/game/game-rules.mjs').Question[] }} props */
export default function Game({ questions }) {
	const game = useGame(questions);
	const { state, currentQuestion } = game;

	if (!currentQuestion)
		return <p>No questions available. Please try again later.</p>;

	return (
		<div className={styles.container}>
			<LayoutHeader questionNumber={state.questionIndex + 1} totalQuestions={questions.length} />
			<div className={styles.content}>
				<QuestionCard
					currentQuestion={currentQuestion}
					isLocked={state.isLocked}
					canChangeQuestion={!state.isLocked && questions.length > 1}
					onToggleLock={game.toggleLock}
					onNextQuestion={game.nextQuestion}
					onRandomQuestion={game.randomQuestion}
				/>
				<GuessSection
					key={currentQuestion.id}
					guesses={state.guesses}
					isLocked={state.isLocked}
					challenge={state.challenge}
					canChallenge={game.canChallenge}
					onSubmitGuess={game.submitGuess}
					onChallenge={game.challengeGuess}
				/>
			</div>
			<footer className={styles.footer}>
				<GameSettings
					canReset={state.isLocked && state.guesses.length > 0}
					onResetGuesses={game.resetGuesses}
				/>
				<TimerSection
					lockedInTime={state.lockedAt}
					sinceLastGuessTime={state.lastGuessAt}
				/>
			</footer>
		</div>
	);
}
