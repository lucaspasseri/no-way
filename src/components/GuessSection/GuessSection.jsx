import React from "react";
import styles from "./GuessSection.module.css";
import LastGuessSection from "../LastGuessSection";
import NewGuessSection from "../NewGuessSection";
import GuessesList from "../GuessesList";
import { ToastContext } from "../ToastProvider";
import TimerSection from "../TimerSection";

function GuessSection({
	isLocked,
	lockedInTime,
	resetLockedInTime,
	currentQuestion,
}) {
	const [guesses, setGuesses] = React.useState([]);
	const [sinceLastGuessTime, setSinceLastGuessTime] = React.useState(null);
	const { addToast } = React.useContext(ToastContext);

	if (!isLocked) {
		return null;
	}

	const lastGuess = guesses.length === 0 ? null : guesses[guesses.length - 1];

	function handleNewGuess(guessValue) {
		if (guessValue <= lastGuess?.value) {
			return;
		}

		const newGuess = {
			id: crypto.randomUUID(),
			value: guessValue,
		};

		setSinceLastGuessTime(performance.now());
		setGuesses(prev => [...prev, newGuess]);
	}

	function handleNOWAY() {
		if (lastGuess === null) return;

		const underTheLimite = lastGuess.value <= Number(currentQuestion.answer);

		const message = underTheLimite
			? `${lastGuess.value} is less than or equal to the answer.`
			: `${lastGuess.value} is greater than the answer.`;

		const variant = underTheLimite ? "error" : "success";

		addToast(message, variant);
	}

	function resetGame() {
		setGuesses([]);
		resetLockedInTime();
		setSinceLastGuessTime(null);
	}

	return (
		<div className={styles.container}>
			<TimerSection
				lockedInTime={lockedInTime}
				sinceLastGuessTime={sinceLastGuessTime}
			>
				<button onClick={resetGame}>Reset guesses</button>
			</TimerSection>

			<div className={styles.main}>
				<LastGuessSection lastGuess={lastGuess} handleNOWAY={handleNOWAY} />
				<NewGuessSection
					lastGuess={lastGuess}
					handleNewGuess={handleNewGuess}
				/>
			</div>
			<GuessesList list={guesses} />
		</div>
	);
}

export default GuessSection;
