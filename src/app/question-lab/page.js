import { connection } from 'next/server';
import { getQuestionOptions } from '@/server/questions.mjs';
import QuestionLab from '@/components/QuestionLab/QuestionLab';

export const metadata = { title: 'AI Question Lab — No Way' };

export default async function LabPage({ searchParams }) {
  await connection();
  const configure = (await searchParams).configure === '1';
  let options;
  try { options = await getQuestionOptions(); }
  catch { return <QuestionLab key={String(configure)} categories={[]} configure={configure} unavailable />; }
  return <QuestionLab key={String(configure)} categories={options.categories} configure={configure} />;
}
