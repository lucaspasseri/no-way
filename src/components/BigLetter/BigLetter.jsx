import styles from "./BigLetter.module.css";

function BigLetter({ letter }) {
	return (
		<div className={styles.container} aria-hidden='true'>
			<div className={styles.letter}>
				<span>{letter || "Q"}</span>
			</div>
		</div>
	);
}

export default BigLetter;
