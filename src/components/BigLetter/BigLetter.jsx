import React from "react";
import styles from "./BigLetter.module.css";

function BigLetter({ letter }) {
	return (
		<div className={styles.container}>
			<div className={styles.letter}>
				<h2>{letter ? letter : "Q"}</h2>
			</div>
		</div>
	);
}

export default BigLetter;
