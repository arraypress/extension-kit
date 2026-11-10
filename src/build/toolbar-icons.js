/**
 * An extension's icons, rendered from SVG in Playwright's Chromium.
 *
 * The toolbar glyphs: an extension's monochrome toolbar icon in Chrome's own
 * toolbar-icon colours, light and dark, at 16, 32 and 48px, for
 * toolbar/theme.js to switch between. A folder holds the sources:
 * `glyph.svg` (16×16 viewBox, drawn in `currentColor`) and, optionally,
 * `glyph-16.svg`, the same mark hand-fitted to whole pixels for the 16px file
 * (a 1.5px stroke smears at 1x). Out come `light-16.png`, `dark-16.png`, …
 * beside them.
 *
 * The extension's own icon (the manifest's `icons`, the Chrome Web Store's
 * tile): `icon.svg`, in its own colours, rendered to `icon-16.png` … `icon-128.png`
 * beside it.
 *
 * The caller passes its own Playwright, so this package needs none.
 *
 * @module build/toolbar-icons
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Chrome's toolbar button icon colour, default theme, Chrome 157 (157.0.8103.39):
 *
 *   chrome/browser/ui/color/material_chrome_color_mixer.cc:531-532
 *     kColorToolbarButtonIcon = kColorToolbarButtonIconDefault = kColorSysOnSurfaceSecondary
 *   ui/color/sys_color_mixer.cc:219-220 (the baseline palette, no user colour)
 *     kColorSysOnSurfaceSecondary = dark ? kColorRefNeutral80 : kColorRefNeutral30
 *   ui/color/ref_color_mixer.cc:150, 155 (default; the :107/:112 values sit behind
 *   kChromeDarkNeutrals26, off by default in ui/base/ui_base_features.cc:529)
 *     kColorRefNeutral30 = #474747, kColorRefNeutral80 = #C7C7C7
 *
 * Apple's Passwords extension uses #35363A, which is the pre-2023 *dark toolbar*
 * colour (chrome_color_mixer.cc:805, kColorToolbar dark); the old light icon was
 * kGoogleGrey700 #5F6368 (chrome_color_mixer.cc:826-827). Both are darker or bluer
 * than the Refresh icons beside them, so we use Chrome's current values.
 */
export const TOOLBAR_ICON_COLORS = Object.freeze({ light: '#474747', dark: '#C7C7C7' });

/**
 * The toolbar behind them, for previews: kColorToolbar = kColorSysBase
 * (material_chrome_color_mixer.cc:527) = dark ? kColorRefNeutral25 : kColorRefNeutral100
 * (sys_color_mixer.cc:246) = #3C3C3C / #FFFFFF (ref_color_mixer.cc:149, 164).
 */
export const TOOLBAR_COLORS = Object.freeze({ light: '#FFFFFF', dark: '#3C3C3C' });

/** 16 and 32 are what Chrome draws at 1x and 2x; 48 covers 3x. */
export const TOOLBAR_ICON_SIZES = Object.freeze([16, 32, 48]);

/**
 * The file name of one rendered icon.
 *
 * @param {'light' | 'dark'} scheme - Which scheme's colour.
 * @param {number} size - Pixels.
 * @returns {string} For example `light-16.png`.
 */
export function toolbarIconFile(scheme, size) {
  return `${scheme}-${size}.png`;
}

/** The sizes the manifest's `icons` lists: the toolbar and menus (16, 32), the extensions page (48), the store (128). */
export const ICON_SIZES = Object.freeze([16, 32, 48, 128]);

/**
 * The parts of a Playwright `BrowserType` (`chromium`) this uses.
 *
 * @typedef {object} BrowserLauncher
 * @property {() => Promise<{newPage(options: {viewport: {width: number, height: number}, deviceScaleFactor: number}): Promise<{
 *   setContent(html: string): Promise<void>,
 *   screenshot(options: {omitBackground: boolean}): Promise<Uint8Array>,
 *   close(): Promise<void>}>, close(): Promise<void>}>} launch
 */

/**
 * The parts of a launched Playwright browser this uses.
 *
 * @typedef {Awaited<ReturnType<BrowserLauncher['launch']>>} IconBrowser
 */

/**
 * Render an SVG to a square PNG, transparent around the mark.
 *
 * @param {IconBrowser} browser - A launched Chromium.
 * @param {string} svg - The SVG's markup.
 * @param {number} size - Pixels, each way.
 * @param {string} file - The PNG to write.
 * @param {string} [color] - `currentColor`, for a monochrome glyph.
 * @returns {Promise<string>} `file`.
 */
async function renderSvg(browser, svg, size, file, color = 'inherit') {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px;color:${color}}</style>${svg}`);
    await writeFile(file, await page.screenshot({ omitBackground: true }));
  } finally {
    await page.close();
  }
  return file;
}

/**
 * Run `work` with a Chromium launched for it, closed after.
 *
 * @template T
 * @param {BrowserLauncher} chromium - Playwright's `chromium`.
 * @param {(browser: IconBrowser) => Promise<T>} work - The rendering.
 * @returns {Promise<T>} What `work` gives.
 */
async function withBrowser(chromium, work) {
  const browser = await chromium.launch();
  try {
    return await work(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Render every scheme and size of the toolbar glyph from `dir`'s sources into `dir`.
 *
 * @param {object} options - What to render with and where.
 * @param {BrowserLauncher} options.chromium - Playwright's `chromium`.
 * @param {string} options.dir - The folder with `glyph.svg` (and maybe `glyph-16.svg`).
 * @param {readonly number[]} [options.sizes] - Default {@link TOOLBAR_ICON_SIZES}.
 * @returns {Promise<string[]>} The files written.
 * @example
 * import { chromium } from 'playwright';
 * await renderToolbarIcons({ chromium, dir: 'extension/icons/toolbar' });
 * // or, from an npm script: extension-kit toolbar-icons extension/icons/toolbar
 */
export async function renderToolbarIcons({ chromium, dir, sizes = TOOLBAR_ICON_SIZES }) {
  const master = await readFile(path.join(dir, 'glyph.svg'), 'utf8');
  const small = await readFile(path.join(dir, 'glyph-16.svg'), 'utf8').catch(() => master);
  return withBrowser(chromium, async (browser) => {
    /** @type {string[]} */
    const written = [];
    for (const [scheme, color] of /** @type {['light' | 'dark', string][]} */ (Object.entries(TOOLBAR_ICON_COLORS))) {
      for (const size of sizes) {
        written.push(await renderSvg(browser, size === 16 ? small : master, size, path.join(dir, toolbarIconFile(scheme, size)), color));
      }
    }
    return written;
  });
}

/**
 * Render the extension's icon, `dir/icon.svg`, to `icon-<size>.png` beside it.
 *
 * @param {object} options - What to render with and where.
 * @param {BrowserLauncher} options.chromium - Playwright's `chromium`.
 * @param {string} options.dir - The folder with `icon.svg`.
 * @param {readonly number[]} [options.sizes] - Default {@link ICON_SIZES}.
 * @returns {Promise<string[]>} The files written.
 * @example
 * await renderIcons({ chromium, dir: 'extension/icons' });
 * // or, from an npm script: extension-kit icons extension/icons
 */
export async function renderIcons({ chromium, dir, sizes = ICON_SIZES }) {
  const svg = await readFile(path.join(dir, 'icon.svg'), 'utf8');
  return withBrowser(chromium, async (browser) => {
    /** @type {string[]} */
    const written = [];
    for (const size of sizes) written.push(await renderSvg(browser, svg, size, path.join(dir, `icon-${size}.png`)));
    return written;
  });
}
