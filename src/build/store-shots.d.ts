/**
 * Store screenshots for the whole family, in one style: a caption band in sentence case over
 * Chrome's window (light theme) with the extension pinned in the toolbar, real captures inside.
 * What headless Chrome can't capture is composed around the real extension UI, as Chrome draws
 * it: the toolbar popup hanging from the extension's button (the popup page captured on its own),
 * the side panel beside the page (the panel page captured on its own) and the right-click menu
 * (drawn, with the extension's real menu titles).
 *
 * {@link storeShotHtml} lays one out (pure); {@link storeShots} renders them in a Playwright
 * page at 2× and writes 1280×800 PNGs. Captures are taken at 2× too
 * (`deviceScaleFactor: 2`) and shown at their CSS size, so text stays sharp.
 *
 * @module build/store-shots
 */
import type { Tab, Theme } from '../frame/window.js';
import type { Geometry } from './store-frame.js';
/** @import { Tab, Theme } from '../frame/window.js' */
/** @import { Geometry } from './store-frame.js' */
/** The side panel's width, as Chrome opens it (px). */
export declare const PANEL_W = 360;
export type MenuItem = {
    /**
     * Its words (none: a separator).
     */
    label?: string;
    /**
     * A 16px icon's URL (the extension's, beside its own item).
     */
    icon?: string;
    /**
     * It opens a submenu (an arrow).
     */
    submenu?: boolean;
    /**
     * The pointer is over it.
     */
    highlighted?: boolean;
    /**
     * Greyed out.
     */
    disabled?: boolean;
};
/**
 * One row of the right-click menu.
 *
 * @typedef {object} MenuItem
 * @property {string} [label] Its words (none: a separator).
 * @property {string} [icon] A 16px icon's URL (the extension's, beside its own item).
 * @property {boolean} [submenu] It opens a submenu (an arrow).
 * @property {boolean} [highlighted] The pointer is over it.
 * @property {boolean} [disabled] Greyed out.
 */
/**
 * The right-click menu as macOS draws Chrome's (a native menu): rounded, translucent, 13px rows,
 * the row under the pointer in the accent colour; a submenu beside its highlighted row.
 *
 * @param {object} menu - What to draw.
 * @param {number} menu.x - Its left edge, in the window's content area (px).
 * @param {number} menu.y - Its top edge, in the content area.
 * @param {readonly MenuItem[]} menu.items - Its rows.
 * @param {readonly MenuItem[]} [menu.submenu] - The highlighted row's submenu.
 * @returns {string} The HTML, positioned in the content area.
 */
export declare function contextMenuHtml({ x, y, items, submenu }: {
    x: number;
    y: number;
    items: readonly MenuItem[];
    submenu?: readonly MenuItem[];
}): string;
export type Shot = {
    /**
     * The caption, sentence case, a few words.
     */
    caption: string;
    /**
     * The window's tabs.
     */
    tabs: readonly Tab[];
    /**
     * The address bar's text.
     */
    url: string;
    /**
     * The start of `url` shown in full; the rest dimmed.
     */
    urlHost?: string;
    /**
     * The page's capture (a data: URL), at the content's size (less the side panel's when there's one).
     */
    page: string;
    /**
     * The popup's capture and its size: hung from the extension's toolbar button.
     */
    popup?: {
        image: string;
        width: number;
        height: number;
    };
    /**
     * The side panel's capture (`PANEL_W` wide, the content's height less its header), the extension's name and icon for its header.
     */
    panel?: {
        image: string;
        title: string;
        icon: string;
    };
    /**
     * A right-click menu over the page.
     */
    menu?: Parameters<typeof contextMenuHtml>[0];
    /**
     * The mouse pointer, in the content area.
     */
    pointer?: {
        x: number;
        y: number;
    };
};
/**
 * One store screenshot.
 *
 * @typedef {object} Shot
 * @property {string} caption The caption, sentence case, a few words.
 * @property {readonly Tab[]} tabs The window's tabs.
 * @property {string} url The address bar's text.
 * @property {string} [urlHost] The start of `url` shown in full; the rest dimmed.
 * @property {string} page The page's capture (a data: URL), at the content's size (less the side panel's when there's one).
 * @property {{image: string, width: number, height: number}} [popup] The popup's capture and its size: hung from the extension's toolbar button.
 * @property {{image: string, title: string, icon: string}} [panel] The side panel's capture (`PANEL_W` wide, the content's height less its header), the extension's name and icon for its header.
 * @property {Parameters<typeof contextMenuHtml>[0]} [menu] A right-click menu over the page.
 * @property {{x: number, y: number}} [pointer] The mouse pointer, in the content area.
 */
/**
 * The HTML of one store screenshot: the caption, Chrome's window with the extension's toolbar
 * button, and the captures; a popup hangs from the button (shown pressed), a side panel sits at
 * the window's right, a menu over the page.
 *
 * @param {Shot & {toolbarIcon: string, theme?: Theme, geo?: Geometry}} shot - What to draw; the extension's toolbar icon (a data: URL).
 * @returns {string} A whole HTML document, {@link W}×{@link H}.
 */
export declare function storeShotHtml({ caption, tabs, url, urlHost, page, popup, panel, menu, pointer, toolbarIcon, theme, geo }: Shot & {
    toolbarIcon: string;
    theme?: Theme;
    geo?: Geometry;
}): string;
/**
 * A data: URL of a PNG.
 *
 * @param {Uint8Array} png - The PNG's bytes.
 * @returns {string} The URL.
 */
export declare const pngUrl: (png: Uint8Array) => string;
/**
 * A store-screenshot writer: lays each shot out with {@link storeShotHtml} in a page of the
 * given browser at 2×, waits for its images, and saves it as a {@link W}×{@link H} PNG.
 *
 * @param {object} options - Where and how.
 * @param {import('playwright').Browser | import('playwright').BrowserContext} options.browser - A browser (or a context) to draw in.
 * @param {string} options.dir - The folder to write to (made if missing).
 * @param {string} options.toolbarIcon - The extension's toolbar icon, a data: URL.
 * @returns {{geo: Geometry, shoot: (file: string, shot: Shot) => Promise<string>}} The window's geometry
 *   (capture pages at `geo.content`), and `shoot`, which writes one and returns its path.
 * @example
 * const { geo, shoot } = storeShots({ browser, dir: 'store/screenshots', toolbarIcon });
 * await shoot('1-menu.png', { caption: 'Copy any page as Markdown', tabs, url, page: pngUrl(await page.screenshot()) });
 */
export declare function storeShots({ browser, dir, toolbarIcon }: {
    browser: import('playwright').Browser | import('playwright').BrowserContext;
    dir: string;
    toolbarIcon: string;
}): {
    geo: Geometry;
    shoot: (file: string, shot: Shot) => Promise<string>;
};
