/**
 * Calling one of an extension module's functions in a page: `executeScript`
 * runs a small function in the page's isolated world that imports the module
 * (by its extension address, so it must be listed in `web_accessible_resources`)
 * and calls the export named, with arguments that survive structured cloning.
 * The module, and anything it keeps, stays loaded in that world between calls,
 * so a content script can hold a session (a picker, an inspector) across them.
 *
 * `"use_dynamic_url": true` on those resources would keep a page from loading
 * them to tell the extension is installed, and this import still works with
 * it, but only for a module with no static imports: Chrome refuses a
 * dynamic-URL module's own static import of a sibling module (checked in Chromium 156,
 * tests/chrome-chromium.test.js). So it suits a single-file (bundled) page
 * module, not one that imports its parts.
 *
 * @module scripting/call
 */

import { deadline } from '../time/time.js';

/**
 * The parts of `chrome.scripting` a call uses.
 *
 * @typedef {Pick<typeof chrome.scripting, 'executeScript'>} CallScripting
 */

/**
 * What one frame's call gave back.
 *
 * @template T
 * @typedef {object} FrameResult
 * @property {number} frameId The frame (0 is the top one).
 * @property {T} result The function's result, once its promise settled (null when it failed).
 * @property {string} [error] Why it failed there: the module didn't load, or the function threw.
 */

/** The key of what {@link importAndCall} answers with when the call failed: Chrome itself gives a bare null for a function that throws. */
export const CALL_FAILED = 'extension-kit:call-failed';

/**
 * The function `executeScript` runs in the page: alone, without closures.
 *
 * @param {string} module - The module's path in the extension, `content/main.js`.
 * @param {string} name - The export to call.
 * @param {unknown[]} args - Its arguments.
 * @returns {Promise<unknown>} What it returns, or `{'extension-kit:call-failed': message}` when the
 *   module didn't load or the function threw (`executeScript` would give null, and no reason).
 */
export const importAndCall = (module, name, args) => import(chrome.runtime.getURL(module)).then((loaded) => loaded[name](...args))
  .catch((error) => ({ 'extension-kit:call-failed': String(error?.message ?? error) }));

/**
 * Call `name` from the extension module `module` in the target's frames.
 *
 * @template [T=unknown]
 * @param {CallScripting} scripting - `chrome.scripting` (or a fake in tests).
 * @param {chrome.scripting.InjectionTarget} target - The tab, and which frames (`allFrames`, `frameIds`).
 * @param {string} module - The module's path in the extension (listed in `web_accessible_resources`).
 * @param {string} name - The exported function.
 * @param {unknown[]} [args] - Its arguments, and its result: JSON-serialisable (Chrome carries them
 *   as JSON, so a Map, a Set or a Date doesn't survive).
 * @param {{immediately?: boolean, timeoutMs?: number}} [options] - `immediately` (default true): don't
 *   wait for the page to be idle, which a page still loading ads or a player may not be for a long
 *   time. `timeoutMs`: the longest to wait for every frame (Chrome answers only once all have, so one
 *   frame that never does keeps the rest waiting); default none.
 * @returns {Promise<FrameResult<T>[]>} Each frame's result, frames Chrome couldn't run in left out; a
 *   frame where the call failed has `result: null` and its `error`. Rejects when it can run in none
 *   (a page Chrome keeps to itself, no access), and with a `TimeoutError` when `timeoutMs` passes.
 * @example
 * const [{ result }] = await callInPage(chrome.scripting, { tabId }, 'content/main.js', 'scan', [options]);
 * await callInPage(chrome.scripting, { tabId, allFrames: true }, 'content/main.js', 'highlight', [key]);
 */
export async function callInPage(scripting, target, module, name, args = [], { immediately = true, timeoutMs } = {}) {
  const running = scripting.executeScript({ target, injectImmediately: immediately, func: importAndCall, args: [module, name, args] });
  const frames = await (timeoutMs === undefined ? running
    : deadline(running, timeoutMs, (_, reject) => reject(new DOMException(`${module} ${name}: no answer in ${timeoutMs} ms`, 'TimeoutError'))));
  return frames.map(({ frameId, result }) => {
    const failed = result && typeof result === 'object' ? /** @type {Record<string, unknown>} */ (result)[CALL_FAILED] : undefined;
    return typeof failed === 'string' ? { frameId, result: /** @type {T} */ (null), error: failed } : { frameId, result: /** @type {T} */ (result) };
  });
}
