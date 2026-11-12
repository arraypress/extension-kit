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
 * dynamic-URL module's `import … from './part.js'` (checked in Chromium 156,
 * tests/chrome-chromium.test.js). So it suits a single-file (bundled) page
 * module, not one that imports its parts.
 *
 * @module scripting/call
 */
export type CallScripting = Pick<typeof chrome.scripting, 'executeScript'>;
export type FrameResult<T> = {
    /**
     * The frame (0 is the top one).
     */
    frameId: number;
    /**
     * The function's result, once its promise settled.
     */
    result: T;
};
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
export declare const importAndCall: (module: string, name: string, args: unknown[]) => Promise<unknown>;
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
export declare function callInPage<T = unknown>(scripting: CallScripting, target: chrome.scripting.InjectionTarget, module: string, name: string, args?: unknown[], { immediately }?: {
    immediately?: boolean;
}): Promise<FrameResult<T>[]>;
