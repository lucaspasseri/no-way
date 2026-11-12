"use client";

import { useEffect, useRef } from "react";
import QuestionCard from "../QuestionCard";
import GameResult from "../GameResult";
import GuessSection from "../GuessSection";
import LayoutHeader from "../LayoutHeader";
import TimerSection from "../TimerSection";
import useGame from "@/features/game/useGame";
import styles from "./Game.module.css";

/** @param {{ questions: import('@/features/game/game-rules.mjs').Question[] }} props */
export default function Game({ questions }) {
	const game = useGame(questions);
	const { state, currentQuestion } = game;
	const headingRef = useRef(null);
	const previousPhase = useRef(state.phase);

	useEffect(() => {
		if (previousPhase.current !== state.phase) headingRef.current?.focus();
		previousPhase.current = state.phase;
	}, [state.phase]);

	if (state.phase === "playing" && !currentQuestion)
		return <p>No questions available. Please try again later.</p>;

	return (
		<div className={styles.container}>
			<LayoutHeader
				questionNumber={state.questionIndex + 1}
				totalQuestions={questions.length}
				canReset={state.phase === "playing" && state.isLocked && state.guesses.length > 0}
				onResetGuesses={game.resetGuesses}
			/>
			{state.phase === "result" ? (
				<GameResult result={state.challenge} onNextRound={game.startNextRound} error={state.roundError} headingRef={headingRef} />
			) : (
				<>
					<div className={styles.content}>
						<QuestionCard
							headingRef={headingRef}
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
							canChallenge={game.canChallenge}
							onSubmitGuess={game.submitGuess}
							onChallenge={game.challengeGuess}
						/>
					</div>
					<footer className={styles.footer}>
						<TimerSection
							lockedInTime={state.lockedAt}
							sinceLastGuessTime={state.lastGuessAt}
						/>
					</footer>
				</>
			)}
		</div>
	);
}
