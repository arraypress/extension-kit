/**
 * A page's side of an extension: a module's function called in the page (the function
 * `executeScript` runs, run here for real against a module file, and what reaches Chrome), the
 * overlay a content script draws in (jsdom: a closed shadow root, replaced, removed), and a tab's
 * side panel opened without awaiting anything first (a fake `chrome.sidePanel` that, as Chrome
 * does, refuses `open` once the click has passed).
 *
 * @module tests/page
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import { callInPage, importAndCall, openSidePanel, pageOverlay, sidePanelPath } from '../src/index.js';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const globals = /** @type {{chrome?: unknown}} */ (globalThis);

afterEach(() => { delete globals.chrome; });

describe('callInPage', () => {
  it('runs a function in the frames that imports the module by its extension address and calls the export', async () => {
    // The page's isolated world: chrome.runtime.getURL gives the module's address.
    globals.chrome = { runtime: { getURL: (/** @type {string} */ path) => new URL(path, FIXTURES).href } };
    /** @type {chrome.scripting.ScriptInjection<unknown[], unknown>[]} */
    const injected = [];
    const scripting = {
      executeScript: async (/** @type {any} */ injection) => {
        injected.push(injection);
        // Chrome runs the function in each frame, with the arguments cloned.
        return Promise.all([0, 7].map(async (frameId) => ({ frameId, documentId: `d${frameId}`, result: await injection.func(...structuredClone(injection.args)) })));
      },
    };
    const frames = await callInPage(scripting, { tabId: 3, allFrames: true }, 'page-module.js', 'echo', [{ key: 'Inter' }, 2]);
    assert.deepEqual(frames, [{ frameId: 0, result: { echo: [{ key: 'Inter' }, 2], calls: 1 } }, { frameId: 7, result: { echo: [{ key: 'Inter' }, 2], calls: 2 } }]);
    assert.deepEqual(injected[0].target, { tabId: 3, allFrames: true });
    assert.equal(injected[0].injectImmediately, true);
    assert.equal(injected[0].func, importAndCall);
    // The module stays loaded between calls: its state carries over.
    const module = await import(new URL('page-module.js', FIXTURES).href);
    assert.equal(module.calls.length, 2);
  });

  it('waits for the page to be idle only when asked, and Chrome’s refusal reaches the caller', async () => {
    /** @type {boolean[]} */
    const immediately = [];
    const scripting = {
      executeScript: async (/** @type {any} */ injection) => {
        immediately.push(injection.injectImmediately);
        throw new Error('Cannot access contents of the page.');
      },
    };
    await assert.rejects(callInPage(scripting, { tabId: 1 }, 'content/main.js', 'scan', [], { immediately: false }), /Cannot access/);
    assert.deepEqual(immediately, [false]);
  });

  it('is in the runtime half', () => {
    assert.ok(RUNTIME_ENTRIES.includes('scripting'));
    assert.ok(RUNTIME_ENTRIES.includes('panel'));
    assert.ok(RUNTIME_ENTRIES.includes('content'));
  });
});

describe('pageOverlay', () => {
  it('a host on the root element with a closed shadow root, its styles first; the page sees inside nothing', () => {
    const { document } = new JSDOM('<body><p>Page</p></body>').window;
    const { host, root, remove } = pageOverlay(document, { name: 'my-overlay', css: ':host { position: fixed; }' });
    assert.equal(host.parentNode, document.documentElement);
    assert.equal(host.localName, 'my-overlay');
    assert.equal(host.shadowRoot, null);
    assert.equal(root.mode, 'closed');
    assert.equal(root.firstElementChild?.localName, 'style');
    assert.equal(root.firstElementChild?.textContent, ':host { position: fixed; }');
    assert.equal(host.style.getPropertyValue('all'), 'initial');
    assert.equal(host.style.getPropertyPriority('all'), 'important');
    remove();
    assert.equal(document.querySelector('my-overlay'), null);
  });

  it('replaces one of the same name left by a run before, and leaves others', () => {
    const { document } = new JSDOM('<body></body>').window;
    pageOverlay(document, { name: 'my-overlay', css: '' });
    pageOverlay(document, { name: 'other-overlay', css: '' });
    const second = pageOverlay(document, { name: 'my-overlay', css: '' });
    assert.deepEqual([...document.documentElement.children].map((child) => child.localName), ['head', 'body', 'other-overlay', 'my-overlay']);
    assert.equal(document.querySelectorAll('my-overlay').length, 1);
    assert.equal(document.querySelector('my-overlay'), second.host);
  });
});

describe('openSidePanel', () => {
  /**
   * A fake `chrome.sidePanel`: as Chrome, `open` works only while the click still counts (in
   * the same turn as the click here), and `setOptions` answers a moment later.
   */
  function fakeSidePanel() {
    /** @type {string[]} */
    const calls = [];
    let clickPassed = false;
    queueMicrotask(() => { clickPassed = true; });
    return {
      calls,
      sidePanel: {
        setOptions: async (/** @type {chrome.sidePanel.PanelOptions} */ options) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          calls.push(`setOptions ${options.tabId} ${options.path} ${options.enabled}`);
        },
        open: async (/** @type {chrome.sidePanel.OpenOptions} */ options) => {
          if (clickPassed) throw new Error('`sidePanel.open()` may only be called in response to a user gesture.');
          calls.push(`open ${options.tabId}`);
        },
      },
    };
  }

  it('opens the tab’s own panel at once, its page told the tab, without waiting for setOptions', async () => {
    const { sidePanel, calls } = fakeSidePanel();
    await openSidePanel(/** @type {any} */ (sidePanel), 12, 'panel/panel.html');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(calls, ['open 12', 'setOptions 12 panel/panel.html?tab=12 true']);
    assert.equal(sidePanelPath('panel/panel.html', 4), 'panel/panel.html?tab=4');
  });

  it('awaiting first would lose the click: Chrome’s refusal reaches the caller', async () => {
    const { sidePanel } = fakeSidePanel();
    await Promise.resolve();
    await Promise.resolve();
    await assert.rejects(openSidePanel(/** @type {any} */ (sidePanel), 12, 'panel/panel.html'), /user gesture/);
  });
});
