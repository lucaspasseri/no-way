import React from "react";
import styles from "./GuessSection.module.css";
import LastGuessSection from "../LastGuessSection";
import NewGuessSection from "../NewGuessSection";
import GuessesList from "../GuessesList";

function GuessSection({ isLocked, currentQuestion }) {
	const [guesses, setGuesses] = React.useState([]);

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
		console.log({ lastGuess });

		console.log({ A: currentQuestion?.answer });
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
