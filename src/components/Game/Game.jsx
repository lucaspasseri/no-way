"use client";

import { useEffect, useRef } from "react";
import QuestionCard from "../QuestionCard";
import GameResult from "../GameResult";
import GuessSection from "../GuessSection";
import LayoutHeader from "../LayoutHeader";
import TimerSection from "../TimerSection";
import QuestionPreferences from "../QuestionPreferences/QuestionPreferences";
import useQuestionPreferences from "@/features/game/useQuestionPreferences";
import useGame from "@/features/game/useGame";
import styles from "./Game.module.css";

/** @param {{ questions: import('@/features/game/game-rules.mjs').Question[], options: import('@/features/game/question-selection.mjs').QuestionOptions }} props */
export default function Game({ questions, options }) {
	const [preferences, updatePreferences] = useQuestionPreferences(options);
	const game = useGame(questions, preferences);
	const { state, currentQuestion } = game;
	const headingRef = useRef(null);
	const previousPhase = useRef(state.phase);
	const previousQuestion = useRef(currentQuestion?.id);

	useEffect(() => {
		if (previousPhase.current !== state.phase || previousQuestion.current !== currentQuestion?.id) headingRef.current?.focus();
		previousPhase.current = state.phase;
		previousQuestion.current = currentQuestion?.id;
	}, [state.phase, currentQuestion?.id]);

	const pending = Boolean(state.selectionRequest);
	const preferenceControls = <QuestionPreferences preferences={preferences} options={options}
		onChange={next => { game.cancelSelection(); updatePreferences(next); }}
		pending={pending} error={state.selectionError} />;

	return (
		<div className={styles.container}>
			<LayoutHeader
				totalQuestions={options.total}
				canReset={state.phase === "playing" && state.isLocked && state.guesses.length > 0}
				onResetGuesses={game.resetGuesses}
			/>
			{state.phase === "result" && state.challenge?.success ? (
				<GameResult result={state.challenge} onNextRound={game.startNextRound} error={state.roundError} pending={pending} preferences={preferenceControls} headingRef={headingRef} />
			) : (
				<>
					<div className={styles.content}>
						<QuestionCard
							headingRef={headingRef}
							currentQuestion={currentQuestion}
							isLocked={state.isLocked}
							canChangeQuestion={!state.isLocked && !pending}
							pending={pending}
							preferences={preferenceControls}
							onToggleLock={game.toggleLock}
							onNextQuestion={game.nextQuestion}
							onRandomQuestion={game.randomQuestion}
						/>
						{currentQuestion && <GuessSection
							key={currentQuestion.id}
							guesses={state.guesses}
							isLocked={state.isLocked}
							canChallenge={game.canChallenge}
							challengeFailed={state.challenge?.success === false}
							challengePending={Boolean(state.challengeRequest)}
							challengeError={state.roundError}
							onSubmitGuess={game.submitGuess}
							onChallenge={game.challengeGuess}
						/>}
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
