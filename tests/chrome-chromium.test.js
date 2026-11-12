/**
 * What only Chrome can say, asked of a real extension in Playwright's Chromium: the kit's own
 * modules loaded in an unpacked extension's service worker and called there against the real
 * `chrome.scripting`. A site typed as a match pattern still registers (and the pattern it used
 * to make is one Chrome refuses, with the whole registration); a page module listed with
 * `use_dynamic_url` is still imported by `callInPage`, and the page can no longer load it to
 * tell the extension is there.
 *
 * @module tests/chrome-chromium
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchExtension, serve } from '../src/testing/index.js';

/** @import { LaunchedExtension, TestServer } from '../src/testing/index.js' */

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The extension: the kit under `kit/`, its worker with the kit on `self`, two page modules. */
const MANIFEST = {
  manifest_version: 3,
  name: 'Kit in Chrome',
  version: '1.0',
  permissions: ['scripting'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'worker.js', type: 'module' },
  web_accessible_resources: [
    { resources: ['content/hidden.js'], matches: ['<all_urls>'], use_dynamic_url: true },
    { resources: ['content/plain.js'], matches: ['<all_urls>'] },
  ],
};

/**
 * What the worker puts on `self`.
 *
 * @typedef {typeof globalThis & {kit: typeof import('../src/index.js')}} WorkerGlobals
 */

describe('the kit in a real extension', () => {
  /** @type {string} */
  let dir;
  /** @type {LaunchedExtension} */
  let extension;
  /** @type {TestServer} */
  let site;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'extension-kit-chrome-'));
    await cp(path.join(ROOT, 'src'), path.join(dir, 'kit'), { recursive: true, filter: (from) => !/\/(testing|build)(\/|$)/.test(from.slice(ROOT.length)) });
    await cp(path.join(ROOT, 'tests/fixtures/page-module.js'), path.join(dir, 'content/hidden.js'));
    await cp(path.join(ROOT, 'tests/fixtures/page-module.js'), path.join(dir, 'content/plain.js'));
    await writeFile(path.join(dir, 'content/script.js'), '');
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(MANIFEST));
    await writeFile(path.join(dir, 'worker.js'), "import * as kit from './kit/index.js';\nself.kit = kit;\n");
    site = await serve(() => '<!doctype html><title>A site</title><p>Hello</p>');
    extension = await launchExtension(chromium, dir);
  });
  after(async () => {
    await extension?.close();
    await site?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('a site typed as “*.example.com” registers; the pattern it used to make, Chrome refuses whole', async () => {
    const outcome = await extension.worker.evaluate(async () => {
      const { contentScriptSync, hostPatterns, siteHost } = /** @type {WorkerGlobals} */ (/** @type {unknown} */ (self)).kit;
      /** @param {string[]} excludeMatches */
      const register = (excludeMatches) => contentScriptSync(chrome.scripting, 'never', async () => ({ js: ['content/script.js'], matches: ['<all_urls>'], excludeMatches }))()
        .then(() => 'registered', (/** @type {Error} */ error) => error.message);
      const refused = await register(hostPatterns('*.example.com'));
      const leftAfterRefusal = (await chrome.scripting.getRegisteredContentScripts()).length;
      const typed = ['*.example.com', 'news.example.org'].map(siteHost).filter((host) => host !== null);
      const accepted = await register(typed.flatMap(hostPatterns));
      const [script] = await chrome.scripting.getRegisteredContentScripts();
      return { refused, leftAfterRefusal, accepted, excludes: script?.excludeMatches };
    });
    assert.match(outcome.refused, /Invalid host wildcard/);
    assert.equal(outcome.leftAfterRefusal, 0); // Nothing registered at all: the extension would run nowhere.
    assert.equal(outcome.accepted, 'registered');
    assert.deepEqual(outcome.excludes?.toSorted(), ['*://*.example.com/*', '*://*.news.example.org/*', '*://example.com/*', '*://news.example.org/*']);
  });

  it('callInPage imports a module listed with use_dynamic_url, which the page itself can’t load', async () => {
    const page = await extension.context.newPage();
    await page.goto(site.origin);
    const called = await extension.worker.evaluate(async (origin) => {
      const { callInPage } = /** @type {WorkerGlobals} */ (/** @type {unknown} */ (self)).kit;
      const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
      const target = { tabId: /** @type {number} */ (tab.id) };
      const [hidden] = await callInPage(chrome.scripting, target, 'content/hidden.js', 'echo', ['a']);
      const [again] = await callInPage(chrome.scripting, target, 'content/hidden.js', 'echo', ['b']);
      return { hidden: hidden.result, again: again.result };
    }, site.origin);
    assert.deepEqual(called.hidden, { echo: ['a'], calls: 1 });
    assert.deepEqual(called.again, { echo: ['b'], calls: 2 }); // The same module instance: its state is kept.

    /** @param {string} file */
    const fromPage = (file) => page.evaluate((url) => import(url).then(() => 'loaded', () => 'refused'), extension.url(file));
    assert.equal(await fromPage('content/plain.js'), 'loaded'); // A page can tell the extension is installed.
    assert.equal(await fromPage('content/hidden.js'), 'refused');
    assert.equal(await page.evaluate((url) => fetch(url).then(() => 'loaded', () => 'refused'), extension.url('content/hidden.js')), 'refused');
  });
});
