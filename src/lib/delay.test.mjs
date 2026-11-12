import { it } from 'node:test';
import assert from 'node:assert/strict';
import { delay } from './delay.mjs';

it('resolves asynchronously after the requested milliseconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const pending = delay(1000).then(() => { settled = true; });
  assert.ok(pending instanceof Promise);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.equal(await pending, undefined);
  assert.equal(settled, true);
});

it('a zero-duration delay still resolves asynchronously', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const pending = delay(0).then(() => { settled = true; });
  assert.equal(settled, false);
  t.mock.timers.runAll();
  await pending;
  assert.equal(settled, true);
});
