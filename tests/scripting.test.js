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
import { contentScriptSync, contextMenuBuilder } from '../src/index.js';

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

/**
 * A fake `chrome.contextMenus` as Chrome behaves: `removeAll` and `create` take a moment, and an id
 * created twice leaves "Cannot create item with duplicate id" in `runtime.lastError`.
 *
 * @returns {{edges: import('../src/scripting/context-menus.js').MenuEdges, ids: string[], errors: string[]}}
 */
function fakeMenus() {
  /** @type {string[]} */
  const ids = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {{lastError?: {message?: string}}} */
  const runtime = {};
  const later = () => new Promise((resolve) => setTimeout(resolve, 2));
  const contextMenus = /** @type {import('../src/scripting/context-menus.js').MenuEdges['contextMenus']} */ (/** @type {unknown} */ ({
    removeAll: async () => { await later(); ids.length = 0; },
    create: (/** @type {chrome.contextMenus.CreateProperties} */ item, /** @type {() => void} */ done) => {
      later().then(() => {
        const id = String(item.id);
        if (ids.includes(id)) {
          runtime.lastError = { message: `Cannot create item with duplicate id ${id}` };
          errors.push(id);
        } else ids.push(id);
        done();
        delete runtime.lastError;
      });
    },
  }));
  return { edges: { contextMenus, runtime }, ids, errors };
}

describe('contextMenuBuilder', () => {
  const items = [{ id: 'parent', title: 'Parent' }, { id: 'a', parentId: 'parent', title: 'A' }, { id: 'b', parentId: 'parent', title: 'B' }];

  it('builds the menu in order', async () => {
    const { edges, ids } = fakeMenus();
    await contextMenuBuilder(edges)(items);
    assert.deepEqual(ids, ['parent', 'a', 'b']);
  });

  it('two builds at once (install and browser start in one run) never create an item twice', async () => {
    const { edges, ids, errors } = fakeMenus();
    const build = contextMenuBuilder(edges);
    const logged = console.error;
    console.error = () => {};
    try {
      await Promise.all([build(items), build(items)]);
    } finally {
      console.error = logged;
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(ids, ['parent', 'a', 'b']);
  });

  it('an item Chrome refuses is logged and the rest are still made', async () => {
    const { edges, ids } = fakeMenus();
    /** @type {unknown[][]} */
    const said = [];
    const logged = console.error;
    console.error = (...args) => { said.push(args); };
    try {
      await contextMenuBuilder(edges)([{ id: 'a', title: 'A' }, { id: 'a', title: 'Again' }, { id: 'b', title: 'B' }]);
    } finally {
      console.error = logged;
    }
    assert.deepEqual(ids, ['a', 'b']);
    assert.equal(said.length, 1);
    assert.match(String(said[0][1]), /duplicate id a/);
  });
});
