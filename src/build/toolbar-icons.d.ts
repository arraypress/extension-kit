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
export declare const TOOLBAR_ICON_COLORS: Readonly<{
    light: "#474747";
    dark: "#C7C7C7";
}>;
/**
 * The toolbar behind them, for previews: kColorToolbar = kColorSysBase
 * (material_chrome_color_mixer.cc:527) = dark ? kColorRefNeutral25 : kColorRefNeutral100
 * (sys_color_mixer.cc:246) = #3C3C3C / #FFFFFF (ref_color_mixer.cc:149, 164).
 */
export declare const TOOLBAR_COLORS: Readonly<{
    light: "#FFFFFF";
    dark: "#3C3C3C";
}>;
/** 16 and 32 are what Chrome draws at 1x and 2x; 48 covers 3x. */
export declare const TOOLBAR_ICON_SIZES: readonly number[];
/**
 * The file name of one rendered icon.
 *
 * @param {'light' | 'dark'} scheme - Which scheme's colour.
 * @param {number} size - Pixels.
 * @returns {string} For example `light-16.png`.
 */
export declare function toolbarIconFile(scheme: 'light' | 'dark', size: number): string;
/** The sizes the manifest's `icons` lists: the toolbar and menus (16, 32), the extensions page (48), the store (128). */
export declare const ICON_SIZES: readonly number[];
export type BrowserLauncher = {
    launch: () => Promise<{
        newPage(options: {
            viewport: {
                width: number;
                height: number;
            };
            deviceScaleFactor: number;
        }): Promise<{
            setContent(html: string): Promise<void>;
            screenshot(options: {
                omitBackground: boolean;
            }): Promise<Uint8Array>;
            close(): Promise<void>;
        }>;
        close(): Promise<void>;
    }>;
};
export type IconBrowser = Awaited<ReturnType<BrowserLauncher['launch']>>;
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
export declare function renderToolbarIcons({ chromium, dir, sizes }: {
    chromium: BrowserLauncher;
    dir: string;
    sizes?: readonly number[];
}): Promise<string[]>;
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
export declare function renderIcons({ chromium, dir, sizes }: {
    chromium: BrowserLauncher;
    dir: string;
    sizes?: readonly number[];
}): Promise<string[]>;
