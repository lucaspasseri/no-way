import React from "react";
import styles from "./NewGuessSection.module.css";

function NewGuessSection({ lastGuess, handleNewGuess }) {
	const [guess, setGuess] = React.useState("");

	function handleSubmit(e) {
		e.preventDefault();

		const guessValue = Number(guess);
		if (guess === "" || Number.isNaN(guessValue)) return;

		handleNewGuess(guessValue);

		setGuess("");
	}

	return (
		<div className={styles.container}>
			<form onSubmit={handleSubmit}>
				<div className={styles.header}>
					<label htmlFor='new-guess-input'>NEW GUESS</label>
				</div>
				<div className={styles.main}>
					<input
						id='new-guess-input'
						type='number'
						value={guess}
						onChange={e => setGuess(e.target.value)}
						min={lastGuess?.value !== undefined ? lastGuess.value + 1 : 0}
					></input>
					<button>Send</button>
				</div>
			</form>
		</div>
	);
}

export default NewGuessSection;
