import React from "react";
import styles from "./GuessesLists.module.css";

function GuessesList({ list }) {
	if (list.length === 0) return null;

	return (
		<div className={styles.container}>
			<h3>Guess list:</h3>
			<ol>
				{list.map(guess => (
					<li key={guess.id}>{guess.value}</li>
				))}
			</ol>
		</div>
	);
}

export default GuessesList;
