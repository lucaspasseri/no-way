import { questionLab } from '../../../server/question-lab.mjs';
import { requestIdentity, newIdentity, identityCookie, readLabBody, labError } from '../../../server/lab-http.mjs';

export const maxDuration = 30;
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request) {
  try {
    const pack = await questionLab.get(new URL(request.url).searchParams.get('id'), requestIdentity(request).owner);
    return Response.json({ pack }, { headers });
  } catch (error) {
    const { status, message, code } = labError(error, 'get');
    return Response.json({ error: message, ...(code && { code }) }, { status, headers });
  }
}

export async function POST(request) {
  // Cookie-authenticated mutations are same-origin and accept only bounded JSON.
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next's internal URL can use a normalized hostname. The browser's Host header
  // retains the actual public authority (also when navigating via loopback IP).
  const protocol = request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : url.protocol;
  const expectedOrigin = `${protocol}//${request.headers.get('host') ?? url.host}`;
  if ((origin && origin !== expectedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ error: 'Open the lab from this game to continue.' }, { status: 403, headers });
  }
  let body;
  try { body = await readLabBody(request); }
  catch { return Response.json({ error: 'Invalid question lab request.' }, { status: 400, headers }); }
  let identity = requestIdentity(request);
  if (body.action === 'create' && !identity.owner) identity = newIdentity();
  try {
    const { id, action } = body;
    if (action === 'challenge') {
      const result = await questionLab.challenge(id, identity.owner, body.questionId, body.guess);
      return Response.json({ result }, { headers });
    }
    const pack = action === 'create' ? await questionLab.create(id, identity.owner, body.config)
      : action === 'advance' ? await questionLab.advance(id, identity.owner, body.attempt)
      : action === 'report' ? await questionLab.report(id, identity.owner, body.questionId)
      : await questionLab.finish(id, identity.owner);
    return Response.json({ pack }, { headers: { ...headers, ...(action === 'create' && { 'Set-Cookie': identityCookie(identity.token) }) } });
  } catch (error) {
    const { status, message, code } = labError(error, body.action);
    return Response.json({ error: message, ...(code && { code }) }, { status, headers: { ...headers, ...(status === 429 && { 'Retry-After': '3600' }) } });
  }
}
