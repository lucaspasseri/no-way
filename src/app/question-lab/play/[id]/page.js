import Link from 'next/link';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import Game from '@/components/Game';
import { questionLab } from '@/server/question-lab.mjs';
import { ownerHash, labCookie } from '@/server/lab-http.mjs';
import styles from '@/app/page.module.css';

export default async function PlayPack({ params }) {
  await connection();
  const { id } = await params;
  let pack;
  try { pack = await questionLab.get(id, ownerHash((await cookies()).get(labCookie)?.value)); }
  catch { /* Private/expired packs share a useful, non-disclosing recovery page. */ }
  if (!pack || !['ready', 'partial'].includes(pack.status) || !pack.questions.length) {
    return <main className={styles.main} style={{ padding: 32 }}><h1>This pack isn’t ready to play</h1>
      <p>It may have expired, still be generating, or belong to another browser. Packs stay private and last 24 hours.</p>
      <Link href='/question-lab'>Return to AI Question Lab</Link><br /><Link href='/'>Return to regular gameplay</Link></main>;
  }
  const options = { categories: [], difficulties: [], pools: [], total: pack.questions.length };
  return <main className={styles.main}><Game key={id} questions={pack.questions} options={options} pack={pack} /></main>;
}
