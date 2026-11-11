import React from "react";
import styles from "./LastGuessSection.module.css";

function LastGuessSection({ lastGuess, handleNOWAY }) {
	return (
		<div className={styles.container}>
			{lastGuess === null ? (
				<p>No guess was made.</p>
			) : (
				<div className={styles.lastGuess}>
					<div>
						<h3>CURRENT TOP</h3>
						<span>{lastGuess.value}</span>
					</div>
					<div>
						<button onClick={handleNOWAY}>NO WAY</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default LastGuessSection;
