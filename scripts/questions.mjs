// Protected by operator shell access and database credentials; never an HTTP route.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { getPool } from '../db/pool.mjs';
import { generateCandidates } from '../db/generate-questions.mjs';
import { listQuestions, storeCandidates, reviewQuestion, parseVerifiedAnswer } from '../db/question-repository.mjs';
import { OpenRouterRequestError } from './openrouter.mjs';

export async function runQuestions(args, connect = () => getPool().connect()) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    count: { type: 'string', default: '1' }, model: { type: 'string' }, status: { type: 'string', default: 'generated' },
    file: { type: 'string' }, reviewer: { type: 'string' }, notes: { type: 'string' }, source: { type: 'string' },
    offline: { type: 'boolean', default: false },
    'verified-answer': { type: 'string' }, 'independently-verified': { type: 'boolean', default: false },
  } });
  const [command, id, ...extra] = positionals;
  if (!['generate', 'import', 'list', 'validate', 'curate', 'demote'].includes(command) || extra.length
    || (['generate', 'import', 'list'].includes(command) ? id !== undefined : !/^\d+$/.test(id ?? ''))) {
    throw new Error('Use questions generate [--count 1..5], import --file candidates.json (1..5), list [--status generated|validated|curated|all], validate ID, curate ID, or demote ID [--status generated|validated] --notes reason. See docs/question-service.md for review evidence flags.');
  }
  if (values.offline && (command !== 'generate' || !values.file)) throw new Error('Use generate --offline --file candidates.json to save candidates without a database.');
  // Finish the provider request before opening a transaction or taking a table lock.
  const batch = command === 'generate' ? await generateCandidates({ count: Number(values.count), model: values.model })
    : command === 'import' ? { candidates: JSON.parse(await readFile(values.file, 'utf8')), model: 'manual-import' } : null;
  if (values.offline) {
    await writeFile(values.file, JSON.stringify(batch.candidates, null, 2) + '\n', { flag: 'wx' });
    return { file: values.file, count: batch.candidates.length, model: batch.model, status: 'generated' };
  }
  const client = await connect();
  try {
    if (batch) return await storeCandidates(client, batch.candidates, batch.model, { origin: command === 'import' ? 'manual' : 'ai' });
    if (command === 'list') return await listQuestions(client, values.status);
    return await reviewQuestion(client, Number(id), command === 'curate' ? 'curated' : command === 'validate' ? 'validated' : values.status, {
      reviewer: values.reviewer, notes: values.notes,
      ...(command === 'curate' && { sourceUrl: values.source, verifiedAnswer: parseVerifiedAnswer(values['verified-answer']),
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
    const safeCodes = new Set(['INVALID_BATCH', 'INVALID_STATUS', 'INVALID_REVIEW', 'INVALID_TRANSITION', 'INVALID_CURATED_ID', 'QUESTION_UNAVAILABLE', 'ANSWER_MISMATCH',
      'INVALID_CANDIDATE', 'AMBIGUOUS_QUESTION', 'IMPRECISE_QUESTION', 'MISSING_UNIT', 'REFERENCE_DATE_REQUIRED', 'DUPLICATE_QUESTION', 'INVALID_AI_RESPONSE']);
    console.error(error instanceof OpenRouterRequestError || safeCodes.has(error.code)
      ? error.message : 'Question command failed. Check arguments, database connectivity and schema compatibility. See docs/question-service.md.');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
