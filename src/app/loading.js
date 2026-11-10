import Spinner from "@/components/Spinner";
import styles from "./page.module.css";

export default function Home() {
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<Spinner color='var(--color-primary)' opacity={1} />
			</main>
		</div>
	);
}
