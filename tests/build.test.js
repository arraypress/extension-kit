import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { githubAboutLinks, isPlaceholder } from '../src/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  HOOK_FILE, ICON_SIZES, PANEL_OPENER, RUNTIME_ENTRIES, STYLESHEET, TEST_BUILDS_ENV, VENDOR_STAMP, buildTestCopy, checkVendored,
  clonesFromReport, disallowedClones, packageDir, placeholderWarning, printReleaseChecks, renderIcons, repositoryReminder,
  shipsFile, storeFrame, storeShotHtml, storeShots, contextMenuHtml, pngUrl, PANEL_HEADER_H, PANEL_W, testBuildDir, toolbarIconFile, vendorKit, vendorPackage,
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

/** The kit's command. */
const BIN = fileURLToPath(new URL('../bin/extension-kit.js', import.meta.url));

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
    assert.deepEqual(new Set(files.map((file) => file.split('/')[0])), new Set([...RUNTIME_ENTRIES, VENDOR_STAMP]));
    const kit = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(JSON.parse(await readFile(path.join(dest, VENDOR_STAMP), 'utf8')), { package: kit.name, version: kit.version });
    assert.equal(await readFile(path.join(dest, 'styles', 'chrome-ui.css'), 'utf8'), await readFile(STYLESHEET, 'utf8'));
  }));

  it('the vendored copy resolves every import it makes', () => inTemp(async (dir) => {
    await vendorKit(path.join(dir, 'vendor'));
    await writeFile(path.join(dir, 'manifest.json'), '{}');
    assert.deepEqual(await missingReferences(dir), []);
  }));
});

describe('vendoring a package', () => {
  /**
   * An extension repository with a package installed: `node_modules/@scope/lib` at `version`, whose
   * `exports` hide its package.json (as autoconsent's do).
   *
   * @param {string} dir - The repository.
   * @param {string} version - The installed version.
   */
  const install = (dir, version) => writeTree(dir, {
    'package.json': '{"name": "extension"}',
    'node_modules/@scope/lib/package.json': JSON.stringify({ name: '@scope/lib', version, exports: { '.': './dist/lib.cjs' } }),
    'node_modules/@scope/lib/dist/lib.esm.js': 'export const lib = 1;',
    'node_modules/@scope/lib/rules/rules.json': '[]',
    'node_modules/@scope/lib/LICENSE': 'MPL',
    'node_modules/@scope/lib/src/index.js': "export * from './parse.js';",
    'node_modules/@scope/lib/src/parse.js': 'export const parse = 1;',
  });

  it('copies named files by their own names, and a folder’s contents for a path ending in /, stamped', () => inTemp(async (dir) => {
    await install(dir, '2.0.0');
    const dest = path.join(dir, 'extension', 'vendor', 'lib');
    await writeTree(dest, { 'stale.js': 'old' });
    assert.deepEqual(await vendorPackage('@scope/lib', ['dist/lib.esm.js', 'rules/rules.json', 'LICENSE'], dest, { from: dir }),
      ['lib.esm.js', 'rules.json', 'LICENSE']);
    assert.deepEqual(await filesUnder(dest), ['LICENSE', 'lib.esm.js', 'rules.json', VENDOR_STAMP]);
    assert.deepEqual(JSON.parse(await readFile(path.join(dest, VENDOR_STAMP), 'utf8')), { package: '@scope/lib', version: '2.0.0' });
    await vendorPackage('@scope/lib', ['src/'], dest, { from: path.join(dir, 'extension') });
    assert.deepEqual(await filesUnder(dest), ['index.js', 'parse.js', VENDOR_STAMP]);
    await assert.rejects(vendorPackage('@scope/missing', ['x.js'], dest, { from: dir }), /@scope\/missing isn't installed/);
    assert.equal(await packageDir('@scope/lib', path.join(dir, 'extension', 'vendor')), path.join(dir, 'node_modules', '@scope', 'lib'));
  }));

  it('checkVendored names each copy that no longer matches what’s installed', () => inTemp(async (dir) => {
    await install(dir, '2.0.0');
    const vendor = path.join(dir, 'extension', 'vendor');
    await vendorPackage('@scope/lib', ['LICENSE'], path.join(vendor, 'lib'), { from: dir });
    await writeTree(vendor, { 'generated/consent.js': '' });
    assert.deepEqual(await checkVendored(vendor, { from: dir }), []);
    await install(dir, '2.1.0'); // `npm install @scope/lib@2.1.0`: the extension's postinstall doesn't run.
    assert.deepEqual(await checkVendored(vendor, { from: dir }), [`${path.join(vendor, 'lib')} is @scope/lib 2.0.0; 2.1.0 is installed`]);
    await rm(path.join(dir, 'node_modules', '@scope'), { recursive: true });
    assert.deepEqual(await checkVendored(vendor, { from: dir }), [`${path.join(vendor, 'lib')} is @scope/lib 2.0.0, which isn't installed`]);
    assert.deepEqual(await checkVendored(path.join(dir, 'nothing-here'), { from: dir }), []);
  }));

  it('extension-kit vendor and vendor-check, as npm scripts run them', () => inTemp(async (dir) => {
    await install(dir, '2.0.0');
    const run = (/** @type {string[]} */ ...args) => promisify(execFile)(process.execPath, [BIN, ...args], { cwd: dir });
    await run('vendor', 'extension/vendor/lib', '@scope/lib', 'src/');
    assert.deepEqual(await filesUnder(path.join(dir, 'extension', 'vendor', 'lib')), ['index.js', 'parse.js', VENDOR_STAMP]);
    assert.match((await run('vendor-check')).stdout, /extension\/vendor matches the installed packages/);
    await install(dir, '2.1.0');
    await assert.rejects(run('vendor-check'), (error) => {
      const { code, stderr } = /** @type {{code: number, stderr: string}} */ (error);
      assert.equal(code, 1);
      assert.match(stderr, /extension\/vendor\/lib is @scope\/lib 2\.0\.0; 2\.1\.0 is installed/);
      assert.match(stderr, /npm run postinstall/);
      return true;
    });
  }));
});

describe('test builds', () => {
  it('testBuildDir: .test-builds/<name>, or under $EXTENSION_TEST_BUILDS', () => {
    assert.equal(testBuildDir('/repo'), '/repo/.test-builds/e2e');
    assert.equal(testBuildDir('/repo', 'e2e-all-sites', {}), '/repo/.test-builds/e2e-all-sites');
    assert.equal(testBuildDir('/repo', 'e2e', { [TEST_BUILDS_ENV]: '/tmp/before' }), '/tmp/before/e2e');
    assert.equal(testBuildDir('/repo', 'live', { [TEST_BUILDS_ENV]: '.test-builds/second' }), '/repo/.test-builds/second/live');
  });

  it('buildTestCopy: the extension, its hook as the service worker, and the manifest as changed', () => inTemp(async (dir) => {
    await writeTree(dir, {
      'extension/manifest.json': JSON.stringify({ background: { service_worker: 'background.js', type: 'module' }, permissions: ['storage'] }),
      'extension/background.js': '', 'test/hook.js': "import './background.js';",
    });
    const to = testBuildDir(dir, 'e2e', {});
    await writeTree(to, { 'stale.js': '' });
    await buildTestCopy({
      from: path.join(dir, 'extension'), to, hook: path.join(dir, 'test', 'hook.js'),
      manifest: (manifest) => { manifest.host_permissions = ['http://127.0.0.1/*']; manifest.permissions?.push('webNavigation'); },
    });
    assert.deepEqual(await filesUnder(to), ['background.js', HOOK_FILE, 'manifest.json']);
    assert.deepEqual(JSON.parse(await readFile(path.join(to, 'manifest.json'), 'utf8')), {
      background: { service_worker: HOOK_FILE, type: 'module' }, permissions: ['storage', 'webNavigation'], host_permissions: ['http://127.0.0.1/*'],
    });
    await buildTestCopy({ from: path.join(dir, 'extension'), to });
    assert.equal(JSON.parse(await readFile(path.join(to, 'manifest.json'), 'utf8')).background.service_worker, 'background.js');
  }));

  it('buildTestCopy with panelOpener: a page whose button opens that panel through the vendored kit’s openSidePanel', () => inTemp(async (dir) => {
    await writeTree(dir, { 'extension/manifest.json': '{}', 'extension/panel/panel.html': '' });
    const to = testBuildDir(dir, 'e2e', {});
    await buildTestCopy({ from: path.join(dir, 'extension'), to, panelOpener: 'panel/panel.html' });
    assert.equal(PANEL_OPENER, 'e2e/open-panel.html');
    assert.deepEqual(await filesUnder(to), ['e2e/open-panel.html', 'e2e/open-panel.js', 'manifest.json', 'panel/panel.html']);
    assert.match(await readFile(path.join(to, PANEL_OPENER), 'utf8'), /<button id="open" type="button">[\s\S]*<script type="module" src="open-panel.js">/);
    const script = await readFile(path.join(to, 'e2e/open-panel.js'), 'utf8');
    // The import resolves to the kit as vendored into an extension (`vendor/extension-kit/` holds src's runtime folders).
    const imported = /from '\.\.\/vendor\/extension-kit\/([^']+)'/.exec(script)?.[1] ?? '';
    assert.ok(RUNTIME_ENTRIES.includes(imported.split('/')[0]) && (await readFile(path.join(path.dirname(STYLESHEET), '..', imported), 'utf8')).includes('export function openSidePanel'));
    assert.match(script, /openSidePanel\(chrome\.sidePanel, tabId, "panel\/panel\.html"\)/);
    assert.match(script, /document\.title = 'opened'/);
    await buildTestCopy({ from: path.join(dir, 'extension'), to });
    assert.equal((await filesUnder(to)).includes(PANEL_OPENER), false, 'not without it');
  }));
});

describe('icons', () => {
  it('renderIcons renders icon.svg in its own colours at the manifest’s sizes', () => inTemp(async (dir) => {
    await writeFile(path.join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#0b57d0"/></svg>');
    const written = await renderIcons({ chromium, dir });
    assert.deepEqual(written, ICON_SIZES.map((size) => path.join(dir, `icon-${size}.png`)));
    const page = await (await chromium.launch()).newPage();
    try {
      for (const size of ICON_SIZES) {
        const png = await readFile(path.join(dir, `icon-${size}.png`));
        const pixel = await page.evaluate(async (base64) => {
          const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
          context.drawImage(image, 0, 0);
          return [image.width, image.height, ...context.getImageData(image.width / 2, image.height / 2, 1, 1).data];
        }, png.toString('base64'));
        assert.deepEqual(pixel, [size, size, 11, 87, 208, 255], `icon-${size}.png`);
      }
    } finally {
      await page.context().browser()?.close();
    }
  }));
});

describe('store frame', () => {
  it('draws a caption and a Chrome window around content captured at the geometry’s size', () => {
    const { W, H, canvas, geometry, windowChrome } = storeFrame;
    const geo = geometry(1.25);
    assert.deepEqual(geo.content, { width: 922, height: 462 });
    const html = canvas({ caption: 'Rotate any image', theme: 'dark', chrome: windowChrome({ tabs: [{ title: 'A <b>', icon: 'a.png', active: true }], url: 'example.com/x', urlHost: 'example.com', theme: 'dark' }), content: 'shot.png', geo });
    assert.match(html, new RegExp(`width: ${W}px; height: ${H}px`));
    assert.match(html, /<div class="caption">Rotate any image<\/div>/);
    assert.match(html, /<span class="title">A &lt;b&gt;<\/span>/);
    assert.match(html, /<img src="shot.png" width="922" height="462"/);
  });
});

describe('store shots', () => {
  it('a caption, the window with the extension in the toolbar, the page; a side panel beside it with the extension’s name; a menu with its rows', () => {
    const html = storeShotHtml({
      caption: 'Copy <any> page', tabs: [{ title: 'Notes', icon: 'n.png', active: true }], url: 'notes.example/a', page: 'page.png', toolbarIcon: 'tb.png',
      panel: { image: 'panel.png', title: 'Better Fonts', icon: 'ext.png' },
      menu: { x: 10, y: 20, items: [{ label: 'Back' }, {}, { label: 'Better Copy', icon: 'ext.png', submenu: true, highlighted: true }], submenu: [{ label: 'Copy page as Markdown' }] },
    });
    const { width, height } = storeFrame.geometry(1).content;
    assert.match(html, /<div class="caption">Copy &lt;any&gt; page<\/div>/);
    assert.match(html, /<img src="tb.png" width="16" height="16"/);
    assert.match(html, new RegExp(`<img src="page.png" width="${width - PANEL_W}" height="${height}"`));
    assert.match(html, /<span>Better Fonts<\/span>/);
    assert.match(html, new RegExp(`<img src="panel.png" width="${PANEL_W}" height="${height - PANEL_HEADER_H}"`));
    assert.equal((html.match(/class="ctx"/g) ?? []).length, 2);
    assert.equal((html.match(/class="ctx-sep"/g) ?? []).length, 1, 'its own separator class: the tab strip styles .sep');
    assert.match(html, /class="ctx-row on"><span class="ctx-ic"><img src="ext.png"[^>]*><\/span><span class="ctx-label">Better Copy<\/span><span class="ctx-arrow">/);
    assert.doesNotMatch(html, /class="popup"/);
  });

  it('a submenu only beside a highlighted row that has one', () => {
    assert.equal((contextMenuHtml({ x: 0, y: 0, items: [{ label: 'A', submenu: true }], submenu: [{ label: 'B' }] }).match(/class="ctx"/g) ?? []).length, 1);
  });

  it('writes a 1280×800 PNG, the popup hung from the extension’s pressed button under the toolbar', async () => {
    const browser = await chromium.launch();
    const dir = await mkdtemp(path.join(tmpdir(), 'store-shots-'));
    try {
      const blank = async (/** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ colour) => {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        await page.setContent(`<body style="margin:0;background:${colour}">`);
        const png = await page.screenshot();
        await page.close();
        return pngUrl(png);
      };
      const { geo, shoot } = storeShots({ browser, dir, toolbarIcon: await blank(16, 16, '#0b57d0') });
      const out = await shoot('1.png', {
        caption: 'One', tabs: [{ title: 'A', icon: await blank(16, 16, '#888'), active: true }], url: 'a.example',
        page: await blank(geo.content.width, geo.content.height, '#ffffff'), popup: { image: await blank(300, 200, '#ff0000'), width: 300, height: 200 },
      });
      const png = await readFile(out);
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 800]);
      const page = await browser.newPage();
      const found = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        let left = img.width, right = 0, top = img.height;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (data[i] > 250 && data[i + 1] < 5 && data[i + 2] < 5) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); }
        }
        return { left, right, top };
      }, pngUrl(png));
      await page.close();
      assert.equal(found.right - found.left + 1, 300);
      assert.ok(found.right > 1280 - 200 && found.right < 1280 - 64, `the popup's right edge near the toolbar button: ${found.right}`);
      assert.ok(Math.abs(found.top - (112 + 42 + 46 - 2)) <= 1, `the popup just under the toolbar: ${found.top}`);
    } finally {
      await browser.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('packaging', () => {
  it('the zip is the folder less SVG sources, declarations, vendor stamps and .DS_Store, with no folder entries', () => inTemp(async (dir) => {
    await writeTree(dir, {
      'manifest.json': '{}', 'icons/icon-16.png': 'png', 'icons/toolbar/glyph.svg': '<svg/>',
      'vendor/kit/index.js': '', 'vendor/kit/index.d.ts': '', [`vendor/kit/${VENDOR_STAMP}`]: '{}', '.DS_Store': 'x', 'options/.DS_Store': 'x',
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
