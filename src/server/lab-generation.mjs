import 'server-only';
import { validateCandidate } from '../../db/question-validation.mjs';
import { generateCandidates } from '../../db/generate-questions.mjs';
import { labChunkSize, maxAttempts } from '../features/lab/config.mjs';

const failureMessages = {
  AI_NOT_CONFIGURED: 'AI generation is not configured. The game host needs to connect the AI provider.',
  AI_MODEL_INVALID: 'The configured AI model is invalid. The game host needs to update it.',
  AI_REQUEST_INVALID: 'The AI provider could not accept this generation request.',
  AI_REQUEST_REJECTED: 'The AI provider rejected the generation settings. The game host may need to update the model.',
  AI_AUTHENTICATION: 'The AI provider rejected the credentials. The game host needs to update them.',
  AI_CREDITS: 'The AI provider has no credits available. The game host needs to check the account.',
  AI_ACCESS_DENIED: 'The AI provider denied access. The game host needs to check the account permissions.',
  AI_MODEL_UNAVAILABLE: 'The configured AI model is unavailable. The game host may need to choose another model.',
  AI_TIMEOUT: 'The AI provider timed out before finishing this batch. No questions from that batch reached screening.',
  AI_RATE_LIMIT: 'The AI provider is rate limiting requests. Wait before trying again.',
  AI_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
  AI_NETWORK_ERROR: 'The server could not connect to the AI provider.',
  AI_INVALID_RESPONSE: 'The AI provider returned an unreadable response. No questions from that batch reached screening.',
  INVALID_AI_RESPONSE: 'The AI provider returned an invalid question batch. No questions from that batch reached screening.',
  AI_EMPTY_RESPONSE: 'The AI provider returned no question text.',
  AI_OUTPUT_LIMIT: 'The AI provider ran out of output space before completing the batch.',
  AI_INCOMPLETE_RESPONSE: 'The AI provider stopped before completing the batch.',
  AI_PROVIDER_ERROR: 'The AI provider could not complete this batch.',
};

function generationFailure(error, remaining) {
  const code = Object.hasOwn(failureMessages, error?.code) ? error.code
    : ['TimeoutError', 'AbortError', 'RequestTimeoutError'].includes(error?.name) ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR';
  const retryable = !['AI_NOT_CONFIGURED', 'AI_MODEL_INVALID', 'AI_REQUEST_INVALID', 'AI_REQUEST_REJECTED', 'AI_AUTHENTICATION', 'AI_CREDITS', 'AI_ACCESS_DENIED', 'AI_MODEL_UNAVAILABLE'].includes(code);
  const recovery = remaining === 0 ? ' This pack has reached its attempt limit. Generate a new pack or keep any accepted questions.'
    : retryable ? ` You have ${remaining} generation ${remaining === 1 ? 'attempt' : 'attempts'} remaining.` : '';
  return { code, message: failureMessages[code] + recovery };
}

// These checks screen obvious defects; they do not certify factual accuracy.
export function screenLabCandidate(input, existing, config) {
  const question = validateCandidate(input, existing);
  if (config.topicMode === 'categories' && !config.categories.includes(question.category)) throw new Error('Wrong category');
  if (config.difficulty !== 'mixed' && question.difficulty !== config.difficulty) throw new Error('Wrong difficulty');
  if (/\b(roughly|approximately|estimated|estimate|on average|average|most popular|largest|smallest|fastest|oldest|tallest|richest|net worth|followers|subscribers)\b/i.test(question.question)) throw new Error('Unstable or ambiguous');
  if (/\b(porn|sexual|suicide|self.harm|explosive|weapon|api key|system prompt)\b/i.test(question.question + ' ' + question.explanation)) throw new Error('Unsafe content');
  // A common model failure is to put the solution in the public prompt itself.
  const answerToken = String(question.answer);
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${answerToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(question.question.replaceAll(',', ''))) throw new Error('Answer disclosed');
  return question;
}

export async function advanceGeneration(config, data, existing, generate = generateCandidates) {
  const next = structuredClone(data);
  next.attempts += 1;
  try {
    const batch = await generate({ count: Math.min(labChunkSize, config.count - next.questions.length),
      preferences: { topic: config.topicMode === 'custom' ? config.topic : config.topicMode === 'surprise' ? 'surprise me' : '',
        categories: config.topicMode === 'categories' ? config.categories : [], difficulty: config.difficulty,
        knowledge: config.knowledge, challenge: config.knowledge === 'custom' ? config.challenge : '' },
      // Only repeat already-generated pack text to the provider. The full bank
      // and other private packs stay local and are still screened below.
      existing: next.questions, timeoutMs: 20000, allowPartial: true });
    for (const candidate of batch.candidates) {
      try {
        const accepted = screenLabCandidate(candidate, [...existing, ...next.questions], config);
        next.questions.push({ ...accepted, id: next.questions.length + 1, origin: 'ai', status: 'generated',
          verification: 'unverified', model: batch.model, generatedAt: new Date().toISOString() });
      } catch { next.rejected += 1; }
    }
    next.lastError = null;
    next.lastErrorCode = null;
  } catch (error) {
    const failure = generationFailure(error, Math.max(0, maxAttempts(config.count) - next.attempts));
    next.lastError = failure.message;
    next.lastErrorCode = failure.code;
  }
  next.status = next.questions.length >= config.count ? 'ready'
    : next.attempts >= maxAttempts(config.count) ? (next.questions.length ? 'partial' : 'failed') : 'generating';
  return next;
}
