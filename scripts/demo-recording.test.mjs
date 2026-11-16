import { it } from 'node:test';
import assert from 'node:assert/strict';
import { previewEnvironment } from '../tests/isolated-preview.mjs';

it('isolates recordings from production credentials, provider configuration and preloads', () => {
  const env = previewEnvironment({ PATH: '/bin', DATABASE_URL: 'production-database', OPENROUTER_API_KEY: 'real-key',
    OPENROUTER_MODEL: 'paid/model', OPENROUTER_FALLBACK_MODELS: 'paid/backup', NODE_OPTIONS: '--import=untrusted',
    NEXT_PUBLIC_SECRET: 'private', NO_WAY_TEST_AI: '0' }, 'temporary-database', '/temporary preview');
  assert.equal(env.DATABASE_URL, 'temporary-database');
  assert.equal(env.OPENROUTER_API_KEY, 'isolated-test-key');
  assert.equal(env.NO_WAY_TEST_AI, '1');
  assert.equal(env.OPENROUTER_MODEL, undefined);
  assert.equal(env.OPENROUTER_FALLBACK_MODELS, undefined);
  assert.equal(env.NEXT_PUBLIC_SECRET, undefined);
  assert.equal(env.PATH, '/bin');
  assert.match(env.NODE_OPTIONS, /^--import=file:.*temporary%20preview\/tests\/mock-ai-provider\.mjs$/);
});
