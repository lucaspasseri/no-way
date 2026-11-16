"use client";
import { useI18n } from '@/i18n/LocalizationProvider';

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
import ExperimentalPack from "../QuestionLab/ExperimentalPack";
import { GameIdScope } from "@/features/game/GameIds";

/** @param {{ questions: import('@/features/game/game-rules.mjs').Question[], options: import('@/features/game/question-selection.mjs').QuestionOptions }} props */
export default function Game({ questions, options, pack = null }) {
	const { locale } = useI18n();
	const [preferences, updatePreferences] = useQuestionPreferences(options);
	const game = useGame(questions, preferences, pack);
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
	const preferenceControls = pack ? null : <QuestionPreferences preferences={preferences} options={options}
		onChange={next => { game.cancelSelection(); updatePreferences(next); }}
		pending={pending} error={state.selectionError} />;

	return (
		<GameIdScope packId={pack?.id}>
		<div className={styles.container}>
			<LayoutHeader
				totalQuestions={options.total}
				canReset={state.phase === "playing" && state.isLocked && state.guesses.length > 0}
				onResetGuesses={game.resetGuesses}
			/>
			{pack && <ExperimentalPack pack={pack} questionId={currentQuestion?.id} index={state.questionIndex} showNavigation={state.phase !== 'result'} />}
			{state.phase === "result" && state.challenge?.success ? (
				<GameResult result={state.challenge} onNextRound={game.startNextRound} error={state.roundError} pending={pending || game.packComplete} complete={game.packComplete} pack={pack} playedCount={state.playedQuestionIds?.length ?? 0} preferences={preferenceControls} headingRef={headingRef} />
			) : (
				<>
					<div className={styles.content}>
						<QuestionCard
							headingRef={headingRef}
							currentQuestion={currentQuestion?.localization ? { ...currentQuestion, question: currentQuestion.localization.texts[locale] ?? currentQuestion.localization.texts.en } : currentQuestion}
							isLocked={state.isLocked}
							canChangeQuestion={!state.isLocked && !pending && !game.packComplete}
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
		</GameIdScope>
	);
}
