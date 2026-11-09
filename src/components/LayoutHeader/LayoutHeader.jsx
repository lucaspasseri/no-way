import React from "react";
import styles from "./LayoutHeader.module.css";

function LayoutHeader() {
	return (
		<header className={styles.header}>
			<div className={styles.logo}></div>
			<div className={styles.menu}></div>
		</header>
	);
}

export default LayoutHeader;
