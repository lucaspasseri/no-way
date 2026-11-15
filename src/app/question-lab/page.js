import { connection } from 'next/server';
import { getQuestionOptions } from '@/server/questions.mjs';
import QuestionLab from '@/components/QuestionLab/QuestionLab';

export const metadata = { title: 'AI Question Lab — No Way' };

export default async function LabPage() {
  await connection();
  let options;
  try { options = await getQuestionOptions(); }
  catch { return <QuestionLab categories={[]} unavailable />; }
  return <QuestionLab categories={options.categories} />;
}
