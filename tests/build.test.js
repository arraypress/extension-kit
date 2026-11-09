import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { githubAboutLinks, isPlaceholder } from '../src/index.js';
import {
  RUNTIME_ENTRIES, STYLESHEET, clonesFromReport, disallowedClones, placeholderWarning, printReleaseChecks,
  repositoryReminder, shipsFile, toolbarIconFile, vendorKit,
} from '../src/build/index.js';
import { filesUnder, missingReferences, referencedPath, zipEntries } from '../src/testing/index.js';

/**
 * Run `fn` with a fresh temporary folder, removed afterwards.
 *
 * @param {(dir: string) => Promise<void>} fn
 */
async function inTemp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'extension-kit-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write `files` (path → contents) under `dir`.
 *
 * @param {string} dir
 * @param {Record<string, string>} files
 */
async function writeTree(dir, files) {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
}

const REPO = 'https://github.com/arraypress/example-extension';

describe('About links', () => {
  it('point into the GitHub repository: README, Issues, PRIVACY.md', () => {
    assert.deepEqual(githubAboutLinks(REPO), {
      help: `${REPO}#readme`,
      reportIssue: `${REPO}/issues`,
      privacyPolicy: `${REPO}/blob/main/PRIVACY.md`,
    });
  });

  it('example.com (and its subdomains) is a placeholder; a real domain or mailto isn’t', () => {
    assert.equal(isPlaceholder('https://example.com/x'), true);
    assert.equal(isPlaceholder('https://www.example.org/x'), true);
    assert.equal(isPlaceholder('https://packs.example.net/'), true);
    assert.equal(isPlaceholder('https://notexample.com/'), false);
    assert.equal(isPlaceholder('mailto:help@arraypress.com'), false);
    assert.throws(() => isPlaceholder('not a url'), TypeError);
  });

  it('the package warning names each placeholder, and is gone once every link is real', () => {
    const warning = placeholderWarning({ help: 'https://example.com/help', reportIssue: `${REPO}/issues` });
    assert.match(String(warning), /WARNING: the About card still has placeholder links/);
    assert.match(String(warning), /help: https:\/\/example\.com\/help/);
    assert.doesNotMatch(String(warning), /reportIssue/);
    assert.equal(placeholderWarning(githubAboutLinks(REPO)), null);
  });

  it('links in the repository remind you to make it public', () => {
    assert.match(String(repositoryReminder(githubAboutLinks(REPO), REPO)), /Make the repository public before submitting/);
    assert.equal(repositoryReminder({ help: 'https://plainly.tools/help' }, REPO), null);
  });

  it('printReleaseChecks puts the warning on stderr and the reminder on stdout', () => {
    const warn = mock.method(console, 'warn', () => {});
    const log = mock.method(console, 'log', () => {});
    printReleaseChecks({ help: 'https://example.com/help', reportIssue: `${REPO}/issues` }, REPO);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(log.mock.callCount(), 1);
    mock.restoreAll();
  });
});

describe('vendoring', () => {
  it('copies the browser half and the stylesheet, replacing an older copy', () => inTemp(async (dir) => {
    const dest = path.join(dir, 'vendor', 'extension-kit');
    await writeTree(dest, { 'stale.js': 'old' });
    await vendorKit(dest);
    const files = await filesUnder(dest);
    assert.ok(!files.includes('stale.js'));
    assert.ok(files.includes('index.js') && files.includes('styles/chrome-ui.css') && files.includes('toolbar/theme.js'));
    assert.ok(!files.some((file) => file.startsWith('build/') || file.startsWith('testing/')), 'no Node-only code');
    assert.deepEqual(new Set(files.map((file) => file.split('/')[0])), new Set(RUNTIME_ENTRIES));
    assert.equal(await readFile(path.join(dest, 'styles', 'chrome-ui.css'), 'utf8'), await readFile(STYLESHEET, 'utf8'));
  }));

  it('the vendored copy resolves every import it makes', () => inTemp(async (dir) => {
    await vendorKit(path.join(dir, 'vendor'));
    await writeFile(path.join(dir, 'manifest.json'), '{}');
    assert.deepEqual(await missingReferences(dir), []);
  }));
});

describe('packaging', () => {
  it('the zip is the folder less SVG sources, declarations and .DS_Store, with no folder entries', () => inTemp(async (dir) => {
    await writeTree(dir, {
      'manifest.json': '{}', 'icons/icon-16.png': 'png', 'icons/toolbar/glyph.svg': '<svg/>',
      'vendor/kit/index.js': '', 'vendor/kit/index.d.ts': '', '.DS_Store': 'x', 'options/.DS_Store': 'x',
    });
    const entries = await zipEntries(dir);
    assert.deepEqual(entries, (await filesUnder(dir)).filter(shipsFile));
    assert.deepEqual(entries, ['icons/icon-16.png', 'manifest.json', 'vendor/kit/index.js']);
  }));

  it('missingReferences finds broken imports, links, getURL paths and manifest entries', () => inTemp(async (dir) => {
    await writeTree(dir, {
      'manifest.json': JSON.stringify({ background: { service_worker: 'background.js' }, icons: { 16: 'icons/gone.png' } }),
      'background.js': "import { a } from './shared/a.js';\nimport { b } from './shared/b.js';\nchrome.runtime.getURL('page.html');",
      'shared/a.js': '',
      'page.html': '<link rel="stylesheet" href="style.css"><a href="https://example.com/">x</a>',
    });
    assert.deepEqual(await missingReferences(dir, ['offscreen.html']), [
      '. → ./shared/b.js',
      '. → style.css',
      'root → icons/gone.png',
      'root → offscreen.html',
    ]);
  }));

  it('missingReferences reads a #fragment or ?query as the file before it, still finding a missing one', () => inTemp(async (dir) => {
    await writeTree(dir, {
      'manifest.json': JSON.stringify({ background: { service_worker: 'background.js?v=2' }, action: { default_icon: 'icon.png' } }),
      'background.js': "import './shared/a.js?fresh';\nchrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#workspaces') });\nchrome.runtime.getURL('gone.html#top');",
      'shared/a.js': '',
      'icon.png': 'png',
      'options/options.html': '<a href="#top">Top</a><a href="options.html?section=about">About</a><a href="help.html#faq">Help</a><img src="data:image/png;base64,AA">',
    });
    assert.deepEqual(await missingReferences(dir), [
      'root → gone.html#top',
      'options → help.html#faq',
    ]);
    assert.equal(referencedPath('options.html#workspaces'), 'options.html');
    assert.equal(referencedPath('a.js?v=2#x'), 'a.js');
    assert.equal(referencedPath('#top'), '');
  }));

  it('names toolbar icon files by scheme and size', () => {
    assert.equal(toolbarIconFile('dark', 32), 'dark-32.png');
  });
});

describe('duplication guard', () => {
  const report = {
    duplicates: [
      { firstFile: { name: 'a.js', start: 1, end: 9 }, secondFile: { name: 'b.js', start: 3, end: 11 }, lines: 9 },
      { firstFile: { name: 'a.js', start: 20, end: 30 }, secondFile: { name: 'c.js', start: 1, end: 11 }, lines: 11 },
    ],
  };

  it('reads clones from jscpd’s JSON report', () => {
    assert.deepEqual(clonesFromReport(report)[0], { first: 'a.js', second: 'b.js', lines: 9, where: 'a.js:1-9 ~ b.js:3-11' });
    assert.deepEqual(clonesFromReport({}), []);
  });

  it('fails only on clones no allowlist entry covers', () => {
    const left = disallowedClones(clonesFromReport(report), [{ files: ['a.js', 'b.js'], reason: 'fixtures' }]);
    assert.deepEqual(left.map((clone) => clone.second), ['c.js']);
  });
});
