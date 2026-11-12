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
     * The profile's folder (Chrome writes `DevToolsActivePort` there, for one).
     */
    profile: string;
    /**
     * Close the browser; from {@link launchExtension}, delete its profile too.
     */
    close: () => Promise<void>;
};
export type ExtensionProfile = {
    /**
     * The profile's folder.
     */
    dir: string;
    /**
     * Start the browser on it; its `close()` keeps the profile.
     */
    launch: () => Promise<LaunchedExtension>;
    /**
     * Delete the profile (close every launch first).
     */
    remove: () => Promise<void>;
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
 * @property {string} profile The profile's folder (Chrome writes `DevToolsActivePort` there, for one).
 * @property {() => Promise<void>} close Close the browser; from {@link launchExtension}, delete its profile too.
 */
/**
 * A profile that outlives one browser start, for checks that something
 * survives a restart (or that need a first start with a changed manifest).
 *
 * @typedef {object} ExtensionProfile
 * @property {string} dir The profile's folder.
 * @property {() => Promise<LaunchedExtension>} launch Start the browser on it; its `close()` keeps the profile.
 * @property {() => Promise<void>} remove Delete the profile (close every launch first).
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
 * @returns {Promise<Exclude<T, false | 0 | 0n | '' | null | undefined>>} The first truthy value
 *   (typed without the falsy ones, so `until(() => ready && text, …)` is a string).
 * @throws {Error} "Timed out waiting for <what>".
 */
export declare function until<T>(fn: () => T | Promise<T>, what: string, timeout?: number): Promise<Exclude<T, false | 0 | 0n | '' | null | undefined>>;
/**
 * A fresh profile for the unpacked extension at `dir`, to start the browser
 * on as often as a test needs: each start loads the extension and waits for
 * its service worker.
 *
 * @param {BrowserType} chromium - Playwright's `chromium`.
 * @param {string} dir - The unpacked extension.
 * @param {LaunchOptions} [options] - Playwright's context options (`locale`, `viewport`, …), plus
 *   `prefix` (the temporary profile's name prefix) and `args` (more Chromium switches).
 * @returns {Promise<ExtensionProfile>} The profile.
 * @example
 * const profile = await extensionProfile(chromium, 'extension');
 * const first = await profile.launch();
 * await first.worker.evaluate(() => chrome.storage.local.set({seen: true}));
 * await first.close();
 * const { worker, close } = await profile.launch(); // the same storage, read as on any day
 * await close();
 * await profile.remove();
 */
export declare function extensionProfile(chromium: BrowserType, dir: string, { prefix, args, ...options }?: LaunchOptions): Promise<ExtensionProfile>;
/**
 * Load the unpacked extension at `dir` into a fresh profile and wait for its
 * service worker.
 *
 * @param {BrowserType} chromium - Playwright's `chromium`.
 * @param {string} dir - The unpacked extension.
 * @param {LaunchOptions} [options] - Playwright's context options (`locale`, `viewport`, …), plus
 *   `prefix` (the temporary profile's name prefix) and `args` (more Chromium switches).
 * @returns {Promise<LaunchedExtension>} The running extension; `close()` deletes the profile too.
 * @example
 * const { context, worker, url, close } = await launchExtension(chromium, 'extension');
 * const page = await context.newPage();
 * await page.goto(url('options/options.html'));
 */
export declare function launchExtension(chromium: BrowserType, dir: string, options?: LaunchOptions): Promise<LaunchedExtension>;
/**
 * Stop the extension's service worker, as Chrome does after 30 seconds idle: its globals,
 * timers and anything else kept in memory are gone; storage, alarms and registered listeners
 * stay. Chrome never does this by itself in an e2e run (Playwright's debugger keeps the worker
 * alive), so a check that state survives a restart has to ask for it. Done through the
 * DevTools protocol from a page of the extension (`ServiceWorker.stopWorker`), and, unless
 * `start` is false, the worker is started again with no event (`ServiceWorker.startWorker`).
 *
 * `launched.worker` stays the handle to use: Playwright keeps it across the restart. Anything a
 * test put in the old worker (`recordIconCalls`, a patched `chrome.*` function) is gone with it.
 *
 * @param {Pick<LaunchedExtension, 'context' | 'worker' | 'extensionId' | 'url'>} launched - From {@link launchExtension}.
 * @param {{start?: boolean, page?: string}} [options] - `start: false` leaves the worker stopped, for
 *   the next event (a message, an alarm, a tab) to start it as on a person's computer; `page`: a file
 *   of the extension to open for the protocol session (default `manifest.json`).
 * @returns {Promise<void>} Once the worker has stopped (and, with `start`, is running again).
 * @throws {Error} When the worker isn't running, or doesn't stop or start in 10 s.
 *
 * @example
 * await worker.evaluate(() => { globalThis.cache = { tab: 7 }; });
 * await stopWorker(launched);
 * await worker.evaluate(() => globalThis.cache); // undefined: what wasn't stored is gone
 */
export declare function stopWorker({ context, worker, extensionId, url }: Pick<LaunchedExtension, 'context' | 'worker' | 'extensionId' | 'url'>, { start, page: file }?: {
    start?: boolean;
    page?: string;
}): Promise<void>;
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
 * Chrome has taken it (a path Chrome can't load fails, and isn't recorded):
 * its `path`, or `'imageData'` for an icon given as pixels. The record lives
 * in the worker: it's gone when the worker restarts ({@link stopWorker}).
 *
 * @param {Worker} worker - The extension's service worker.
 * @returns {Promise<() => Promise<unknown[]>>} Reads the recorded icons, oldest first.
 */
export declare function recordIconCalls(worker: Worker): Promise<() => Promise<unknown[]>>;
/** How long one check may take before it's failed, in ms: long enough for a slow real-browser check, short of a hang. */
export declare const CHECK_MS = 60000;
export type CheckRunner = {
    /**
     *   Run one check, failed if it takes longer than `timeout` (default the runner's); resolves to
     *   whether it passed.
     */
    check: (name: string, fn: () => unknown, options?: {
        timeout?: number;
    }) => Promise<boolean>;
    /**
     * Count a failure found outside any check (a page's
     * uncaught error, say): printed now, listed and counted at the end.
     */
    fail: (name: string) => void;
    /**
     * Print the tally, and exit with 1 if anything failed or no check ran at all
     * (a script that returned early, or whose filter matched nothing, hasn't passed).
     */
    finish: () => void;
};
/**
 * A runner for a script of named checks: each failure is reported and the
 * script goes on, so one run shows everything that's wrong.
 *
 * @typedef {object} CheckRunner
 * @property {(name: string, fn: () => unknown, options?: {timeout?: number}) => Promise<boolean>} check
 *   Run one check, failed if it takes longer than `timeout` (default the runner's); resolves to
 *   whether it passed.
 * @property {(name: string) => void} fail Count a failure found outside any check (a page's
 *   uncaught error, say): printed now, listed and counted at the end.
 * @property {() => void} finish Print the tally, and exit with 1 if anything failed or no check ran at all
 *   (a script that returned early, or whose filter matched nothing, hasn't passed).
 */
/**
 * Make a {@link CheckRunner}: "✓ name" for a pass, "✗ name" and the error's
 * message, indented, for a failure. A check that hangs (a page that never
 * answers) fails once its time is up, and the script goes on; what it was
 * doing isn't stopped, so `finish()` exits rather than wait for it.
 *
 * @param {{timeout?: number}} [options] - `timeout`: each check's limit in ms. Default {@link CHECK_MS}.
 * @returns {CheckRunner} The runner.
 * @example
 * const { check, fail, finish } = checkRunner();
 * page.on('pageerror', (error) => fail(`page error: ${error.message}`));
 * await check('the menu opens', async () => { … });
 * await check('a live site answers', async () => { … }, { timeout: 120_000 });
 * finish();
 */
export declare function checkRunner({ timeout: runnerTimeout }?: {
    timeout?: number;
}): CheckRunner;
/**
 * Run a script's checks: an error outside any check is a failure, the
 * clean-ups (closing browsers and servers) always run, in order, then the
 * tally prints (and exits 1 on a failure). From the copies in Better Prices,
 * Better Downloads, Better Saves and Clean Links (`test/e2e/helpers.mjs`).
 *
 * @param {CheckRunner} runner - From {@link checkRunner}.
 * @param {() => Promise<void>} body - The checks.
 * @param {readonly (() => Promise<unknown>)[]} cleanUps - Closing browsers and servers, in order.
 * @returns {Promise<void>}
 * @example
 * const runner = checkRunner();
 * await runChecks(runner, async () => { await runner.check('it hides', async () => { … }); }, [close, site.close]);
 */
export declare function runChecks(runner: CheckRunner, body: () => Promise<void>, cleanUps: readonly (() => Promise<unknown>)[]): Promise<void>;
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
