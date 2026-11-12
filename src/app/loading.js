import Spinner from "@/components/Spinner";
import styles from "./page.module.css";

export default function Loading() {
  return <main className={styles.main} aria-label='Loading game' role='status'><Spinner color='var(--color-primary)' opacity={1} /></main>;
}
