export async function labRequest(body, signal) {
  const response = await fetch('/api/question-lab', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(28000)]) : AbortSignal.timeout(28000) });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('The lab lost its connection. Resume to check your saved pack.'); }
  if (!response.ok) throw new Error(payload.error || 'The lab could not complete this request. Try again.');
  return payload;
}
