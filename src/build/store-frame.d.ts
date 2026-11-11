/**
 * Drawing kit for store screenshots: a 1280×800 canvas with a caption band and a Chrome window
 * (macOS, light or dark, default theme). Everything here is presentation around real captures;
 * nothing is a feature of the extension.
 *
 * Window metrics follow Chrome's 2023 refresh on macOS (tabs 34px high in a 42px strip, a 46px
 * toolbar with a pill omnibox).
 *
 * Use it from an extension's `store/tools/make-screenshots.mjs`: capture the page content with
 * Playwright at `geometry(zoom).content`, then screenshot `canvas({caption, chrome:
 * windowChrome({tabs, url}), content})` at {@link W}×{@link H}.
 *
 * The window itself is `frame/window.js`, in the runtime half, so an extension page can draw it
 * around a capture too; it's re-exported here.
 *
 * @module build/store-frame
 */
export { THEMES, letterIcon, windowChrome, windowChromeSvg } from '../frame/window.js';
export type Theme = import('../frame/window.js').Theme;
export type Tab = import('../frame/window.js').Tab;
/** @typedef {import('../frame/window.js').Theme} Theme */
/** @typedef {import('../frame/window.js').Tab} Tab */
/** The store screenshot's width. */
export declare const W = 1280;
/** The store screenshot's height. */
export declare const H = 800;
/** Where the window sits: its left edge, top edge, full width, and tab strip and toolbar heights. */
export declare const WIN: {
    strip: 42;
    toolbar: 46;
    x: number;
    y: number;
    w: number;
};
export type Geometry = {
    /**
     * The window's scale.
     */
    zoom: number;
    /**
     * The window's unscaled width.
     */
    w: number;
    /**
     * The size to capture page content at.
     */
    content: {
        width: number;
        height: number;
    };
};
/**
 * How a shot's window is laid out.
 *
 * @typedef {object} Geometry
 * @property {number} zoom The window's scale.
 * @property {number} w The window's unscaled width.
 * @property {{ width: number, height: number }} content The size to capture page content at.
 */
/**
 * A shot's window is drawn at `zoom` (scaled about its top-left corner) so text stays legible
 * when the store shows screenshots small. Content is captured at 2× so the scaling stays sharp.
 *
 * @param {number} [zoom] - The window's scale. Default 1.
 * @returns {Geometry} The window's unscaled width and the size to capture page content at.
 */
export declare function geometry(zoom?: number): Geometry;
/**
 * The macOS arrow pointer.
 *
 * @param {number} x - Its tip, across the canvas.
 * @param {number} y - Its tip, down the canvas.
 * @returns {string} Absolutely positioned SVG.
 */
export declare const cursor: (x: number, y: number) => string;
/**
 * The full page: caption band, window, content and overlays.
 *
 * @param {object} options - What to draw.
 * @param {string} options.caption - The headline above the window.
 * @param {Theme} [options.theme] - Default light.
 * @param {string} options.chrome - From windowChrome.
 * @param {string} options.content - An <img> src (a capture at `geo.content` size) or raw HTML.
 * @param {string} [options.overlays] - HTML drawn over the window.
 * @param {Geometry} [options.geo] - Default geometry(1).
 * @returns {string} A whole HTML document, W×H.
 */
export declare function canvas({ caption, theme, chrome, content, overlays, geo }: {
    caption: string;
    theme?: Theme;
    chrome: string;
    content: string;
    overlays?: string;
    geo?: Geometry;
}): string;
