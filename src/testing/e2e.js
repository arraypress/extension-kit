/**
 * Helpers for end-to-end tests that load an unpacked extension into
 * Playwright's Chromium: launching it, waiting for a condition, emulating
 * the colour scheme inside the offscreen document (which Playwright doesn't
 * list as a page), and recording `chrome.action.setIcon` calls (Chrome has no
 * getter for an action's icon).
 *
 * @module testing/e2e
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deadline, within } from '../time/time.js';

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
export async function until(fn, what, timeout = 5000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return /** @type {Exclude<T, false | 0 | 0n | '' | null | undefined>} */ (value);
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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
export async function extensionProfile(chromium, dir, { prefix = 'extension-', args = [], ...options } = {}) {
  const tmp = await mkdtemp(path.join(tmpdir(), prefix));
  const profile = path.join(tmp, 'profile');
  return {
    dir: profile,
    async launch() {
      const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        ...options,
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, ...args],
      });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;
      return {
        context,
        worker,
        extensionId,
        profile,
        url: (page = '') => `chrome-extension://${extensionId}/${page}`,
        close: () => context.close(),
      };
    },
    remove: () => rm(tmp, { recursive: true, force: true }),
  };
}

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
export async function launchExtension(chromium, dir, options = {}) {
  const profile = await extensionProfile(chromium, dir, options);
  const launched = await profile.launch();
  return {
    ...launched,
    async close() {
      await launched.close();
      await profile.remove();
    },
  };
}

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
export async function stopWorker({ context, worker, extensionId, url }, { start = true, page: file = 'manifest.json' } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(url(file));
    const cdp = await context.newCDPSession(page);
    /** @type {Map<string, {versionId: string, scriptURL: string, runningStatus: string}>} */
    const versions = new Map();
    cdp.on('ServiceWorker.workerVersionUpdated', (event) => {
      for (const version of event.versions) versions.set(version.versionId, version);
    });
    await cdp.send('ServiceWorker.enable');
    const own = () => [...versions.values()].filter((version) => version.scriptURL === worker.url());
    const running = await until(() => own().find((version) => version.runningStatus === 'running'), 'the service worker to be running', 10_000);
    await cdp.send('ServiceWorker.stopWorker', { versionId: running.versionId });
    await until(() => own().every((version) => version.runningStatus === 'stopped'), 'the service worker to stop', 10_000);
    if (start) {
      await cdp.send('ServiceWorker.startWorker', { scopeURL: `chrome-extension://${extensionId}/` });
      await until(() => own().some((version) => version.runningStatus === 'running'), 'the service worker to start again', 10_000);
      // Running, and answering: its script has run again.
      await worker.evaluate(() => true);
    }
    await cdp.detach();
  } finally {
    await page.close();
  }
}

/**
 * Emulate colour schemes in the offscreen document: one CDP session attached
 * to it, reused for every change.
 *
 * @param {CDPSession} cdp - A browser-level session (`context.newCDPSession(page)`).
 * @param {string} [suffix] - How the document's address ends. Default `/offscreen/offscreen.html`.
 * @returns {Promise<(scheme: 'light' | 'dark') => Promise<unknown>>} Sets the document's scheme.
 * @throws {Error} When no such document is open.
 */
export async function offscreenEmulator(cdp, suffix = '/offscreen/offscreen.html') {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find((info) => info.url.endsWith(suffix));
  if (!target) throw new Error(`No offscreen document ending ${suffix} is open`);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let id = 0;
  return (scheme) => cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: ++id,
      method: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-color-scheme', value: scheme }] },
    }),
  });
}

/**
 * Wrap the worker's real `chrome.action.setIcon` so each call is recorded once
 * Chrome has taken it (a path Chrome can't load fails, and isn't recorded).
 *
 * @param {Worker} worker - The extension's service worker.
 * @returns {Promise<() => Promise<unknown[]>>} Reads the recorded `path`s, oldest first.
 */
export async function recordIconCalls(worker) {
  await worker.evaluate(() => {
    const calls = /** @type {unknown[]} */ ([]);
    Object.assign(globalThis, { iconCalls: calls });
    const real = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = /** @type {typeof chrome.action.setIcon} */ (async (/** @type {chrome.action.TabIconDetails} */ details) => {
      await real(details);
      calls.push(details.path);
    });
  });
  return () => worker.evaluate(() => /** @type {{iconCalls: unknown[]}} */ (/** @type {unknown} */ (globalThis)).iconCalls);
}

/** How long one check may take before it's failed, in ms: long enough for a slow real-browser check, short of a hang. */
export const CHECK_MS = 60_000;

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
 * @property {() => void} finish Print the tally, and exit with 1 if anything failed.
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
export function checkRunner({ timeout: runnerTimeout = CHECK_MS } = {}) {
  /** @type {string[]} */
  const failures = [];
  let passed = 0;
  return {
    async check(name, fn, { timeout = runnerTimeout } = {}) {
      try {
        await deadline(Promise.resolve().then(fn), timeout, (_, reject) => {
          reject(new Error(`Timed out after ${timeout / 1000} s`));
        });
        passed++;
        console.log(`  ✓ ${name}`);
        return true;
      } catch (error) {
        failures.push(name);
        console.log(`  ✗ ${name}\n    ${String(/** @type {Error} */ (error)?.message ?? error).split('\n').join('\n    ')}`);
        return false;
      }
    },
    fail(name) {
      failures.push(name);
      console.log(`  ✗ ${name}`);
    },
    finish() {
      console.log(`\n${passed} passed, ${failures.length} failed`);
      if (!failures.length) return;
      for (const failure of failures) console.log(`  - ${failure}`);
      process.exit(1);
    },
  };
}

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
export async function runChecks(runner, body, cleanUps) {
  try {
    await body();
  } catch (error) {
    runner.fail(`unexpected: ${error instanceof Error ? error.stack : error}`);
  } finally {
    for (const cleanUp of cleanUps) await within(Promise.resolve().then(cleanUp), 30_000, undefined);
  }
  runner.finish();
}

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
export async function checkToolbarTheme({ context, worker, url }, pages, icons) {
  /** @param {Page} page @param {SchemePage} entry */
  const open = async (page, entry) => {
    await page.goto(url(entry.path));
    await (entry.ready ? entry.ready(page) : page.waitForLoadState('load'));
  };

  // 1. The watcher. Right after creation Chrome can list the document before its address is set.
  assert.equal(await worker.evaluate(() => chrome.offscreen.Reason.MATCH_MEDIA), 'MATCH_MEDIA');
  const offscreen = await until(async () => {
    const found = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }));
    return found.length > 0 && found.every((info) => info.documentUrl?.endsWith('/offscreen/offscreen.html')) ? found : null;
  }, 'the offscreen document');
  assert.equal(offscreen.length, 1);
  assert.equal(offscreen[0].documentUrl, url('offscreen/offscreen.html'));
  console.log('✔ the background keeps one offscreen document open, for MATCH_MEDIA');

  const calls = await recordIconCalls(worker);
  const stored = () => worker.evaluate(async () => (await chrome.storage.local.get('toolbarDark')).toolbarDark);
  const last = async () => JSON.stringify((await calls()).at(-1));
  /** @param {unknown} icon @param {string} what */
  const untilIcon = (icon, what) => until(async () => (await last()) === JSON.stringify(icon), what);

  // The offscreen document follows this machine's real scheme: take it to dark, then light, so
  // every step below starts from a known state (stored light, the document last saw light).
  const blank = await context.newPage();
  const cdp = await context.newCDPSession(blank);
  const emulateOffscreen = await offscreenEmulator(cdp);
  await emulateOffscreen('dark');
  await until(async () => (await stored()) === true, 'the offscreen document to report dark');
  await emulateOffscreen('light');
  await until(async () => (await stored()) === false, 'the offscreen document to report light');

  // 2. Each page, dark then light; a second page in the same scheme sends nothing.
  for (const entry of pages) {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, entry);
    await page.emulateMedia({ colorScheme: 'dark' });
    await until(async () => (await stored()) === true, `${entry.path}: the dark scheme stored`);
    await untilIcon(icons.dark, `${entry.path}: the dark glyph`);
    await page.emulateMedia({ colorScheme: 'light' });
    await until(async () => (await stored()) === false, `${entry.path}: the light scheme stored`);
    await untilIcon(icons.light, `${entry.path}: the light glyph`);
    await page.close();
  }
  const before = (await calls()).length;
  const again = await context.newPage();
  await again.emulateMedia({ colorScheme: 'light' });
  await open(again, pages[0]);
  await again.waitForTimeout(300);
  assert.equal((await calls()).length, before);
  await again.close();
  assert.equal('toolbarDark' in await worker.evaluate(() => chrome.storage.sync.get(null)), false);
  console.log('✔ a dark page shows the dark glyph, light the light one, a second light page nothing; toolbarDark stays in local');

  // 3. No page open: the offscreen document alone follows a change.
  for (const page of context.pages()) if (page.url().startsWith('chrome-extension://')) await page.close();
  await emulateOffscreen('dark');
  await untilIcon(icons.dark, 'the dark glyph from the offscreen document');
  await emulateOffscreen('light');
  await untilIcon(icons.light, 'the light glyph from the offscreen document');
  await cdp.detach();
  await blank.close();
  console.log('✔ with no page open, the offscreen document swaps the glyph on a scheme change');
}
