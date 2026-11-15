import { requestTranslator } from '../../../i18n/request.mjs';
import { localizationSchema } from '../../../i18n/config.mjs';
import { challengeQuestion } from '../../../server/questions.mjs';

export async function POST(request) {
  const t = requestTranslator(request);
  const headers = { 'Cache-Control': 'no-store' };
  let body;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error();
    body = JSON.parse(text);
    if (!body || Object.keys(body).some(key => !['questionId', 'guess', 'localization'].includes(key))) throw new Error();
  } catch { return Response.json({ error: t('Invalid challenge.') }, { status: 400, headers }); }
  if (body.localization !== undefined && !localizationSchema.safeParse(body.localization).success) return Response.json({ error: t('Invalid challenge.') }, { status: 400, headers });
  try {
    const result = await challengeQuestion(body.questionId, body.guess, body.localization);
    return Response.json({ result, error: null }, { headers });
  } catch (error) {
    const status = error.code === 'INVALID_CHALLENGE' ? 400 : error.code === 'QUESTION_UNAVAILABLE' ? 404 : 500;
    return Response.json({ error: t('Unable to check this challenge. Please try again.') }, { status, headers });
  }
}
