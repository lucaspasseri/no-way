import { it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let send;
let clients;
mock.module('@openrouter/sdk', {
  namedExports: {
    OpenRouter: class {
      constructor(options) {
        clients.push(options);
        this.responses = { send: (...args) => send(...args) };
      }
    },
  },
});
const { requestOpenRouter, DEFAULT_MODEL } = await import('./openrouter.mjs');

function complete(text = 'OK') {
  return { status: 'completed', model: DEFAULT_MODEL, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
}
beforeEach(t => {
  const previous = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL };
  t.after(() => {
    if (previous.key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = previous.model;
  });
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  delete process.env.OPENROUTER_MODEL;
  clients = [];
  send = async () => complete();
});

it('awaits the official SDK response, sends a bounded request, and returns only model text', async () => {
  let resolve;
  send = request => {
    assert.deepEqual(request.responsesRequest, {
      model: DEFAULT_MODEL, input: 'Reply with exactly: OK', maxOutputTokens: 128,
      reasoning: { effort: 'none' }, stream: false, store: false,
    });
    return new Promise(done => { resolve = done; });
  };
  let settled = false;
  const pending = requestOpenRouter().then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  resolve({ ...complete(), output: [{ type: 'reasoning', summary: [] }, ...complete().output] });
  assert.deepEqual(await pending, { model: DEFAULT_MODEL, text: 'OK' });
  assert.deepEqual(clients, [{
    apiKey: 'unit-test-key', serverURL: 'https://openrouter.ai/api/v1',
    timeoutMs: 30000, retryConfig: { strategy: 'none' },
  }]);
});

it('accepts model slugs from configuration and explicit model/prompt arguments', async () => {
  process.env.OPENROUTER_MODEL = 'provider/configured-model';
  const requests = [];
  send = async request => { requests.push(request.responsesRequest); return complete(); };
  await requestOpenRouter();
  await requestOpenRouter({ model: 'provider/selected-model', prompt: 'Hello' });
  assert.equal(requests[0].model, 'provider/configured-model');
  assert.equal(requests[1].model, 'provider/selected-model');
  assert.equal(requests[1].input, 'Hello');
});

it('asks for key creation without making requests when the environment key is missing', async () => {
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(requestOpenRouter(), /Create a key at https:\/\/openrouter.ai\/keys/);
  assert.deepEqual(clients, []);
});

it('rejects invalid model names and empty prompts before making requests', async () => {
  await assert.rejects(requestOpenRouter({ model: 'not-a-slug' }), /model slug/);
  await assert.rejects(requestOpenRouter({ prompt: '  ' }), /nonempty text prompt/);
  assert.deepEqual(clients, []);
});

it('handles authentication, credit, rate limit, provider, and timeout errors without leaking SDK details', async () => {
  for (const [error, expected] of [
    [{ statusCode: 401 }, /authentication failed/],
    [{ statusCode: 402 }, /requires more credits/],
    [{ statusCode: 403 }, /denied access/],
    [{ statusCode: 404 }, /model or endpoint is unavailable/],
    [{ statusCode: 429 }, /rate limit/],
    [{ statusCode: 503 }, /temporarily unavailable/],
    [{ name: 'RequestTimeoutError' }, /timed out/],
    [{ name: 'ConnectionError' }, /network connectivity/],
  ]) {
    send = async () => { throw { ...error, message: 'unit-test-key', headers: { Authorization: 'Bearer unit-test-key' } }; };
    await assert.rejects(requestOpenRouter(), failure => {
      assert.match(failure.message, expected);
      assert.ok(!JSON.stringify(failure).includes('unit-test-key'));
      assert.ok(!failure.message.includes('unit-test-key'));
      return true;
    });
  }
});

it('handles incomplete, failed, and empty model responses', async () => {
  for (const response of [{ status: 'incomplete' }, { status: 'failed' }, complete(''), { ...complete(), output: [] }]) {
    send = async () => response;
    await assert.rejects(requestOpenRouter(), /did not complete|returned no text/);
  }
});

it('the CLI exits unsuccessfully with setup instructions when no key is configured', () => {
  const script = fileURLToPath(new URL('./openrouter.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, OPENROUTER_API_KEY: '' }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPENROUTER_API_KEY is not set/);
  assert.match(result.stderr, /https:\/\/openrouter.ai\/keys/);
  assert.equal(result.stdout, '');
});
