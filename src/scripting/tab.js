/**
 * Reading a tab: one of the extension's page modules called in every frame
 * Chrome lets it run in, the frames' answers top first; or why it can't be
 * read: a page Chrome keeps to itself (its own pages, the Web Store, other
 * extensions'), no access (the tab went to another site since the click
 * that gave activeTab), the module failed in every frame, or no answer in
 * time.
 *
 * @module scripting/tab
 */

import { callInPage } from './call.js';

/** @import { FrameResult } from './call.js' */

/** Addresses Chrome keeps from every extension. */
const BROWSER_PAGE = /^(?:chrome|chrome-extension|chrome-untrusted|devtools|edge|about|view-source):|^https:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//;

/** Chrome's refusals for its own pages, when the page's address isn't known (no access to the tab). */
const BROWSER_REFUSAL = /Cannot access a (?:chrome|chrome-extension|chrome-untrusted|devtools|edge):\/\/ URL|extensions gallery cannot be scripted/i;

/**
 * Whether Chrome keeps a page from extensions.
 *
 * @param {string} url - The page's address.
 * @returns {boolean} It does.
 * @example
 * isBrowserPage('chrome://settings'); // true
 * isBrowserPage('https://chromewebstore.google.com/detail/x'); // true
 */
export const isBrowserPage = (url) => BROWSER_PAGE.test(url);

/**
 * What reading a tab gave.
 *
 * @template T
 * @typedef {{state: 'read', frames: FrameResult<T>[]} | {state: 'browser'} | {state: 'no-access'} | {state: 'failed', error: string} | {state: 'timeout'}} TabReading
 *   `frames`: each frame that answered (not null), the top one first, then in Chrome's frame order.
 *   `failed`: no frame answered and the call threw in at least one (`error`: the first one's reason),
 *   which Chrome itself reports as a bare null; `timeout`: `timeoutMs` passed first.
 */

/**
 * The Chrome APIs a reading uses (fakes in unit tests).
 *
 * @typedef {object} TabEdges
 * @property {Pick<typeof chrome.tabs, 'get'>} tabs `chrome.tabs`.
 * @property {Pick<typeof chrome.scripting, 'executeScript'>} scripting `chrome.scripting`.
 */

/**
 * Call a page module's export in every frame of a tab, or say why it can't be.
 *
 * @template [T=unknown]
 * @param {TabEdges} edges - Chrome's tabs and scripting.
 * @param {number} tabId - The tab.
 * @param {string} module - The module (in `web_accessible_resources`).
 * @param {string} name - The export.
 * @param {unknown[]} [args] - Its arguments.
 * @param {{timeoutMs?: number}} [options] - `timeoutMs`: the longest to wait (Chrome answers once every
 *   frame has, so one that never does would keep a panel waiting for ever); default none.
 * @returns {Promise<TabReading<T>>} The frames' answers, or why there are none.
 * @example
 * const reading = await callInTab(chrome, tabId, 'content/main.js', 'scan');
 * if (reading.state === 'read') show(reading.frames);
 * else showMessage(reading.state); // 'browser', 'no-access', 'failed' or 'timeout'
 */
export async function callInTab(edges, tabId, module, name, args = [], { timeoutMs } = {}) {
  let url;
  try {
    url = (await edges.tabs.get(tabId)).url;
  } catch {
    return { state: 'no-access' };
  }
  if (url && isBrowserPage(url)) return { state: 'browser' };
  /** @type {FrameResult<T>[]} */
  let frames;
  try {
    frames = await callInPage(edges.scripting, { tabId, allFrames: true }, module, name, args, { timeoutMs });
  } catch (error) {
    if (/** @type {Error} */ (error)?.name === 'TimeoutError') return { state: 'timeout' };
    // Chrome's own page (said in its refusal), or no access: the tab went to another site since the click.
    return { state: BROWSER_REFUSAL.test(String(/** @type {Error} */ (error)?.message)) ? 'browser' : 'no-access' };
  }
  const read = frames.filter((frame) => frame.result !== null && frame.result !== undefined).sort((a, b) => a.frameId - b.frameId);
  if (read.length) return { state: 'read', frames: read };
  const failed = frames.toSorted((a, b) => a.frameId - b.frameId).find((frame) => frame.error !== undefined);
  return failed ? { state: 'failed', error: /** @type {string} */ (failed.error) } : { state: 'no-access' };
}
