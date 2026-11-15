'use client';
import Link from 'next/link';
import { useI18n } from '@/i18n/LocalizationProvider';
export default function UnavailablePack() {
  const { t } = useI18n();
  return <><h1>{t('This pack isn’t ready to play')}</h1>
    <p>{t('It may have expired, still be generating, or belong to another browser. Packs stay private and last 24 hours.')}</p>
    <Link href='/question-lab'>{t('Return to AI Question Lab')}</Link><br /><Link href='/'>{t('Return to regular gameplay')}</Link></>;
}
