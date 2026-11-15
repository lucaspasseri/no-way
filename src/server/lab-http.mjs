import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { packIdSchema } from '../features/lab/config.mjs';

export const labCookie = 'no-way-lab';
export function ownerHash(token) {
  return /^[a-f0-9]{64}$/.test(token ?? '') ? createHash('sha256').update(token).digest('hex') : null;
}
export function requestIdentity(request) {
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(labCookie + '='))?.slice(labCookie.length + 1);
  return { token, owner: ownerHash(token) };
}
export function newIdentity() {
  const token = randomBytes(32).toString('hex');
  return { token, owner: ownerHash(token) };
}
export function identityCookie(token) {
  return `${labCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
const id = z.number().int().min(1).max(20);
export const labActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), id: packIdSchema, config: z.unknown() }),
  z.strictObject({ action: z.literal('advance'), id: packIdSchema, attempt: z.number().int().min(0).max(12) }),
  z.strictObject({ action: z.literal('finish'), id: packIdSchema }),
  z.strictObject({ action: z.literal('challenge'), id: packIdSchema, questionId: id, guess: z.number().finite().min(0) }),
  z.strictObject({ action: z.literal('report'), id: packIdSchema, questionId: id }),
]);

export async function readLabBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid content type');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return labActionSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export function labError(error) {
  const status = { INVALID_CONFIG: 400, INVALID_CHALLENGE: 400, PACK_UNAVAILABLE: 404, LAB_RATE_LIMIT: 429, LAB_BUSY: 409 }[error.code] ?? 503;
  return { status, message: status === 503 ? 'The question lab is unavailable. Check the server configuration or try again later.' : error.message };
}
