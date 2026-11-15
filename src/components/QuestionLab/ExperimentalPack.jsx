'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Flag } from 'react-feather';
import { topicLabel } from '@/features/lab/config.mjs';
import { labRequest } from '@/features/lab/client.mjs';
import styles from './ExperimentalPack.module.css';

export default function ExperimentalPack({ pack, questionId, index, complete }) {
  const [reported, setReported] = useState(pack.reported ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function report() {
    if (pending) return;
    setPending(true); setError('');
    try { setReported((await labRequest({ action: 'report', id: pack.id, questionId })).pack.reported); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <aside className={styles.banner} aria-label='Experimental question pack'>
    <div className={styles.top}><strong>✳ Experimental · {topicLabel(pack.config)}</strong><span>{index + 1} / {pack.accepted}</span></div>
    <p>AI-generated answers are unverified and may be incorrect. Casual play only; these results don’t count toward competitive records.</p>
    {complete && <p role='status'><strong>Pack complete. You’ve explored every accepted question.</strong></p>}
    <div className={styles.actions}><Link href='/'>Return to regular game</Link><Link href='/question-lab'>Create another pack</Link>
      <button onClick={report} disabled={pending || reported.includes(questionId)}><Flag size={12} />{reported.includes(questionId) ? 'Question reported' : pending ? 'Saving report…' : 'Report questionable answer'}</button></div>
    {reported.includes(questionId) && <p role='status'>Flag saved with this temporary pack. No factual review has been performed.</p>}
    {error && <p role='alert'>{error}</p>}
  </aside>;
}
