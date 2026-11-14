import { getQuestions } from '../../../server/questions.mjs';

export async function GET() {
  try {
    const questions = await getQuestions();
    // The game gets its full contract directly from the service; HTTP consumers
    // only receive public fields. Server-side challenges remain a separate task.
    const publicQuestions = questions.map(({ id, question, category, 'src-label': sourceLabel, src }) => ({
      id, question, ...(category !== undefined && { category }),
      ...(sourceLabel !== undefined && { 'src-label': sourceLabel }), ...(src !== undefined && { src }),
    }));
    return Response.json({ questions: publicQuestions, error: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Question retrieval failed.', { code: error.code || 'QUESTION_RETRIEVAL_FAILED' });
    return Response.json(
      { questions: null, error: 'Unable to load questions. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
