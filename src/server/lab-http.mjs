import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { packIdSchema } from '../features/lab/config.mjs';
import { sanitizePublicDetails } from '../features/lab/diagnostics.mjs';

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

const databaseDiagnostics = {
  DATABASE_URL_MISSING: 'LAB_CONFIGURATION_REQUIRED',
  DATABASE_URL_INVALID: 'LAB_CONFIGURATION_REQUIRED',
  '42P01': 'LAB_SETUP_REQUIRED',
  '42703': 'LAB_SETUP_REQUIRED',
  QUESTION_SCHEMA_MISMATCH: 'LAB_SETUP_REQUIRED',
  '42501': 'LAB_DATABASE_PERMISSIONS',
  '28P01': 'LAB_DATABASE_CONNECTION',
  '28000': 'LAB_DATABASE_CONNECTION',
  '08000': 'LAB_DATABASE_CONNECTION',
  '08001': 'LAB_DATABASE_CONNECTION',
  '08003': 'LAB_DATABASE_CONNECTION',
  '08006': 'LAB_DATABASE_CONNECTION',
  '53300': 'LAB_DATABASE_CONNECTION',
  '57P01': 'LAB_DATABASE_CONNECTION',
  ECONNREFUSED: 'LAB_DATABASE_CONNECTION',
  ECONNRESET: 'LAB_DATABASE_CONNECTION',
  ETIMEDOUT: 'LAB_DATABASE_CONNECTION',
  ENOTFOUND: 'LAB_DATABASE_CONNECTION',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'LAB_DATABASE_CONNECTION',
  SELF_SIGNED_CERT_IN_CHAIN: 'LAB_DATABASE_CONNECTION',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'LAB_DATABASE_CONNECTION',
  CERT_HAS_EXPIRED: 'LAB_DATABASE_CONNECTION',
  '57014': 'LAB_DATABASE_TIMEOUT',
};
const diagnosticMessages = {
  LAB_CONFIGURATION_REQUIRED: 'The question lab is not configured on this server. The game host needs to finish setup.',
  LAB_SETUP_REQUIRED: 'The question lab setup is incomplete. The game host needs to finish installing it.',
  LAB_DATABASE_PERMISSIONS: 'The question lab cannot save packs. The game host needs to check database access.',
  LAB_DATABASE_CONNECTION: 'The question lab cannot connect to its database. Please try again later.',
  LAB_DATABASE_TIMEOUT: 'The question lab database took too long to respond. Please try again later.',
  LAB_UNAVAILABLE: 'The question lab is unavailable. Check the server configuration or try again later.',
};

export function labError(error, action = 'unknown') {
  if (error?.code === 'AI_DAILY_COOLDOWN' && sanitizePublicDetails(error.details)) {
    const details = sanitizePublicDetails(error.details);
    return { status: 429, code: error.code, message: details.message, details };
  }
  const status = { INVALID_CONFIG: 400, INVALID_CHALLENGE: 400, PACK_UNAVAILABLE: 404, LAB_RATE_LIMIT: 429, LAB_BUSY: 409 }[error?.code] ?? 503;
  if (status !== 503) return { status, message: error.message };
  const known = Object.hasOwn(databaseDiagnostics, error?.code);
  const code = known ? databaseDiagnostics[error.code] : 'LAB_UNAVAILABLE';
  // Never log the original error: pg errors can contain credentials, SQL, and
  // question data. Only allowlisted codes and validated action names are useful.
  console.error('Question Lab request failed.', {
    action: ['get', 'create', 'advance', 'finish', 'challenge', 'report'].includes(action) ? action : 'unknown',
    code, databaseCode: known ? error.code : 'UNKNOWN',
  });
  return { status, code, message: diagnosticMessages[code] };
}
