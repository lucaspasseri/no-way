import React from "react";
import styles from "./Guess.module.css";

function GuessInput({ addGuess }) {
	const [guess, setGuess] = React.useState("");

	function handleSubmit(e) {
		e.preventDefault();

		const guessValue = Number(guess);
		if (guess === "" || Number.isNaN(guessValue)) return;

		addGuess(guessValue);
		setGuess("");
	}

	return (
		<div className={styles.container}>
			<form onSubmit={handleSubmit}>
				<label htmlFor='guessInput'>Enter your guess:</label>
				<input
					id='guessInput'
					type='number'
					name='guess'
					value={guess}
					onChange={e => setGuess(e.target.value)}
				/>

				<button type='submit'>Send</button>
			</form>
		</div>
	);
}

export default GuessInput;
