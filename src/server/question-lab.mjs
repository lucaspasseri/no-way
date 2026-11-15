import 'server-only';
import { getPool } from '../../db/pool.mjs';
import { questionError } from '../../db/question-validation.mjs';
import { publicQuestion, getQuestionOptions } from './questions.mjs';
import { labConfigSchema, maxAttempts, packIdSchema } from '../features/lab/config.mjs';
import { resolveChallenge, validateGuess } from '../features/game/game-rules.mjs';
import { advanceGeneration } from './lab-generation.mjs';

export function publicPack(row) {
  const { questions, attempts, rejected, status, lastError: storedError, reports = [] } = row.data;
  const remaining = Math.max(0, maxAttempts(row.config.count) - attempts);
  // Packs created before detailed errors, or explicitly finished after a failure,
  // must not advertise retries once they are closed.
  const lastError = storedError?.replace(/You can retry within the remaining attempt limit\.|You have \d+ generation attempts? remaining\./,
    status === 'generating' ? `You have ${remaining} generation ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
      : 'This pack is closed. Generate a new pack or keep any accepted questions.') ?? null;
  return { id: row.id, config: row.config, expiresAt: row.expires_at, status,
    accepted: questions.length, attempts, maxAttempts: maxAttempts(row.config.count), rejected,
    lastError, lastErrorCode: row.data.lastErrorCode ?? null, verification: 'unverified', reported: reports,
    questions: questions.map(question => ({ ...publicQuestion(question), contentLocale: row.config.locale ?? 'en', origin: 'ai', status: 'generated', verification: 'unverified' })) };
}

/** Private temporary packs use the existing candidate schema, not canonical taxonomy writes. */
export function createLabService({ pool = getPool, options = getQuestionOptions, generate } = {}) {
  async function transaction(work) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '55P03') throw questionError('LAB_BUSY', 'This pack is already processing a request. Try again shortly.');
      throw error;
    } finally { client.release(); }
  }

  async function owned(client, id, owner, lock = false) {
    if (!packIdSchema.safeParse(id).success || !owner) throw questionError('PACK_UNAVAILABLE', 'This private pack is unavailable or has expired.');
    const { rows: [row] } = await client.query(`SELECT * FROM public.question_lab_packs
      WHERE id = $1 AND owner_hash = $2 AND expires_at > CURRENT_TIMESTAMP ${lock ? 'FOR UPDATE NOWAIT' : ''}`, [id, owner]);
    if (!row) throw questionError('PACK_UNAVAILABLE', 'This private pack is unavailable or has expired.');
    return row;
  }

  async function save(client, row, data) {
    await client.query('UPDATE public.question_lab_packs SET data = $2::jsonb WHERE id = $1', [row.id, JSON.stringify(data)]);
    return publicPack({ ...row, data });
  }

  return {
    async create(id, owner, input) {
      const parsed = labConfigSchema.safeParse(input);
      if (!parsed.success || !packIdSchema.safeParse(id).success || !owner) throw questionError('INVALID_CONFIG', 'Check the pack size, topic, and knowledge level.');
      const config = parsed.data;
      const available = await options();
      if (config.topicMode === 'categories' && config.categories.some(category => !available.categories.includes(category))) {
        throw questionError('INVALID_CONFIG', 'Choose categories available in the question bank.');
      }
      return transaction(async client => {
        // Serialize admission across instances, including global spend limits.
        await client.query('SELECT pg_advisory_xact_lock(782401)');
        const { rows: [previous] } = await client.query('SELECT * FROM public.question_lab_packs WHERE id = $1', [id]);
        if (previous) {
          if (previous.owner_hash !== owner || new Date(previous.expires_at) <= new Date()) throw questionError('PACK_UNAVAILABLE', 'This pack is unavailable.');
          return publicPack(previous);
        }
        const { rows: [usage] } = await client.query(`SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE owner_hash = $1)::integer AS personal FROM public.question_lab_packs
          WHERE created_at > CURRENT_TIMESTAMP - interval '1 hour'`, [owner]);
        if (usage.personal >= 3 || usage.total >= 12) throw questionError('LAB_RATE_LIMIT', 'The lab has reached its hourly generation limit. Try again in an hour.');
        await client.query('DELETE FROM public.question_lab_packs WHERE expires_at <= CURRENT_TIMESTAMP');
        const data = { questions: [], attempts: 0, rejected: 0, status: 'generating', lastError: null, reports: [] };
        const { rows: [row] } = await client.query(`INSERT INTO public.question_lab_packs(id, owner_hash, config, data)
          VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING *`, [id, owner, JSON.stringify(config), JSON.stringify(data)]);
        return publicPack(row);
      });
    },

    async get(id, owner) { return publicPack(await owned(pool(), id, owner)); },

    async advance(id, owner, expectedAttempt) {
      return transaction(async client => {
        const row = await owned(client, id, owner, true);
        if (row.data.status !== 'generating' || row.data.attempts !== expectedAttempt) return publicPack(row);
        // At most two provider calls at a time across all server instances.
        let lane = await client.query('SELECT pg_try_advisory_xact_lock(782402) AS acquired');
        if (!lane.rows[0].acquired) lane = await client.query('SELECT pg_try_advisory_xact_lock(782403) AS acquired');
        if (!lane.rows[0].acquired) throw questionError('LAB_BUSY', 'The lab is busy with other packs. Try again shortly.');
        const { rows: existing } = await client.query(`SELECT question FROM public.questions
          UNION ALL SELECT candidate->>'question' AS question FROM public.question_lab_packs,
          jsonb_array_elements(data->'questions') AS candidate WHERE expires_at > CURRENT_TIMESTAMP AND id <> $1`, [id]);
        const data = await advanceGeneration(row.config, row.data, existing, generate);
        return save(client, row, data);
      });
    },

    async finish(id, owner) {
      return transaction(async client => {
        const row = await owned(client, id, owner, true);
        return save(client, row, { ...row.data, status: row.data.questions.length === row.config.count ? 'ready' : row.data.questions.length ? 'partial' : 'failed' });
      });
    },

    async challenge(id, owner, questionId, guess) {
      if (!Number.isInteger(questionId) || questionId < 1 || typeof guess !== 'number' || validateGuess(guess)) throw questionError('INVALID_CHALLENGE', 'Invalid challenge.');
      const row = await owned(pool(), id, owner);
      const question = row.data.questions.find(question => question.id === questionId);
      if (!question || !['ready', 'partial'].includes(row.data.status)) throw questionError('PACK_UNAVAILABLE', 'This question is unavailable.');
      return resolveChallenge(guess, { ...publicQuestion(question), contentLocale: row.config.locale ?? 'en', answer: question.answer,
        explanation: question.explanation, ...(question.sourceUrl && { src: question.sourceUrl }),
        'src-label': 'AI-suggested reference · not checked', origin: 'ai', status: 'generated', verification: 'unverified' });
    },

    async report(id, owner, questionId) {
      return transaction(async client => {
        const row = await owned(client, id, owner, true);
        if (!row.data.questions.some(question => question.id === questionId)) throw questionError('PACK_UNAVAILABLE', 'This question is unavailable.');
        return save(client, row, { ...row.data, reports: [...new Set([...row.data.reports, questionId])] });
      });
    },
  };
}

export const questionLab = createLabService();
