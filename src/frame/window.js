/**
 * Chrome's window around a page: the macOS tab strip and toolbar (light or dark, the default
 * theme), drawn as HTML. Shared by the store screenshots (`build/store-frame`, which lays it on a
 * 1280×800 canvas in Playwright) and by extension pages, which draw it on a canvas around a
 * capture through {@link windowChromeSvg} (an SVG image with the HTML inside, which Chrome draws
 * without tainting the canvas). The markup is XML-clean so both can use it.
 *
 * Window metrics follow Chrome's 2023 refresh on macOS (tabs 34px high in a 42px strip, a 46px
 * toolbar with a pill omnibox).
 *
 * @module frame/window
 */

/** The tab strip's and the toolbar's heights (px): the content starts below both. */
export const WINDOW_BARS = Object.freeze({ strip: 42, toolbar: 46 });

/** The window's default width (px): the store screenshot's. */
export const WINDOW_W = 1152;

/**
 * @param {unknown} s - Text.
 * @returns {string} It, escaped for HTML text and attributes.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Material icon paths (24×24). */
const P = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  forward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  reload: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  puzzle: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
  star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  sound: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  muted: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
};

/**
 * A Material icon as inline SVG, in the text colour.
 *
 * @param {keyof typeof P} name - Which icon.
 * @param {number} [size] - Width and height in px. Default 20.
 * @returns {string} The SVG markup.
 */
const icon = (name, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="currentColor" d="${P[name]}"/></svg>`;

/**
 * A letter favicon for made-up sites (no real brands).
 *
 * @param {string} letter - The letter.
 * @param {string} bg - Background colour.
 * @param {string} [fg] - Letter colour. Default white.
 * @returns {string} A data: URL of the SVG.
 */
export const letterIcon = (letter, bg, fg = '#fff') =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${bg}"/><text x="8" y="12" font-family="-apple-system,Helvetica,Arial" font-size="11" font-weight="700" text-anchor="middle" fill="${fg}">${letter}</text></svg>`)}`;

/** Chrome's light and dark window colours, and the canvas behind. */
export const THEMES = {
  light: {
    bg: '#eef2f8', caption: '#1f1f1f', sub: '#444746',
    frame: '#dde3ea', tabText: '#1f1f1f', tabTextInactive: '#474747', tabSep: '#a8afb8', activeTab: '#ffffff',
    toolbar: '#ffffff', toolbarIcon: '#474747', omnibox: '#e9eef6', url: '#1f1f1f', urlDim: '#5e5e5e',
    contentLine: '#d3d7dc', shadow: '0 24px 60px rgba(31,45,70,.20), 0 0 0 .5px rgba(0,0,0,.18)',
  },
  dark: {
    bg: '#1b1c1f', caption: '#e3e3e3', sub: '#c4c7c5',
    frame: '#1f1f1f', tabText: '#e3e3e3', tabTextInactive: '#c7c7c7', tabSep: '#5f6368', activeTab: '#3c3c3c',
    toolbar: '#3c3c3c', toolbarIcon: '#c7c7c7', omnibox: '#282828', url: '#e3e3e3', urlDim: '#a8a8a8',
    contentLine: '#2a2a2a', shadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 .5px rgba(255,255,255,.14)',
  },
};

/** @typedef {keyof typeof THEMES} Theme */

/**
 * One tab in the drawn window.
 *
 * @typedef {object} Tab
 * @property {string} title Its title.
 * @property {string} icon Its favicon's URL.
 * @property {boolean} [active] The selected tab.
 * @property {boolean} [audible] Playing sound.
 * @property {boolean} [muted] Muted.
 */

const TAB_H = 34;

/**
 * Lay out tabs like Chrome: equal widths up to 240px, shrinking to fit.
 *
 * @param {readonly Tab[]} tabs - The tabs.
 * @param {number} w - The window's width.
 * @returns {{ x: number, width: number }[]} Each tab's window-relative x and width.
 */
function tabLayout(tabs, w) {
  const left = 84;
  const right = 60;
  const max = 240;
  const avail = w - left - right - 36;
  const width = Math.min(max, Math.floor(avail / tabs.length));
  return tabs.map((_, i) => ({ x: left + i * width, width }));
}

/**
 * The window's tab strip and toolbar, as HTML. Positions are window-relative.
 *
 * @param {object} options - What to draw.
 * @param {readonly Tab[]} options.tabs - The tabs, left to right.
 * @param {string} options.url - The address bar's text.
 * @param {string} [options.urlHost] - The start of `url` to show in full; the rest is dimmed.
 * @param {Theme} [options.theme] - Default light.
 * @param {number} [options.w] - The window's width. Default {@link WINDOW_W}.
 * @param {readonly string[]} [options.ext] - Toolbar extension icons' URLs.
 * @returns {string} The HTML, with its own styles.
 */
export function windowChrome({ tabs, url, urlHost, theme = 'light', w = WINDOW_W, ext = [] }) {
  const t = THEMES[theme];
  const layout = tabLayout(tabs, w);
  const tabHtml = tabs.map((tab, i) => {
    const { x, width } = layout[i];
    const sepAfter = i < tabs.length - 1 && !tab.active && !tabs[i + 1].active;
    const alert = tab.muted ? icon('muted', 16) : tab.audible ? icon('sound', 16) : '';
    const showClose = tab.active || width >= 120;
    return `<div class="tab${tab.active ? ' active' : ''}" style="left:${x}px;width:${width}px">
      <img class="fav" src="${tab.icon}" width="16" height="16" alt=""/>
      <span class="title">${esc(tab.title)}</span>
      ${alert ? `<span class="alert">${alert}</span>` : ''}
      ${showClose ? `<span class="x">${icon('close', 14)}</span>` : ''}
    </div>${sepAfter ? `<span class="sep" style="left:${x + width - 1}px"></span>` : ''}`;
  }).join('');
  const last = layout[layout.length - 1];
  const plusX = last.x + last.width + 4;
  const extIcons = ext.map((src) => `<img src="${src}" width="16" height="16" alt="" style="margin:0 9px"/>`).join('');
  return `
  <div class="strip">
    <span class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    ${tabHtml}
    <span class="plus" style="left:${plusX}px">${icon('add', 18)}</span>
  </div>
  <div class="toolbar">
    <span class="tb">${icon('back')}</span><span class="tb dim">${icon('forward')}</span><span class="tb">${icon('reload')}</span>
    <div class="omni"><span class="site">${icon('tune', 16)}</span><span class="url">${urlHost ? `${esc(urlHost)}<span class="dim">${esc(url.slice(urlHost.length))}</span>` : esc(url)}</span><span class="star">${icon('star', 18)}</span></div>
    ${extIcons}<span class="tb">${icon('puzzle')}</span>
    <span class="avatar">${icon('person', 18)}</span><span class="tb">${icon('more')}</span>
  </div>
  <style>
    .strip { position: relative; height: ${WINDOW_BARS.strip}px; background: ${t.frame}; }
    .lights { position: absolute; left: 16px; top: 15px; display: flex; gap: 8px; }
    .lights i { width: 12px; height: 12px; border-radius: 50%; display: block; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.12); }
    .tab { position: absolute; bottom: 0; height: ${TAB_H}px; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 14px; box-sizing: border-box; color: ${t.tabTextInactive}; font: 12px/16px system-ui; }
    .tab.active { background: ${t.activeTab}; color: ${t.tabText}; border-radius: 10px 10px 0 0; z-index: 1; }
    .tab.active::before, .tab.active::after { content: ''; position: absolute; bottom: 0; width: 10px; height: 10px; }
    .tab.active::before { left: -10px; background: radial-gradient(circle at 0 0, transparent 10px, ${t.activeTab} 10.5px); }
    .tab.active::after { right: -10px; background: radial-gradient(circle at 100% 0, transparent 10px, ${t.activeTab} 10.5px); }
    .tab .fav { flex: none; }
    .tab .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent); }
    .tab .alert, .tab .x { flex: none; display: flex; color: ${t.toolbarIcon}; }
    .sep { position: absolute; bottom: 9px; width: 1px; height: 18px; background: ${t.tabSep}; }
    .plus { position: absolute; top: 11px; display: flex; color: ${t.toolbarIcon}; padding: 2px; }
    .toolbar { height: ${WINDOW_BARS.toolbar}px; background: ${t.toolbar}; display: flex; align-items: center; gap: 4px; padding: 0 8px; box-sizing: border-box; border-bottom: 1px solid ${t.contentLine}; }
    .tb { width: 34px; height: 34px; display: grid; place-items: center; color: ${t.toolbarIcon}; flex: none; }
    .tb.dim { opacity: .45; }
    .omni { flex: 1; min-width: 0; height: 34px; margin: 0 8px; border-radius: 17px; background: ${t.omnibox}; display: flex; align-items: center; gap: 10px; padding: 0 12px; color: ${t.url}; font: 14px system-ui; }
    .omni .site { display: flex; color: ${t.toolbarIcon}; }
    .omni .url { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .omni .dim { color: ${t.urlDim}; }
    .omni .star { display: flex; color: ${t.toolbarIcon}; }
    .avatar { flex: none; width: 26px; height: 26px; margin: 0 4px; border-radius: 50%; background: #7cacf8; color: #fff; display: grid; place-items: end center; overflow: hidden; }
  </style>`;
}


/**
 * The window's tab strip and toolbar as a standalone SVG image, `w` wide and the bars' height
 * high (scale it when drawing), for an extension page to draw on a canvas: `new Image()` with a
 * `data:image/svg+xml` URL of it, then `drawImage`. Images in it (the tabs' icons, `ext`) must be
 * `data:` URLs: an SVG image loads nothing else.
 *
 * @param {Parameters<typeof windowChrome>[0]} options - As {@link windowChrome}.
 * @returns {string} The SVG markup.
 * @example
 * const svg = windowChromeSvg({ tabs: [{ title: 'Example', icon: letterIcon('E', '#1a73e8'), active: true }], url: 'example.com', w: 1280 });
 */
export function windowChromeSvg(options) {
  const w = options.w ?? WINDOW_W;
  const h = WINDOW_BARS.strip + WINDOW_BARS.toolbar;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<foreignObject x="0" y="0" width="${w}" height="${h}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;margin:0;-webkit-font-smoothing:antialiased">${windowChrome({ ...options, w })}</div>`
    + '</foreignObject></svg>';
}
