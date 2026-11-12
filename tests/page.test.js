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
import {
  callInPage, callInTab, counted, createShowOnPage, iconButton, noticeCard, importAndCall, isBrowserPage, make, openSidePanel, pageOverlay, sidePanelPath, spriteIcon,
} from '../src/index.js';

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

  it('a frame where the module doesn’t load or the function throws says why (Chrome alone gives a bare null)', async () => {
    globals.chrome = { runtime: { getURL: (/** @type {string} */ path) => new URL(path, FIXTURES).href } };
    const scripting = {
      executeScript: async (/** @type {any} */ injection) => [{ frameId: 0, documentId: 'd', result: await injection.func(...injection.args) }],
    };
    const [thrown] = await callInPage(scripting, { tabId: 1 }, 'page-module.js', 'missing');
    assert.equal(thrown.result, null);
    assert.match(String(thrown.error), /not a function/);
    const [unloaded] = await callInPage(scripting, { tabId: 1 }, 'no-such-module.js', 'echo');
    assert.equal(unloaded.result, null);
    assert.equal(typeof unloaded.error, 'string');
    const [fine] = await callInPage(scripting, { tabId: 1 }, 'page-module.js', 'echo', ['x']);
    assert.equal('error' in fine, false);
  });

  it('timeoutMs: a call no frame answers in time rejects with a TimeoutError; one answered in time is unchanged', async () => {
    const never = { executeScript: () => new Promise(() => {}) };
    await assert.rejects(callInPage(/** @type {any} */ (never), { tabId: 1 }, 'm.js', 'f', [], { timeoutMs: 20 }), { name: 'TimeoutError' });
    const quick = { executeScript: async () => /** @type {any} */ ([{ frameId: 0, result: 'a' }]) };
    assert.deepEqual(await callInPage(quick, { tabId: 1 }, 'm.js', 'f', [], { timeoutMs: 20 }), [{ frameId: 0, result: 'a' }]);
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

describe('pageOverlay hostStyle', () => {
  it('sets each of the host’s own styles inline, !important, after the reset', () => {
    const { document } = new JSDOM('<body></body>').window;
    const { host } = pageOverlay(document, { name: 'my-overlay', css: '', hostStyle: { position: 'fixed', 'z-index': '2147483647' } });
    assert.equal(host.style.getPropertyValue('position'), 'fixed');
    assert.equal(host.style.getPropertyPriority('position'), 'important');
    assert.equal(host.style.getPropertyValue('z-index'), '2147483647');
    assert.equal(host.style.getPropertyPriority('z-index'), 'important');
  });
});

describe('callInTab', () => {
  /**
   * Fake tabs and scripting: the tab's address (or a refusal), and the frames' answers (or a refusal).
   *
   * @param {{url?: string, tabError?: boolean, frames?: {frameId: number, result: unknown}[], refusal?: string}} tab
   */
  const edges = ({ url = 'https://example.com/', tabError = false, frames = [], refusal } = {}) => ({
    tabs: { get: async () => { if (tabError) throw new Error('No tab with id'); return /** @type {chrome.tabs.Tab} */ ({ url }); } },
    scripting: { executeScript: async () => { if (refusal) throw new Error(refusal); return /** @type {any} */ (frames); } },
  });

  it('the frames that answered, the top one first', async () => {
    const reading = await callInTab(edges({ frames: [{ frameId: 9, result: 'b' }, { frameId: 0, result: 'a' }, { frameId: 4, result: null }] }), 1, 'content/main.js', 'scan');
    assert.deepEqual(reading, { state: 'read', frames: [{ frameId: 0, result: 'a' }, { frameId: 9, result: 'b' }] });
  });

  it('Chrome’s own pages by address, or by its refusal when the address isn’t known', async () => {
    for (const url of ['chrome://settings/', 'chrome-extension://abc/page.html', 'about:blank', 'view-source:https://a.com', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/x']) {
      assert.deepEqual(await callInTab(edges({ url }), 1, 'm.js', 'f'), { state: 'browser' }, url);
    }
    assert.equal(isBrowserPage('https://example.com/chrome://x'), false);
    assert.deepEqual(await callInTab(edges({ url: '', refusal: 'Cannot access a chrome:// URL' }), 1, 'm.js', 'f'), { state: 'browser' });
    assert.deepEqual(await callInTab(edges({ url: '', refusal: 'The extensions gallery cannot be scripted.' }), 1, 'm.js', 'f'), { state: 'browser' });
  });

  it('no access: no tab, another site’s refusal, or no frame answered', async () => {
    assert.deepEqual(await callInTab(edges({ tabError: true }), 1, 'm.js', 'f'), { state: 'no-access' });
    assert.deepEqual(await callInTab(edges({ refusal: 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.' }), 1, 'm.js', 'f'), { state: 'no-access' });
    assert.deepEqual(await callInTab(edges({ frames: [{ frameId: 0, result: undefined }] }), 1, 'm.js', 'f'), { state: 'no-access' });
  });
});

describe('callInTab, when the page’s side goes wrong', () => {
  it('failed: no frame answered and the call threw in one, with the top-most frame’s reason', async () => {
    const failing = (/** @type {unknown[]} */ results) => ({
      tabs: { get: async () => /** @type {chrome.tabs.Tab} */ ({ url: 'https://example.com/' }) },
      scripting: { executeScript: async () => /** @type {any} */ (results.map((result, index) => ({ frameId: index * 3, result }))) },
    });
    assert.deepEqual(await callInTab(failing([null, { 'extension-kit:call-failed': 'in a frame' }, { 'extension-kit:call-failed': 'later' }]), 1, 'm.js', 'f'),
      { state: 'failed', error: 'in a frame' });
    // A frame that did answer is what's read; the failed one is left out.
    assert.deepEqual(await callInTab(failing([{ 'extension-kit:call-failed': 'top' }, 'ok']), 1, 'm.js', 'f'), { state: 'read', frames: [{ frameId: 3, result: 'ok' }] });
  });

  it('timeout: a frame that never answers no longer keeps the caller waiting for ever', async () => {
    const stuck = {
      tabs: { get: async () => /** @type {chrome.tabs.Tab} */ ({ url: 'https://example.com/' }) },
      scripting: { executeScript: () => /** @type {Promise<any>} */ (new Promise(() => {})) },
    };
    assert.deepEqual(await callInTab(stuck, 1, 'm.js', 'f', [], { timeoutMs: 20 }), { state: 'timeout' });
  });
});

describe('createShowOnPage', () => {
  /** A panel's controller over a page that records what it was asked to box. */
  const panel = () => {
    /** @type {unknown[][]} */
    const page = [];
    /** @type {(string | null)[]} */
    const heard = [];
    const state = { fail: false };
    const onPage = createShowOnPage({
      show: async (ids, frame) => { page.push([ids, frame]); if (state.fail) throw new Error('No tab'); },
      onChange: (shown) => heard.push(shown),
    });
    return { onPage, page, heard, state };
  };

  it('a click shows an item, another item replaces it, the same item again takes it away', async () => {
    const { onPage, page, heard } = panel();
    await onPage.toggle('inter', ['inter'], 4);
    assert.equal(onPage.shown(), 'inter');
    await onPage.toggle('blue', ['blue-1', 'blue-2']);
    await onPage.toggle('blue', ['blue-1', 'blue-2']);
    assert.equal(onPage.shown(), null);
    assert.deepEqual(page, [[['inter'], 4], [['blue-1', 'blue-2'], undefined], [null, undefined]]);
    assert.deepEqual(heard, ['inter', 'blue', null]);
  });

  it('a rescan (or the panel closing) clears the page’s boxes, at once, and only if any are shown', async () => {
    const { onPage, page, heard } = panel();
    await onPage.reset();
    assert.deepEqual(page, []);
    await onPage.toggle('inter', ['inter']);
    const resetting = onPage.reset();
    assert.deepEqual(page.at(-1), [null, undefined]); // Sent before anything is awaited: a closing panel gets it out.
    assert.equal(onPage.shown(), null);
    await resetting;
    assert.deepEqual(heard, ['inter', null]);
  });

  it('the page cleared its own boxes (Esc there): the button is released and the page isn’t called', async () => {
    const { onPage, page, heard } = panel();
    await onPage.toggle('inter', ['inter']);
    onPage.cleared();
    onPage.cleared();
    assert.equal(onPage.shown(), null);
    assert.deepEqual(heard, ['inter', null]);
    assert.equal(page.length, 1);
    await onPage.toggle('inter', ['inter']); // Shows again, not “takes away”.
    assert.deepEqual(page.at(-1), [['inter'], undefined]);
  });

  it('a page that can’t be reached: nothing stays shown, the click’s failure reaches the caller, a reset’s doesn’t', async () => {
    const { onPage, heard, state } = panel();
    state.fail = true;
    await assert.rejects(onPage.toggle('inter', ['inter']), /No tab/);
    assert.equal(onPage.shown(), null);
    assert.deepEqual(heard, ['inter', null]);
    state.fail = false;
    await onPage.toggle('inter', ['inter']);
    state.fail = true;
    await onPage.reset();
    assert.equal(onPage.shown(), null);
  });
});

describe('make, spriteIcon and iconButton', () => {
  it('an element with its class and text; an icon from the sprite; Chrome’s icon button with its tooltip', () => {
    const { document } = new JSDOM('<body></body>').window;
    const span = make('span', 'meta', '12 colours', document);
    assert.equal(span.outerHTML, '<span class="meta">12 colours</span>');
    assert.equal(make('div', '', '', document).outerHTML, '<div></div>');
    const icon = spriteIcon('i-copy', 'small', document);
    assert.equal(icon.getAttribute('class'), 'icon small');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.querySelector('use')?.getAttribute('href'), '#i-copy');
    let clicks = 0;
    const button = iconButton({ icon: 'i-copy', label: 'Copy', className: 'copy', onClick: () => { clicks += 1; }, doc: document });
    assert.equal(button.className, 'icon-button copy');
    assert.equal(button.type, 'button');
    assert.equal(button.title, 'Copy');
    assert.equal(button.getAttribute('aria-label'), 'Copy');
    button.click();
    assert.equal(clicks, 1);
  });
});

describe('noticeCard', () => {
  it('a card: the icon, heading and buttons in a row, the line, then the actions; a warning unless it says otherwise', () => {
    const { document } = new JSDOM('<body></body>').window;
    const allow = make('button', '', 'Allow', document);
    const card = noticeCard({ icon: 'i-frame', tone: 'info', title: 'Frames from other sites', text: 'ads.example.net', actions: [allow], doc: document });
    assert.equal(card.className, 'sp-card sp-notice info');
    assert.deepEqual([...card.children].map((child) => child.className), ['sp-heading', 'sp-notice-text', 'sp-notice-actions']);
    assert.equal(card.querySelector('.sp-heading use')?.getAttribute('href'), '#i-frame');
    assert.equal(card.querySelector('h2')?.textContent, 'Frames from other sites');
    assert.equal(card.querySelector('.sp-notice-text')?.textContent, 'ads.example.net');
    assert.equal(card.querySelector('.sp-notice-actions')?.firstElementChild, allow);
    const show = make('button', 'icon-button', '', document);
    const warning = noticeCard({ icon: 'i-warning', title: 'Didn’t load', text: 'x', buttons: [show], doc: document });
    assert.equal(warning.className, 'sp-card sp-notice warning');
    assert.equal(warning.querySelector('.sp-heading')?.lastElementChild, show);
    assert.equal(warning.querySelector('.sp-notice-actions'), null);
  });
});

describe('counted', () => {
  it('the one message for one; the other with the number as the language writes it', () => {
    const t = (/** @type {string} */ key, /** @type {string | string[] | undefined} */ subs = []) => `${key}(${[subs].flat().join()})`;
    assert.equal(counted(1, 'one', 'many', { t, lang: 'en-GB' }), 'one()');
    assert.equal(counted(0, 'one', 'many', { t, lang: 'en-GB' }), 'many(0)');
    assert.equal(counted(1200, 'one', 'many', { t, lang: 'en-GB' }), 'many(1,200)');
    assert.equal(counted(1200, 'one', 'many', { t, lang: 'de' }), 'many(1.200)');
  });
});
