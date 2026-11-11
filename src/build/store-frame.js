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

import { THEMES, WINDOW_BARS, WINDOW_W } from '../frame/window.js';

export { THEMES, letterIcon, windowChrome, windowChromeSvg } from '../frame/window.js';

/** @typedef {import('../frame/window.js').Theme} Theme */
/** @typedef {import('../frame/window.js').Tab} Tab */

/** The store screenshot's width. */
export const W = 1280;
/** The store screenshot's height. */
export const H = 800;
const CAPTION_H = 112;
/** Where the window sits: its left edge, top edge, full width, and tab strip and toolbar heights. */
export const WIN = { x: 64, y: CAPTION_H, w: WINDOW_W, ...WINDOW_BARS };

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
export function geometry(zoom = 1) {
  const w = Math.round((W - 2 * WIN.x) / zoom);
  return { zoom, w, content: { width: w, height: Math.round((H - WIN.y) / zoom) - WIN.strip - WIN.toolbar } };
}

/**
 * The macOS arrow pointer.
 *
 * @param {number} x - Its tip, across the canvas.
 * @param {number} y - Its tip, down the canvas.
 * @returns {string} Absolutely positioned SVG.
 */
export const cursor = (x, y) => `<svg style="position:absolute;left:${x - 4}px;top:${y - 3}px;z-index:20;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))" width="22" height="30" viewBox="0 0 22 30">
  <path d="M4 3 L4 24 L9 19.5 L12.4 27 L15.6 25.6 L12.3 18.3 L19 18.3 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

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
export function canvas({ caption, theme = 'light', chrome, content, overlays = '', geo = geometry(1) }) {
  const t = THEMES[theme];
  const { width: cw, height: ch } = geo.content;
  const inner = content.startsWith('<') ? content : `<img src="${content}" width="${cw}" height="${ch}" alt="" style="display:block">`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; background: ${t.bg}; -webkit-font-smoothing: antialiased; }
    .caption { position: absolute; left: 0; right: 0; top: 0; height: ${CAPTION_H}px; display: grid; place-items: center; font: 500 32px/1.2 system-ui; letter-spacing: -.2px; color: ${t.caption}; }
    .stage { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform: scale(${geo.zoom}); transform-origin: ${WIN.x}px ${WIN.y}px; }
    .window { position: absolute; left: ${WIN.x}px; top: ${WIN.y}px; width: ${geo.w}px; height: ${ch + WIN.strip + WIN.toolbar + 20}px; border-radius: 12px 12px 0 0; overflow: hidden; box-shadow: ${t.shadow}; }
    .content { position: absolute; left: 0; top: ${WIN.strip + WIN.toolbar}px; width: ${cw}px; height: ${ch}px; overflow: hidden; background: ${theme === 'dark' ? '#202124' : '#fff'}; }
  </style></head><body>
    <div class="caption">${caption}</div>
    <div class="stage"><div class="window">${chrome}<div class="content">${inner}</div></div>
    ${overlays}</div>
  </body></html>`;
}
