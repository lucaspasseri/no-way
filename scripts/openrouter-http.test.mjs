// Exercise the real SDK's serialization and response parsing, intercepting HTTP.
import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestOpenRouter, DEFAULT_MODEL } from './openrouter.mjs';

beforeEach(t => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'http-test-key';
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });
});

it('the real SDK authenticates, serializes the Responses request, and parses a successful response', async t => {
  const transport = t.mock.method(globalThis, 'fetch', async request => {
    assert.equal(request.url, 'https://openrouter.ai/api/v1/responses');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('Authorization'), 'Bearer http-test-key');
    const body = await request.json();
    assert.equal(body.model, DEFAULT_MODEL);
    assert.equal(body.input, 'Reply with exactly: OK');
    assert.equal(body.max_output_tokens, 128);
    assert.equal(body.store, false);
    return Response.json({
      id: 'resp_test', object: 'response', model: DEFAULT_MODEL, status: 'completed',
      created_at: 0, completed_at: 1, error: null, incomplete_details: null,
      frequency_penalty: null, presence_penalty: null, temperature: null, top_p: null,
      instructions: null, metadata: null, parallel_tool_calls: false, tool_choice: 'auto', tools: [],
      output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'OK', annotations: [] }] }],
    });
  });
  assert.deepEqual(await requestOpenRouter({ model: DEFAULT_MODEL }), { model: DEFAULT_MODEL, text: 'OK' });
  assert.equal(transport.mock.callCount(), 1);
});

it('the real SDK HTTP error is sanitized without retries or leaked provider details', async t => {
  const transport = t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: { code: 401, message: 'Rejected Bearer http-test-key' },
  }, { status: 401 }));
  await assert.rejects(requestOpenRouter(), error => {
    assert.match(error.message, /authentication failed/);
    assert.ok(!error.message.includes('http-test-key'));
    return true;
  });
  assert.equal(transport.mock.callCount(), 1);
});
