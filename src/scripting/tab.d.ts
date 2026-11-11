/**
 * Reading a tab: one of the extension's page modules called in every frame
 * Chrome lets it run in, the frames' answers top first; or why it can't be
 * read: a page Chrome keeps to itself (its own pages, the Web Store, other
 * extensions'), or no access (the tab went to another site since the click
 * that gave activeTab).
 *
 * @module scripting/tab
 */
import type { FrameResult } from './call.js';
/**
 * Whether Chrome keeps a page from extensions.
 *
 * @param {string} url - The page's address.
 * @returns {boolean} It does.
 * @example
 * isBrowserPage('chrome://settings'); // true
 * isBrowserPage('https://chromewebstore.google.com/detail/x'); // true
 */
export declare const isBrowserPage: (url: string) => boolean;
export type TabReading<T> = {
    state: 'read';
    frames: FrameResult<T>[];
} | {
    state: 'browser';
} | {
    state: 'no-access';
};
export type TabEdges = {
    /**
     * `chrome.tabs`.
     */
    tabs: Pick<typeof chrome.tabs, 'get'>;
    /**
     * `chrome.scripting`.
     */
    scripting: Pick<typeof chrome.scripting, 'executeScript'>;
};
/**
 * What reading a tab gave.
 *
 * @template T
 * @typedef {{state: 'read', frames: FrameResult<T>[]} | {state: 'browser'} | {state: 'no-access'}} TabReading
 *   `frames`: each frame that answered (not null), the top one first, then in Chrome's frame order.
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
 * @returns {Promise<TabReading<T>>} The frames' answers, or why there are none.
 * @example
 * const reading = await callInTab(chrome, tabId, 'content/main.js', 'scan');
 * if (reading.state === 'read') show(reading.frames);
 * else showMessage(reading.state); // 'browser' or 'no-access'
 */
export declare function callInTab<T = unknown>(edges: TabEdges, tabId: number, module: string, name: string, args?: unknown[]): Promise<TabReading<T>>;
