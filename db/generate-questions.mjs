import { z } from 'zod';
import { requestOpenRouter } from '../scripts/openrouter.mjs';
import { batchSchema, questionError } from './question-validation.mjs';

/** One deliberate, bounded provider request; no persistence or factual approval here. */
export async function generateCandidates({ count = 1, model } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 5) throw questionError('INVALID_BATCH', 'Generate one to five candidates at a time.');
  const result = await requestOpenRouter({ model, maxOutputTokens: 3000,
    responseSchema: z.toJSONSchema(batchSchema, { target: 'draft-7' }),
    prompt: `Generate exactly ${count} distinct numerical trivia candidates as JSON matching the supplied schema.
Prefer stable, independently verifiable facts. No subjective answers or uncertain estimates.
Include the literal unit string (and its scale) in each clear question ending in ?; use unit=count for dimensionless counts with How many.
Specify rounding for non-exact facts. Answers must be finite, nonnegative, at most 9007199254740991.
Use supported categories and easy/medium/hard difficulty. Explain the definition, numerical value, conversion, and rounding.
sourceUrl is only a suggested authoritative HTTP(S) reference, never verified evidence; use null if unknown.
For changing facts include a YYYY-MM-DD referenceDate verbatim in the question; otherwise referenceDate=null.
Do not include origin, approval, reviewer, or verification metadata. These candidates will undergo human factual review.`,
  });
  let parsed;
  try { parsed = JSON.parse(result.text); }
  catch { throw questionError('INVALID_AI_RESPONSE', 'The provider returned invalid structured JSON. No candidates were stored.'); }
  // Keep per-candidate validation in the repository, so one invalid item cannot hide others.
  if (!parsed || !Array.isArray(parsed.candidates) || parsed.candidates.length !== count || Object.keys(parsed).length !== 1) {
    throw questionError('INVALID_AI_RESPONSE', 'The provider returned an unexpected candidate batch. No candidates were stored.');
  }
  return { candidates: parsed.candidates, model: result.model };
}
