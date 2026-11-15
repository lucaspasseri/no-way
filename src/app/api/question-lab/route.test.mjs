import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ownerHash, labCookie } from '../../../server/lab-http.mjs';

let execute;
mock.module('../../../server/question-lab.mjs', { namedExports: { questionLab: Object.fromEntries(['get', 'create', 'advance', 'finish', 'challenge', 'report'].map(name => [name, (...args) => execute(name, ...args)])) } });
const { GET, POST } = await import('./route.js');
const id = '5c1e777c-5d51-4fb0-8136-078bd28347f5';
const token = 'a'.repeat(64);
const request = (body, headers = {}) => new Request('http://localhost/api/question-lab', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${labCookie}=${token}`, ...headers }, body: JSON.stringify(body) });

it('creates cookie-private packs and dispatches bounded idempotent generation actions', async () => {
  execute = async (method, packId, owner, config) => {
    assert.equal(method, 'create'); assert.equal(packId, id); assert.equal(typeof owner, 'string');
    assert.equal(config.count, 10); return { id, questions: [] };
  };
  const create = await POST(request({ action: 'create', id, config: { count: 10 } }, { Cookie: '' }));
  assert.equal(create.status, 200);
  assert.match(create.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=86400/);
  assert.equal(create.headers.get('cache-control'), 'no-store');
  execute = async (method, packId, owner, attempt) => {
    assert.equal(method, 'advance'); assert.equal(packId, id); assert.equal(owner, ownerHash(token)); assert.equal(attempt, 0);
    return { id, accepted: 0, questions: [] };
  };
  assert.equal((await POST(request({ action: 'advance', id, attempt: 0 }))).status, 200);
});

it('returns answer-free failed challenges and reveals only successful server results', async () => {
  for (const result of [{ success: false }, { success: true, answer: 8, guess: 10, question: { id: 1, answer: 8, verification: 'unverified' } }]) {
    execute = async (method, packId, owner, questionId, guess) => {
      assert.equal(method, 'challenge'); assert.equal(packId, id); assert.equal(owner, ownerHash(token));
      assert.equal(questionId, 1); assert.equal(guess, 10); return result;
    };
    assert.deepEqual(await (await POST(request({ action: 'challenge', id, questionId: 1, guess: 10 }))).json(), { result });
  }
});

it('rejects oversized, malformed, cross-origin and answer-injecting requests before reaching the service', async () => {
  execute = async () => { assert.fail('Invalid requests must not reach the service'); };
  for (const body of [null, { action: 'advance', id, attempt: 13 }, { action: 'create', id: '../invalid', config: {} },
    { action: 'report', id, questionId: 21 }, { action: 'challenge', id, questionId: 1, guess: 10, answer: 8 },
    { action: 'create', id, config: { topic: 'x'.repeat(5000) } }]) assert.equal((await POST(request(body))).status, 400);
  assert.equal((await POST(request({ action: 'finish', id }, { Origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await POST(request({ action: 'finish', id }, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await POST(request({ action: 'finish', id }, { 'Content-Type': 'text/plain' }))).status, 400);
});

it('accepts same-origin requests through a normalized internal URL and checks the public host', async () => {
  execute = async method => { assert.equal(method, 'finish'); return { id, questions: [] }; };
  assert.equal((await POST(request({ action: 'finish', id }, { Host: '127.0.0.1:3107', Origin: 'http://127.0.0.1:3107' }))).status, 200);
  assert.equal((await POST(request({ action: 'finish', id }, { Host: 'game.example', Origin: 'https://game.example', 'X-Forwarded-Proto': 'https' }))).status, 200);
});

it('hides private server errors, communicates rate and concurrency limits, and retrieves owner-scoped packs', async t => {
  t.mock.method(console, 'error', () => {});
  execute = async (method, packId, owner) => { assert.equal(method, 'get'); assert.equal(packId, id); assert.equal(owner, ownerHash(token)); return { id, questions: [] }; };
  assert.equal((await GET(new Request(`http://localhost/api/question-lab?id=${id}`, { headers: { Cookie: `${labCookie}=${token}` } }))).status, 200);
  for (const [code, status] of [['INVALID_CONFIG', 400], ['PACK_UNAVAILABLE', 404], ['LAB_BUSY', 409], ['LAB_RATE_LIMIT', 429], ['42P01', 503]]) {
    execute = async () => { throw Object.assign(new Error(code === '42P01' ? 'private credential' : 'Safe public message'), { code }); };
    const response = await POST(request({ action: 'finish', id }));
    assert.equal(response.status, status); assert.ok(!JSON.stringify(await response.json()).includes('private'));
    if (status === 429) assert.equal(response.headers.get('retry-after'), '3600');
  }
});

it('identifies production setup failures and logs only safe diagnostic fields', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const [databaseCode, code] of [
    ['42P01', 'LAB_SETUP_REQUIRED'], ['42703', 'LAB_SETUP_REQUIRED'],
    ['DATABASE_URL_MISSING', 'LAB_CONFIGURATION_REQUIRED'], ['DATABASE_URL_INVALID', 'LAB_CONFIGURATION_REQUIRED'],
    ['42501', 'LAB_DATABASE_PERMISSIONS'], ['28P01', 'LAB_DATABASE_CONNECTION'],
    ['ECONNREFUSED', 'LAB_DATABASE_CONNECTION'], ['CERT_HAS_EXPIRED', 'LAB_DATABASE_CONNECTION'],
    ['57014', 'LAB_DATABASE_TIMEOUT'], ['private-credential', 'LAB_UNAVAILABLE'],
  ]) {
    execute = async () => { throw Object.assign(new Error('private connection string and SQL'), { code: databaseCode, detail: 'private question data' }); };
    const response = await POST(request({ action: 'create', id, config: { count: 10 } }));
    const payload = await response.json();
    assert.equal(response.status, 503); assert.equal(payload.code, code);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const logged = log.mock.calls.at(-1).arguments;
    assert.deepEqual(logged, ['Question Lab request failed.', { action: 'create', code, databaseCode: databaseCode === 'private-credential' ? 'UNKNOWN' : databaseCode }]);
    assert.doesNotMatch(JSON.stringify({ payload, logged }), /private|credential|connection string|SQL/);
  }
  execute = async () => { throw Object.assign(new Error('private server error'), { code: '42P01' }); };
  const response = await GET(new Request(`http://localhost/api/question-lab?id=${id}`, { headers: { Cookie: `${labCookie}=${token}` } }));
  assert.equal((await response.json()).code, 'LAB_SETUP_REQUIRED');
  assert.equal(log.mock.calls.at(-1).arguments[1].action, 'get');
});
