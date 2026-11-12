import React from "react";
import styles from "./GuessSection.module.css";
import LastGuessSection from "../LastGuessSection";
import NewGuessSection from "../NewGuessSection";
import GuessesList from "../GuessesList";
import { ToastContext } from "../ToastProvider";

function GuessSection({ isLocked, currentQuestion }) {
	const [guesses, setGuesses] = React.useState([]);
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

	return (
		<div className={styles.container}>
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
