import { challengeQuestion } from '../../../server/questions.mjs';

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  let body;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error();
    body = JSON.parse(text);
    if (!body || Object.keys(body).some(key => !['questionId', 'guess'].includes(key))) throw new Error();
  } catch { return Response.json({ error: 'Invalid challenge.' }, { status: 400, headers }); }
  try {
    const result = await challengeQuestion(body.questionId, body.guess);
    return Response.json({ result, error: null }, { headers });
  } catch (error) {
    const status = error.code === 'INVALID_CHALLENGE' ? 400 : error.code === 'QUESTION_UNAVAILABLE' ? 404 : 500;
    return Response.json({ error: 'Unable to check this challenge. Please try again.' }, { status, headers });
  }
}
