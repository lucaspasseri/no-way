import Image from 'next/image';
import Link from 'next/link';
import styles from './Brand.module.css';

export function BrandMark({ className }) {
  return <Image className={className} src='/icon.svg' width={40} height={40} alt='' aria-hidden='true' unoptimized />;
}

export default function Brand({ children, compact = false, heading = false }) {
  const Title = heading ? 'h1' : 'span';
  return <Link href='/' className={`${styles.brand} ${compact ? styles.compact : ''}`} aria-label='No Way'>
    <BrandMark className={styles.mark} />
    <div><Title className={styles.title}>No Way</Title>{children && <span className={styles.caption}>{children}</span>}</div>
  </Link>;
}
