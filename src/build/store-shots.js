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

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { esc } from '../frame/window.js';
import { H, W, WIN, canvas, cursor, geometry, windowChrome } from './store-frame.js';

/** @import { Tab, Theme } from '../frame/window.js' */
/** @import { Geometry } from './store-frame.js' */

/** The side panel's width, as Chrome opens it (px). */
export const PANEL_W = 360;

/** The side panel's header: the extension's icon and name, and Chrome's close button (px). */
const PANEL_HEADER_H = 40;

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
 * the row under the pointer in the accent colour; a submenu beside its highlighted row. Its class
 * names start `ctx` (the window's own styles have `.sep`, `.tab`…).
 *
 * @param {object} menu - What to draw.
 * @param {number} menu.x - Its left edge, in the window's content area (px).
 * @param {number} menu.y - Its top edge, in the content area.
 * @param {readonly MenuItem[]} menu.items - Its rows.
 * @param {readonly MenuItem[]} [menu.submenu] - The highlighted row's submenu.
 * @returns {string} The HTML, positioned in the content area.
 */
export function contextMenuHtml({ x, y, items, submenu }) {
  /** @param {readonly MenuItem[]} rows @returns {string} */
  const list = (rows) => rows.map((row) => (row.label === undefined
    ? '<div class="ctx-sep"></div>'
    : `<div class="ctx-row${row.highlighted ? ' on' : ''}${row.disabled ? ' off' : ''}"><span class="ctx-ic">${row.icon ? `<img src="${row.icon}" width="16" height="16" alt="">` : ''}</span><span class="ctx-label">${esc(row.label)}</span>${row.submenu ? '<span class="ctx-arrow">›</span>' : ''}</div>`)).join('');
  const at = items.findIndex((row) => row.highlighted && row.submenu);
  const top = (/** @type {number} */ index) => 5 + items.slice(0, index).reduce((sum, row) => sum + (row.label === undefined ? 11 : 22), 0);
  return `<div class="ctx" style="left:${x}px;top:${y}px">${list(items)}</div>`
    + (submenu && at >= 0 ? `<div class="ctx" style="left:${x + 236}px;top:${y + top(at) - 5}px">${list(submenu)}</div>` : '')
    + `<style>
      .ctx { position: absolute; z-index: 10; width: 240px; box-sizing: border-box; padding: 5px; border-radius: 10px; background: rgba(246,246,246,.96);
        box-shadow: 0 0 0 .5px rgba(0,0,0,.22), 0 10px 30px rgba(0,0,0,.22); font: 13px/22px system-ui; color: #1d1d1f; }
      .ctx-row { display: flex; align-items: center; height: 22px; padding: 0 8px 0 4px; border-radius: 5px; white-space: nowrap; }
      .ctx-row.on { background: #0a82ff; color: #fff; }
      .ctx-row.off { color: #b0b0b0; }
      .ctx-ic { width: 22px; flex: none; display: flex; }
      .ctx-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
      .ctx-arrow { flex: none; font-size: 15px; opacity: .7; }
      .ctx-sep { height: 1px; margin: 5px 8px; background: rgba(0,0,0,.11); }
    </style>`;
}

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
export function storeShotHtml({ caption, tabs, url, urlHost, page, popup, panel, menu, pointer, toolbarIcon, theme = 'light', geo = geometry(1) }) {
  const { width: cw, height: ch } = geo.content;
  const pageW = panel ? cw - PANEL_W : cw;
  const content = `<div style="position:relative;display:flex;width:${cw}px;height:${ch}px">
    <img src="${page}" width="${pageW}" height="${ch}" alt="" style="display:block;flex:none">
    ${panel ? `<div class="panel"><div class="panel-head"><img src="${panel.icon}" width="16" height="16" alt=""><span>${esc(panel.title)}</span><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#474747" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
      <img src="${panel.image}" width="${PANEL_W}" height="${ch - PANEL_HEADER_H}" alt="" style="display:block"></div>` : ''}
    ${menu ? contextMenuHtml(menu) : ''}
    ${pointer ? cursor(pointer.x, pointer.y) : ''}
  </div>
  <style>
    .panel { flex: none; width: ${PANEL_W}px; height: ${ch}px; background: #fff; border-left: 1px solid #d3d7dc; box-sizing: content-box; }
    .panel-head { height: ${PANEL_HEADER_H}px; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 14px; font: 500 13px system-ui; color: #1f1f1f; }
    .panel-head span { flex: 1; }
  </style>`;
  const overlays = popup ? `<div class="popup" style="width:${popup.width}px;height:${popup.height}px"><img src="${popup.image}" width="${popup.width}" height="${popup.height}" alt=""></div>
  <style>
    .popup { position: absolute; z-index: 30; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 0 0 .5px rgba(0,0,0,.2), 0 4px 12px rgba(0,0,0,.14), 0 12px 32px rgba(0,0,0,.16); }
    .popup img { display: block; }
    .toolbar > img.pressed { border-radius: 50%; background: #e3e3e3; box-shadow: 0 0 0 9px #e3e3e3; }
  </style>
  <script>
    // Hang the popup from the extension's button, as Chrome does: its right edge near the button's, just under the toolbar.
    const button = document.querySelector('.toolbar > img');
    button.classList.add('pressed');
    const box = button.getBoundingClientRect();
    const popupBox = document.querySelector('.popup');
    popupBox.style.left = (box.right + 14 - ${popup.width}) + 'px';
    popupBox.style.top = (${WIN.y + WIN.strip + WIN.toolbar} - 2) + 'px';
  </script>` : '';
  return canvas({ caption: esc(caption), theme, chrome: windowChrome({ tabs, url, urlHost, theme, w: geo.w, ext: [toolbarIcon] }), content, overlays, geo });
}

/**
 * A data: URL of a PNG.
 *
 * @param {Uint8Array} png - The PNG's bytes.
 * @returns {string} The URL.
 */
export const pngUrl = (png) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

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
export function storeShots({ browser, dir, toolbarIcon }) {
  const geo = geometry(1);
  return {
    geo,
    shoot: async (file, shot) => {
      const context = 'newContext' in browser ? await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 }) : null;
      const page = context ? await context.newPage() : await /** @type {import('playwright').BrowserContext} */ (browser).newPage();
      try {
        await page.setViewportSize({ width: W, height: H });
        await page.setContent(storeShotHtml({ ...shot, toolbarIcon, geo }), { waitUntil: 'load' });
        await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))));
        await mkdir(dir, { recursive: true });
        const out = path.join(dir, file);
        await writeFile(out, await page.screenshot({ type: 'png', scale: 'css', clip: { x: 0, y: 0, width: W, height: H } }));
        return out;
      } finally {
        await (context ?? page).close();
      }
    },
  };
}
