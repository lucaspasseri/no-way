import { it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceGeneration, screenLabCandidate } from './lab-generation.mjs';
import { publicPack } from './question-lab.mjs';
import { defaultLabConfig, labChunkSize, maxAttempts } from '../features/lab/config.mjs';
import { labCandidates } from '../../tests/fixtures/lab-candidates.mjs';

const initial = () => ({ questions: [], attempts: 0, rejected: 0, status: 'generating', lastError: null, reports: [] });

it('screens missing, invalid, ambiguous, unitless, unstable, duplicate, unsafe, and answer-disclosing questions', () => {
  assert.equal(screenLabCandidate(labCandidates[0], [], defaultLabConfig).answer, 8);
  for (const patch of [{ answer: null }, { answer: -1 }, { answer: Infinity }, { explanation: '' }, { sourceUrl: 'javascript:alert(1)' },
    { question: 'How many faces does the best polyhedron have?' }, { question: 'How many fans currently follow this team?' },
    { unit: 'kilometers' }, { question: 'How many faces approximately does this object have?' },
    { question: 'How many faces does an octahedron with 8 faces have?' }, { question: 'How many explosive devices are in the collection?' }]) {
    assert.throws(() => screenLabCandidate({ ...labCandidates[0], ...patch }, [], defaultLabConfig));
  }
  assert.throws(() => screenLabCandidate(labCandidates[0], [labCandidates[0]], defaultLabConfig), { code: 'DUPLICATE_QUESTION' });
  assert.throws(() => screenLabCandidate(labCandidates[0], [], { ...defaultLabConfig, difficulty: 'hard' }));
  assert.throws(() => screenLabCandidate(labCandidates[0], [], { ...defaultLabConfig, topicMode: 'categories', categories: ['science'] }));
});

it('generates in small bounded calls, preserves private provenance, and projects answer-free previews', async () => {
  const config = { ...defaultLabConfig, topicMode: 'custom', topic: 'Pokémon', knowledge: 'custom', challenge: 'For a 10-year-old' };
  let offset = 0;
  const privateBank = [{ question: 'A private canonical question that must remain on the server?' }];
  const generate = async options => {
    assert.equal(options.count, labChunkSize); assert.equal(options.timeoutMs, 20000);
    assert.ok(!options.existing.some(question => question.question === privateBank[0].question));
    assert.equal(options.preferences.topic, 'Pokémon'); assert.equal(options.preferences.challenge, 'For a 10-year-old');
    const candidates = labCandidates.slice(offset, offset + options.count); offset += options.count;
    return { candidates, model: 'test/model' };
  };
  let data = await advanceGeneration(config, initial(), privateBank, generate);
  assert.equal(data.questions.length, 2); assert.equal(data.status, 'generating');
  while (data.status === 'generating') data = await advanceGeneration(config, data, privateBank, generate);
  assert.equal(data.questions.length, 10); assert.equal(data.status, 'ready'); assert.equal(data.attempts, 5);
  assert.ok(data.questions.every(question => question.status === 'generated' && question.verification === 'unverified' && question.model === 'test/model'));
  const preview = publicPack({ id: 'pack', config, data, expires_at: 'tomorrow' });
  for (const question of preview.questions) for (const key of ['answer', 'explanation', 'sourceUrl', 'src', 'model', 'generatedAt']) assert.equal(key in question, false, key);
  assert.equal(preview.accepted, 10); assert.equal(preview.verification, 'unverified');
});

it('rejects duplicates within a batch and against existing questions and returns honest partial results at the retry limit', async () => {
  let calls = 0;
  const generate = async () => ({ candidates: calls++ === 0 ? [labCandidates[0], labCandidates[0]] : [labCandidates[1], labCandidates[2]], model: 'test/model' });
  let data = initial();
  for (let attempt = 0; attempt < maxAttempts(10); attempt++) data = await advanceGeneration(defaultLabConfig, data, [labCandidates[2]], generate);
  assert.equal(data.questions.length, 2); assert.equal(data.status, 'partial'); assert.equal(data.rejected, 12);
  assert.equal(new Set(data.questions.map(question => question.question)).size, 2);
});

it('assembles fifteen- and twenty-question packs without exceeding the chunk or attempt budget', async () => {
  for (const count of [15, 20]) {
    let offset = 0, data = initial();
    const generate = async ({ count: size }) => {
      assert.ok(size <= labChunkSize);
      const candidates = labCandidates.slice(offset, offset + size); offset += size;
      return { candidates, model: 'test/model' };
    };
    while (data.status === 'generating') data = await advanceGeneration({ ...defaultLabConfig, count }, data, [], generate);
    assert.equal(data.status, 'ready'); assert.equal(data.questions.length, count);
    assert.equal(data.attempts, Math.ceil(count / labChunkSize));
  }
});

it('preserves accepted questions on provider errors and timeouts and never fabricates substitutes', async () => {
  for (const name of ['Error', 'TimeoutError']) {
    const generate = async () => { throw Object.assign(new Error('private provider detail'), { name }); };
    const data = await advanceGeneration(defaultLabConfig, initial(), [], generate);
    assert.equal(data.attempts, 1); assert.deepEqual(data.questions, []); assert.match(data.lastError, /provider/);
    assert.ok(!data.lastError.includes('private'));
    const failed = await advanceGeneration(defaultLabConfig, { ...data, attempts: maxAttempts(10) - 1 }, [], generate);
    assert.equal(failed.status, 'failed'); assert.deepEqual(failed.questions, []);
    assert.match(failed.lastError, /reached its attempt limit/); assert.doesNotMatch(failed.lastError, /attempts remaining/);
    const partial = await advanceGeneration(defaultLabConfig, { ...data, attempts: maxAttempts(10) - 1, questions: [labCandidates[0]] }, [], generate);
    assert.equal(partial.status, 'partial'); assert.equal(partial.questions.length, 1);
  }
});

it('preserves safe failure codes with specific recovery text and never forwards provider messages', async () => {
  for (const [code, pattern] of [['AI_TIMEOUT', /timed out/], ['AI_RATE_LIMIT', /rate limiting/], ['AI_AUTHENTICATION', /credentials/],
    ['AI_CREDITS', /credits/], ['INVALID_AI_RESPONSE', /invalid question batch/], ['AI_INVALID_RESPONSE', /unreadable/]]) {
    const data = await advanceGeneration(defaultLabConfig, initial(), [], async () => { throw Object.assign(new Error('private key and provider payload'), { code }); });
    assert.equal(data.lastErrorCode, code); assert.match(data.lastError, pattern);
    assert.doesNotMatch(data.lastError, /private key|payload/);
    const pack = publicPack({ id: 'test', config: defaultLabConfig, data });
    assert.equal(pack.lastErrorCode, code);
  }
});

it('does not advertise remaining retries for restored failed packs or explicitly kept partial packs', () => {
  for (const [status, lastError] of [['failed', 'The AI provider could not complete this batch. You can retry within the remaining attempt limit.'],
    ['partial', 'The AI provider timed out. You have 6 generation attempts remaining.']]) {
    const data = { ...initial(), status, attempts: 4, lastError };
    const pack = publicPack({ id: 'test', config: defaultLabConfig, data });
    assert.match(pack.lastError, /pack is closed/);
    assert.doesNotMatch(pack.lastError, /attempts remaining|retry within/);
  }
});
