import { getQuestions, publicQuestion } from '../../../server/questions.mjs';

export async function GET() {
  try {
    const questions = await getQuestions();
    const publicQuestions = questions.map(publicQuestion);
    return Response.json({ questions: publicQuestions, error: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Question retrieval failed.', { code: error.code || 'QUESTION_RETRIEVAL_FAILED' });
    return Response.json(
      { questions: null, error: 'Unable to load questions. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
