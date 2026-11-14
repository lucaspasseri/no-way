import { selectQuestion } from '../../../server/questions.mjs';
import { selectionSchema } from '../../../features/game/question-selection.mjs';
import { io } from 'next/cache.js';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request) {
  await io();
  const params = new URL(request.url).searchParams;
  const input = Object.fromEntries(params);
  if ([...params.keys()].some(key => params.getAll(key).length > 1)) {
    return Response.json({ questions: null, error: 'Invalid question preferences.' }, { status: 400, headers });
  }
  if (input.after !== undefined) input.after = /^\d+$/.test(input.after) ? Number(input.after) : NaN;
  if (input.recent !== undefined) input.recent = input.recent === '' ? []
    : input.recent.split(',').map(value => /^\d+$/.test(value) ? Number(value) : NaN);
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return Response.json({ questions: null, error: 'Invalid question preferences.' }, { status: 400, headers });
  try {
    const question = await selectQuestion(parsed.data);
    return Response.json({ questions: question ? [question] : [], error: null }, { headers });
  } catch (error) {
    console.error('Question retrieval failed.', { code: error.code || 'QUESTION_RETRIEVAL_FAILED' });
    return Response.json({ questions: null, error: 'Unable to load questions. Please try again.' }, { status: 500, headers });
  }
}
