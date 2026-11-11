/**
 * Calling one of an extension module's functions in a page: `executeScript`
 * runs a small function in the page's isolated world that imports the module
 * (by its extension address, so it must be listed in `web_accessible_resources`)
 * and calls the export named, with arguments that survive structured cloning.
 * The module, and anything it keeps, stays loaded in that world between calls,
 * so a content script can hold a session (a picker, an inspector) across them.
 *
 * @module scripting/call
 */

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
 * @property {T} result The function's result, once its promise settled.
 */

/**
 * The function `executeScript` runs in the page: alone, without closures.
 *
 * @param {string} module - The module's path in the extension, `content/main.js`.
 * @param {string} name - The export to call.
 * @param {unknown[]} args - Its arguments.
 * @returns {Promise<unknown>} What it returns.
 */
export const importAndCall = (module, name, args) => import(chrome.runtime.getURL(module)).then((loaded) => loaded[name](...args));

/**
 * Call `name` from the extension module `module` in the target's frames.
 *
 * @template [T=unknown]
 * @param {CallScripting} scripting - `chrome.scripting` (or a fake in tests).
 * @param {chrome.scripting.InjectionTarget} target - The tab, and which frames (`allFrames`, `frameIds`).
 * @param {string} module - The module's path in the extension (listed in `web_accessible_resources`).
 * @param {string} name - The exported function.
 * @param {unknown[]} [args] - Its arguments (structured-cloneable).
 * @param {{immediately?: boolean}} [options] - `immediately` (default true): don't wait for the
 *   page to be idle, which a page still loading ads or a player may not be for a long time.
 * @returns {Promise<FrameResult<T>[]>} Each frame's result, frames Chrome couldn't run in left out;
 *   rejects when it can run in none (a page Chrome keeps to itself, no access).
 * @example
 * const [{ result }] = await callInPage(chrome.scripting, { tabId }, 'content/main.js', 'scan', [options]);
 * await callInPage(chrome.scripting, { tabId, allFrames: true }, 'content/main.js', 'highlight', [key]);
 */
export async function callInPage(scripting, target, module, name, args = [], { immediately = true } = {}) {
  const frames = await scripting.executeScript({ target, injectImmediately: immediately, func: importAndCall, args: [module, name, args] });
  return frames.map((frame) => ({ frameId: frame.frameId, result: /** @type {T} */ (frame.result) }));
}
