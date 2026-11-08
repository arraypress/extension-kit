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
 * Poll `fn` until it returns something truthy.
 *
 * @template T
 * @param {() => T | Promise<T>} fn - The check.
 * @param {string} what - What's awaited, for the timeout's message.
 * @param {number} [timeout] - Give up after this many ms. Default 5000.
 * @returns {Promise<NonNullable<T>>} The first truthy value.
 * @throws {Error} "Timed out waiting for <what>".
 */
export async function until(fn, what, timeout = 5000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return /** @type {NonNullable<T>} */ (value);
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Load the unpacked extension at `dir` into a fresh profile and wait for its
 * service worker.
 *
 * @param {BrowserType} chromium - Playwright's `chromium`.
 * @param {string} dir - The unpacked extension.
 * @param {object} [options] - Context options (`locale`, `viewport`, …) plus:
 * @param {string} [options.prefix] - The temporary profile's name prefix.
 * @param {string[]} [options.args] - More Chromium switches.
 * @returns {Promise<LaunchedExtension>} The running extension.
 * @example
 * const { context, worker, url, close } = await launchExtension(chromium, 'extension');
 * const page = await context.newPage();
 * await page.goto(url('options/options.html'));
 */
export async function launchExtension(chromium, dir, { prefix = 'extension-', args = [], ...options } = {}) {
  const tmp = await mkdtemp(path.join(tmpdir(), prefix));
  const context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
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
    url: (page = '') => `chrome-extension://${extensionId}/${page}`,
    async close() {
      await context.close();
      await rm(tmp, { recursive: true, force: true });
    },
  };
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
export function checkRunner() {
  /** @type {string[]} */
  const failures = [];
  let passed = 0;
  return {
    async check(name, fn) {
      try {
        await fn();
        passed++;
        console.log(`  ✓ ${name}`);
        return true;
      } catch (error) {
        failures.push(name);
        console.log(`  ✗ ${name}\n    ${String(/** @type {Error} */ (error)?.message ?? error).split('\n').join('\n    ')}`);
        return false;
      }
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
