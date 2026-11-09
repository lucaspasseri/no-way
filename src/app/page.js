import styles from "./page.module.css";
import HelloNext from "@/components/HelloNext";
import HelloWorld from "@/components/HelloWorld";

export default function Home() {
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<HelloNext />
				<HelloWorld />
			</main>
		</div>
	);
}
