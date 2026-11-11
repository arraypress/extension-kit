/**
 * The test helpers that read Chrome itself, against Playwright's Chromium:
 * install warnings from a loaded extension's worker, and the saved tab groups
 * a real profile keeps after the browser closes.
 *
 * @module tests/testing-chromium
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  extensionProfile, filesIn, installWarnings, launchDownloading, launchExtension, savedTabGroups, serve, until, warningsAddedBy,
  withoutPermissions,
} from '../src/testing/index.js';

/**
 * Run `fn` with an unpacked extension (a manifest and an empty worker) in a temporary folder.
 *
 * @param {Record<string, unknown>} manifest - Its manifest, less the name, version and worker.
 * @param {(dir: string) => Promise<void>} fn - The test.
 */
async function withExtension(manifest, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'extension-kit-ext-'));
  try {
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'Kit test', version: '1.0', background: { service_worker: 'worker.js' }, ...manifest,
    }));
    await writeFile(path.join(dir, 'worker.js'), '');
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('install warnings', () => {
  it('withoutPermissions drops names from every permission list, leaving the manifest as it was', () => {
    const manifest = { name: 'x', permissions: ['tabs', 'alarms'], optional_permissions: ['alarms'], host_permissions: ['https://*/*'] };
    assert.deepEqual(withoutPermissions(manifest, ['alarms', 'https://*/*']), {
      name: 'x', permissions: ['tabs'], optional_permissions: [], host_permissions: [],
    });
    assert.deepEqual(manifest.permissions, ['tabs', 'alarms']);
  });

  it('reads Chrome’s own warnings, and which a permission adds', () => withExtension({}, async (dir) => {
    const { worker, close } = await launchExtension(chromium, dir);
    try {
      const manifest = { manifest_version: 3, name: 'Asked about', version: '1.0', permissions: ['tabs', 'alarms', 'storage'] };
      assert.deepEqual(await installWarnings(worker, manifest), ['Read your browsing history']);
      assert.deepEqual(await warningsAddedBy(worker, manifest, ['alarms', 'storage']), {
        warnings: ['Read your browsing history'], without: ['Read your browsing history'], added: [],
      });
      assert.deepEqual((await warningsAddedBy(worker, manifest, ['tabs'])).added, ['Read your browsing history']);
    } finally {
      await close();
    }
  }));
});

describe('saved tab groups', () => {
  it('reads the groups Chrome saved in a closed profile: title, pinned, tabs in order', () => withExtension({ permissions: ['tabGroups'] }, async (dir) => {
    const profile = await extensionProfile(chromium, dir);
    try {
      assert.deepEqual(await savedTabGroups(profile.dir), [], 'no store yet: no groups');
      const { worker, close } = await profile.launch();
      await worker.evaluate(async () => {
        const windowId = (await chrome.windows.create({ url: ['about:blank#one', 'about:blank#two'] }))?.id;
        const [first, ...rest] = (await chrome.tabs.query({ windowId })).flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
        const groupId = await chrome.tabs.group({ tabIds: [first, ...rest] });
        await chrome.tabGroups.update(groupId, { title: 'Research' });
      });
      // Chrome saves a group a moment after it's made: wait until the log has it (a half-written record reads as not yet).
      const saved = async () => (await savedTabGroups(profile.dir).catch(() => [])).some((group) => group.urls.length === 2);
      await until(saved, 'Chrome to save the group');
      await close();
      assert.deepEqual((await savedTabGroups(profile.dir)).filter((group) => group.title === 'Research'), [
        { title: 'Research', pinned: true, urls: ['about:blank#one', 'about:blank#two'] },
      ]);
    } finally {
      await profile.remove();
    }
  }));
});

describe('a browser that downloads for real', () => {
  it('chrome.downloads.download lands in the profile’s Downloads folder under the name given, in its folder', async () => {
    const site = await serve({ '/a.txt': { body: 'hello', type: 'text/plain' } });
    try {
      await withExtension({ permissions: ['downloads'] }, async (dir) => {
        const { worker, downloads, close } = await launchDownloading(chromium, dir, { prefix: 'extension-kit-dl-' });
        try {
          assert.deepEqual(await filesIn(downloads), []);
          await worker.evaluate((url) => chrome.downloads.download({ url, filename: 'Folder/Named.txt' }), `${site.origin}/a.txt`);
          const files = await until(async () => (await filesIn(downloads)).length && filesIn(downloads), 'the download');
          assert.deepEqual(files, [path.join('Folder', 'Named.txt')]);
        } finally {
          await close();
        }
      });
    } finally {
      await site.close();
    }
  });
});

describe('playPermissionPrompt (Chromium)', () => {
  it('records each request (and that a click was behind it), and answers in order, the last kept', async () => {
    const { playPermissionPrompt } = await import('../src/testing/index.js');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="b">Ask</button>');
      // A page has no chrome.permissions: stand one in, as an extension page has.
      await page.evaluate(() => { Object.assign(window, { chrome: { permissions: { request: async () => { throw new Error('real prompt'); } } } }); });
      await page.evaluate(playPermissionPrompt, [true, false]);
      await page.evaluate(() => document.getElementById('b')?.addEventListener('click', () => {
        const w = /** @type {any} */ (window);
        w.answers = w.answers ?? [];
        chrome.permissions.request({ permissions: ['downloads'] }).then((answer) => w.answers.push(answer));
      }));
      await page.click('#b');
      const third = await page.evaluate(() => chrome.permissions.request({ origins: ['https://example.com/*'] }));
      await page.click('#b');
      await page.waitForFunction(() => /** @type {any} */ (window).answers?.length === 2);
      assert.deepEqual(await page.evaluate(() => /** @type {any} */ (window).answers), [true, false]);
      assert.equal(third, false);
      assert.deepEqual(await page.evaluate(() => /** @type {any} */ (window).asked), [
        { permissions: ['downloads'], origins: undefined, gesture: true },
        { permissions: undefined, origins: ['https://example.com/*'], gesture: true },
        { permissions: ['downloads'], origins: undefined, gesture: true },
      ]);
    } finally {
      await browser.close();
    }
  });
});
