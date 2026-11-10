import React from "react";
import styles from "./LayoutHeader.module.css";
import ToggleTheme from "../ToggleTheme";

function LayoutHeader() {
	return (
		<header className={styles.header}>
			<div className={styles.logo}></div>
			<div className={styles.menu}>
				<ToggleTheme />
			</div>
		</header>
	);
}

export default LayoutHeader;
