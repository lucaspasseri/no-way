// Protected by operator shell access and database credentials; never an HTTP route.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { getPool } from '../db/pool.mjs';
import { generateCandidates } from '../db/generate-questions.mjs';
import { listQuestions, storeCandidates, reviewQuestion, parseVerifiedAnswer } from '../db/question-repository.mjs';
import { OpenRouterRequestError } from './openrouter.mjs';

export async function runQuestions(args, connect = () => getPool().connect()) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    count: { type: 'string', default: '1' }, model: { type: 'string' }, status: { type: 'string', default: 'pending' },
    reviewer: { type: 'string' }, notes: { type: 'string' }, source: { type: 'string' },
    'verified-answer': { type: 'string' }, 'independently-verified': { type: 'boolean', default: false },
  } });
  const [command, id, ...extra] = positionals;
  if (!['generate', 'list', 'approve', 'reject'].includes(command) || extra.length
    || (['generate', 'list'].includes(command) ? id !== undefined : !/^\d+$/.test(id ?? ''))) {
    throw new Error('Use questions generate [--count 1..5] [--model slug], list [--status pending|approved|rejected|all], approve ID, or reject ID. See docs/question-service.md for review evidence flags.');
  }
  // Finish the provider request before opening a transaction or taking a table lock.
  const batch = command === 'generate' ? await generateCandidates({ count: Number(values.count), model: values.model }) : null;
  const client = await connect();
  try {
    if (batch) return await storeCandidates(client, batch.candidates, batch.model);
    if (command === 'list') return await listQuestions(client, values.status);
    return await reviewQuestion(client, Number(id), command === 'approve' ? 'approved' : 'rejected', {
      reviewer: values.reviewer, notes: values.notes,
      ...(command === 'approve' && { sourceUrl: values.source, verifiedAnswer: parseVerifiedAnswer(values['verified-answer']),
        independentlyVerified: values['independently-verified'] }),
    });
  } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    const result = await runQuestions(process.argv.slice(2), () => { pool = getPool(); return pool.connect(); });
    console.log(JSON.stringify(result, null, 2));
    if (result.failures?.length) process.exitCode = 1;
  } catch (error) {
    const safeCodes = new Set(['INVALID_BATCH', 'INVALID_STATUS', 'INVALID_REVIEW', 'NOT_PENDING', 'ANSWER_MISMATCH',
      'INVALID_CANDIDATE', 'AMBIGUOUS_QUESTION', 'IMPRECISE_QUESTION', 'MISSING_UNIT', 'REFERENCE_DATE_REQUIRED', 'DUPLICATE_QUESTION', 'INVALID_AI_RESPONSE']);
    console.error(error instanceof OpenRouterRequestError || safeCodes.has(error.code)
      ? error.message : 'Question command failed. Check arguments, database connectivity and schema compatibility. See docs/question-service.md.');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
