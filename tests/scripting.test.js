/**
 * The registered content script kept in step: registered, updated and unregistered to match,
 * in order, against a fake `chrome.scripting` that keeps registrations as Chrome does (an
 * id registered twice is refused).
 *
 * @module tests/scripting
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import { contentScriptSync } from '../src/index.js';

/** @import { ContentScript } from '../src/index.js' */

/**
 * A fake `chrome.scripting` that keeps registrations, each call a little late, logging calls.
 *
 * @returns {{scripting: import('../src/scripting/registration.js').Scripting, scripts: Map<string, chrome.scripting.RegisteredContentScript>, calls: string[]}}
 */
function fakeScripting() {
  /** @type {Map<string, chrome.scripting.RegisteredContentScript>} */
  const scripts = new Map();
  /** @type {string[]} */
  const calls = [];
  const later = () => new Promise((resolve) => setTimeout(resolve, 2));
  const scripting = /** @type {import('../src/scripting/registration.js').Scripting} */ (/** @type {unknown} */ ({
    getRegisteredContentScripts: async (/** @type {{ids: string[]}} */ { ids }) => { await later(); return ids.filter((id) => scripts.has(id)).map((id) => scripts.get(id)); },
    registerContentScripts: async (/** @type {chrome.scripting.RegisteredContentScript[]} */ list) => {
      await later();
      for (const script of list) {
        if (scripts.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
        scripts.set(script.id, script);
        calls.push(`register ${script.matches?.join(' ')}`);
      }
    },
    updateContentScripts: async (/** @type {chrome.scripting.RegisteredContentScript[]} */ list) => {
      await later();
      for (const script of list) { scripts.set(script.id, script); calls.push(`update ${script.matches?.join(' ')}`); }
    },
    unregisterContentScripts: async (/** @type {{ids: string[]}} */ { ids }) => { await later(); for (const id of ids) scripts.delete(id); calls.push('unregister'); },
  }));
  return { scripting, scripts, calls };
}

describe('contentScriptSync', () => {
  it('registers, updates and unregisters to match what’s wanted at the time', async () => {
    const { scripting, scripts, calls } = fakeScripting();
    /** @type {ContentScript | null} */
    let wanted = { js: ['content/loader.js'], matches: ['https://*/*'] };
    const sync = contentScriptSync(scripting, 'prices', async () => wanted);
    await sync();
    assert.deepEqual(scripts.get('prices'), { id: 'prices', js: ['content/loader.js'], matches: ['https://*/*'] });
    wanted = { js: ['content/loader.js'], matches: ['https://*/*', 'http://*/*'], excludeMatches: ['*://a.com/*'] };
    await sync();
    assert.deepEqual(scripts.get('prices')?.excludeMatches, ['*://a.com/*']);
    wanted = null;
    await sync();
    await sync();
    assert.equal(scripts.size, 0);
    assert.deepEqual(calls, ['register https://*/*', 'update https://*/* http://*/*', 'unregister']);
  });

  it('runs quick calls one after another, so two registers never race', async () => {
    const { scripting, scripts, calls } = fakeScripting();
    let on = true;
    const sync = contentScriptSync(scripting, 'prices', async () => (on ? { js: ['a.js'], matches: ['https://*/*'] } : null));
    await Promise.all([sync(), sync(), sync()]);
    assert.deepEqual(calls, ['register https://*/*', 'update https://*/*', 'update https://*/*']);
    on = false;
    const last = sync();
    on = true;
    await Promise.all([last, sync()]);
    assert.ok(scripts.has('prices'), 'the last call wins');
  });

  it('a refused change rejects that call only; the next still runs', async () => {
    const { scripting, scripts } = fakeScripting();
    let fail = true;
    const sync = contentScriptSync(scripting, 'prices', async () => {
      if (fail) throw new Error('no');
      return { js: ['a.js'], matches: ['https://*/*'] };
    });
    await assert.rejects(sync(), /no/);
    fail = false;
    await sync();
    assert.ok(scripts.has('prices'));
  });

  it('is in the runtime half, vendored with it', () => {
    assert.ok(RUNTIME_ENTRIES.includes('scripting'));
  });
});
