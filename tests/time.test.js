/**
 * Time limits: `within`, in the runtime half (a service worker uses it), not only in tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import { eachLimited, within } from '../src/index.js';
import * as testing from '../src/testing/index.js';

describe('within', () => {
  it('gives the value when it comes in time, and clears its timer at once', async (t) => {
    const cleared = t.mock.method(globalThis, 'clearTimeout');
    assert.equal(await within(Promise.resolve('done'), 60_000, 'late'), 'done');
    assert.equal(cleared.mock.callCount(), 1);
  });

  it('gives the fallback when it’s late or fails, and never rejects', async () => {
    assert.equal(await within(new Promise(() => {}), 20, 'late'), 'late');
    assert.deepEqual(await within(Promise.reject(new Error('gone')), 1000, []), []);
  });

  it('is the runtime half’s, vendored with it, and no longer in /testing', () => {
    assert.ok(RUNTIME_ENTRIES.includes('time'));
    assert.equal('within' in testing, false);
  });
});

describe('eachLimited with a limit that isn’t one', () => {
  it('a limit of 0, less, or not a number still does the work, one at a time', async () => {
    for (const limit of [0, -2, Number.NaN, 0.5]) {
      /** @type {number[]} */
      const done = [];
      let running = 0;
      let most = 0;
      await eachLimited([1, 2, 3], limit, async (item) => {
        most = Math.max(most, ++running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        done.push(item);
      });
      assert.deepEqual(done, [1, 2, 3], String(limit));
      assert.equal(most, 1);
    }
  });
});
