"use client";
import React from "react";
import { ThemeContext } from "../ThemeProvider";
import styles from "./ToggleTheme.module.css";

function ToggleTheme() {
	const { theme, toggleTheme } = React.useContext(ThemeContext);

	return (
		<div>
			<button className={styles.button} onClick={toggleTheme}>
				{theme}
			</button>
		</div>
	);
}

export default ToggleTheme;
