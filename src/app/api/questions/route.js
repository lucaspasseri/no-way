import { getQuestions } from '../../../server/questions.mjs';

export async function GET() {
  try {
    const questions = await getQuestions();
    // Answers are needed by the current client-side challenge rules. See docs/question-service.md.
    return Response.json({ questions, error: null });
  } catch (error) {
    console.error('Question retrieval failed:', error);
    return Response.json(
      { questions: null, error: 'Unable to load questions. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
