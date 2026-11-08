/**
 * Helpers for end-to-end tests that load an unpacked extension into
 * Playwright's Chromium: launching it, waiting for a condition, emulating
 * the colour scheme inside the offscreen document (which Playwright doesn't
 * list as a page), and recording `chrome.action.setIcon` calls (Chrome has no
 * getter for an action's icon).
 *
 * @module testing/e2e
 */
import type { BrowserContext, BrowserType, CDPSession, Page, Worker } from 'playwright';
export type LaunchedExtension = {
    /**
     * The persistent context it's loaded in.
     */
    context: BrowserContext;
    /**
     * Its service worker.
     */
    worker: Worker;
    /**
     * Its id, the host of its pages.
     */
    extensionId: string;
    /**
     * `chrome-extension://<id>/<page>`.
     */
    url: (page?: string) => string;
    /**
     * Close the browser and delete its profile.
     */
    close: () => Promise<void>;
};
export type LaunchOptions = NonNullable<Parameters<BrowserType['launchPersistentContext']>[1]> & {
    prefix?: string;
};
/** @import { BrowserContext, BrowserType, CDPSession, Page, Worker } from 'playwright' */
/**
 * A launched extension.
 *
 * @typedef {object} LaunchedExtension
 * @property {BrowserContext} context The persistent context it's loaded in.
 * @property {Worker} worker Its service worker.
 * @property {string} extensionId Its id, the host of its pages.
 * @property {(page?: string) => string} url `chrome-extension://<id>/<page>`.
 * @property {() => Promise<void>} close Close the browser and delete its profile.
 */
/**
 * What `launchExtension` takes: Playwright's persistent-context options, a
 * name prefix for the temporary profile, and more Chromium switches.
 *
 * @typedef {NonNullable<Parameters<BrowserType['launchPersistentContext']>[1]> & {prefix?: string}} LaunchOptions
 */
/**
 * Poll `fn` until it returns something truthy.
 *
 * @template T
 * @param {() => T | Promise<T>} fn - The check.
 * @param {string} what - What's awaited, for the timeout's message.
 * @param {number} [timeout] - Give up after this many ms. Default 5000.
 * @returns {Promise<NonNullable<T>>} The first truthy value.
 * @throws {Error} "Timed out waiting for <what>".
 */
export declare function until<T>(fn: () => T | Promise<T>, what: string, timeout?: number): Promise<NonNullable<T>>;
/**
 * Load the unpacked extension at `dir` into a fresh profile and wait for its
 * service worker.
 *
 * @param {BrowserType} chromium - Playwright's `chromium`.
 * @param {string} dir - The unpacked extension.
 * @param {LaunchOptions} [options] - Playwright's context options (`locale`, `viewport`, …), plus
 *   `prefix` (the temporary profile's name prefix) and `args` (more Chromium switches).
 * @returns {Promise<LaunchedExtension>} The running extension.
 * @example
 * const { context, worker, url, close } = await launchExtension(chromium, 'extension');
 * const page = await context.newPage();
 * await page.goto(url('options/options.html'));
 */
export declare function launchExtension(chromium: BrowserType, dir: string, { prefix, args, ...options }?: LaunchOptions): Promise<LaunchedExtension>;
/**
 * Emulate colour schemes in the offscreen document: one CDP session attached
 * to it, reused for every change.
 *
 * @param {CDPSession} cdp - A browser-level session (`context.newCDPSession(page)`).
 * @param {string} [suffix] - How the document's address ends. Default `/offscreen/offscreen.html`.
 * @returns {Promise<(scheme: 'light' | 'dark') => Promise<unknown>>} Sets the document's scheme.
 * @throws {Error} When no such document is open.
 */
export declare function offscreenEmulator(cdp: CDPSession, suffix?: string): Promise<(scheme: 'light' | 'dark') => Promise<unknown>>;
/**
 * Wrap the worker's real `chrome.action.setIcon` so each call is recorded once
 * Chrome has taken it (a path Chrome can't load fails, and isn't recorded).
 *
 * @param {Worker} worker - The extension's service worker.
 * @returns {Promise<() => Promise<unknown[]>>} Reads the recorded `path`s, oldest first.
 */
export declare function recordIconCalls(worker: Worker): Promise<() => Promise<unknown[]>>;
export type CheckRunner = {
    /**
     * Run one check; resolves to whether it passed.
     */
    check: (name: string, fn: () => unknown) => Promise<boolean>;
    /**
     * Print the tally, and exit with 1 if anything failed.
     */
    finish: () => void;
};
/**
 * A runner for a script of named checks: each failure is reported and the
 * script goes on, so one run shows everything that's wrong.
 *
 * @typedef {object} CheckRunner
 * @property {(name: string, fn: () => unknown) => Promise<boolean>} check Run one check; resolves to whether it passed.
 * @property {() => void} finish Print the tally, and exit with 1 if anything failed.
 */
/**
 * Make a {@link CheckRunner}: "✓ name" for a pass, "✗ name" and the error's
 * message, indented, for a failure.
 *
 * @returns {CheckRunner} The runner.
 * @example
 * const { check, finish } = checkRunner();
 * await check('the menu opens', async () => { … });
 * finish();
 */
export declare function checkRunner(): CheckRunner;
export type SchemePage = {
    /**
     * From the extension's root, e.g. `options/options.html`.
     */
    path: string;
    /**
     * Resolves once the
     * page's script has run. Default: the load event.
     */
    ready?: (page: Page) => Promise<unknown>;
};
/**
 * A page of the extension that reports its colour scheme.
 *
 * @typedef {object} SchemePage
 * @property {string} path From the extension's root, e.g. `options/options.html`.
 * @property {(page: Page) => Promise<unknown>} [ready] Resolves once the
 *   page's script has run. Default: the load event.
 */
/**
 * The light/dark toolbar glyph, end to end, for an extension wired with
 * `startToolbarTheme`, `watchSchemeOffscreen` and `watchColorScheme`:
 *
 * 1. the worker keeps exactly one offscreen document open, for MATCH_MEDIA;
 * 2. each page shows the dark glyph when dark and the light one when light,
 *    a second page in an unchanged scheme sends nothing, and `toolbarDark`
 *    stays out of Chrome Sync;
 * 3. with no page open, the offscreen document alone follows a change.
 *
 * Throws (an assertion) at the first thing that's wrong; logs a ✔ line per step.
 *
 * @param {LaunchedExtension} launched - From {@link launchExtension}.
 * @param {readonly SchemePage[]} pages - The pages that report; the first is opened twice.
 * @param {{light: unknown, dark: unknown}} icons - `toolbarIcon(false)` and `toolbarIcon(true)`.
 * @returns {Promise<void>}
 */
export declare function checkToolbarTheme({ context, worker, url }: LaunchedExtension, pages: readonly SchemePage[], icons: {
    light: unknown;
    dark: unknown;
}): Promise<void>;
