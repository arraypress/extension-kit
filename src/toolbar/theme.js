/**
 * The worker side of the light/dark toolbar glyph, as Chrome's own toolbar
 * icons do. The service worker can't see the scheme (no `matchMedia`), so
 * documents report it (toolbar/scheme.js); this stores the last report per
 * computer and shows the matching glyph. `setIcon` changes only the image: a
 * badge still draws over it.
 *
 * An extension with nothing of its own on every page can keep an offscreen
 * document open to hear a theme change (`watchFromOffscreen`,
 * toolbar/offscreen.js).
 *
 * @module toolbar/theme
 */

import { TOOLBAR_DARK_KEY, TOOLBAR_SCHEME } from './scheme.js';

/** Where the offscreen scheme watcher lives, from the extension's root. */
export const OFFSCREEN_PATH = 'offscreen/offscreen.html';

/** Where the rendered glyphs live (build/toolbar-icons.js writes them). */
export const TOOLBAR_ICON_DIR = '/icons/toolbar';

/**
 * @typedef {{16: string, 32: string, 48: string}} ToolbarIconPaths
 */

/**
 * The worker APIs the toolbar theme uses: pieces of `chrome`, or fakes.
 *
 * @typedef {object} ToolbarThemeApi
 * @property {{get(keys: string): Promise<Record<string, any>>, set(items: Record<string, unknown>): Promise<void>}} storage
 *   `chrome.storage.local`.
 * @property {{setIcon(details: {path: ToolbarIconPaths}): Promise<void>}} action `chrome.action`.
 * @property {string} extensionId `chrome.runtime.id`: reports from anyone else are ignored.
 */

/**
 * @typedef {object} ToolbarTheme
 * @property {() => Promise<void>} restore Show the dark glyph again if that's what was
 *   seen last: after a restart or re-enable Chrome shows the manifest's light one.
 * @property {(message: unknown, sender?: {id?: string}) => boolean} onMessage Handle a
 *   scheme report; returns whether it was one (handled or ignored), so a worker's
 *   message listener can stop there.
 * @property {() => Promise<void>} settled Resolves once every report so far is handled.
 */

/**
 * The glyph for a scheme; the manifest's `default_icon` is the light one.
 * Paths start with "/": Chrome resolves `setIcon` paths against the worker's
 * own address, where a relative one fails to load.
 *
 * @param {boolean} dark - The dark scheme's glyph, else the light one's.
 * @returns {ToolbarIconPaths} Paths by size, for `chrome.action.setIcon`.
 * @example
 * toolbarIcon(true); // { 16: '/icons/toolbar/dark-16.png', 32: …, 48: … }
 */
export function toolbarIcon(dark) {
  const scheme = dark ? 'dark' : 'light';
  return {
    16: `${TOOLBAR_ICON_DIR}/${scheme}-16.png`,
    32: `${TOOLBAR_ICON_DIR}/${scheme}-32.png`,
    48: `${TOOLBAR_ICON_DIR}/${scheme}-48.png`,
  };
}

/**
 * The worker's toolbar theme: one report at a time, so two quick ones can't
 * store one scheme and show the other.
 *
 * @param {ToolbarThemeApi} api - Storage, the action and this extension's id.
 * @returns {ToolbarTheme} The theme's handlers.
 */
export function createToolbarTheme({ storage, action, extensionId }) {
  /** @type {Promise<void>} */
  let queue = Promise.resolve();
  /** @param {boolean} dark */
  const show = (dark) => action.setIcon({ path: toolbarIcon(dark) });

  return {
    restore() {
      queue = queue.then(async () => {
        const { [TOOLBAR_DARK_KEY]: dark } = await storage.get(TOOLBAR_DARK_KEY);
        if (dark === true) await show(true);
      }).catch((error) => console.error('Restoring the toolbar icon:', error));
      return queue;
    },

    onMessage(message, sender) {
      const report = /** @type {{type?: unknown, dark?: unknown} | null | undefined} */ (message);
      if (report?.type !== TOOLBAR_SCHEME) return false;
      const { dark } = report;
      if (sender?.id !== extensionId || typeof dark !== 'boolean') return true;
      queue = queue.then(async () => {
        const { [TOOLBAR_DARK_KEY]: was = false } = await storage.get(TOOLBAR_DARK_KEY);
        if (was === dark) return;
        // Shown first: if Chrome refuses the icon, nothing is stored, and the next report tries again.
        await show(dark);
        await storage.set({ [TOOLBAR_DARK_KEY]: dark });
      }).catch((error) => console.error('Changing the toolbar icon:', error));
      return true;
    },

    settled: () => queue,
  };
}

/**
 * What opening the offscreen watcher needs: pieces of `chrome`, or fakes.
 *
 * @typedef {object} OffscreenApi
 * @property {{createDocument(details: {url: string, reasons: string[], justification: string}): Promise<void>, Reason: {MATCH_MEDIA: string}}} offscreen
 *   `chrome.offscreen`.
 * @property {{getContexts(filter: {contextTypes: 'OFFSCREEN_DOCUMENT'[]}): Promise<unknown[]>}} runtime `chrome.runtime`.
 */

/** @type {Promise<boolean> | null} */
let opening = null;

/** Why the offscreen document is open, as Chrome is told. */
const SCHEME_JUSTIFICATION = 'Reads whether Chrome is in light or dark mode, to show the matching toolbar icon.';

/**
 * Open the offscreen document that watches the scheme (reason MATCH_MEDIA),
 * unless it's open. It stays open: it's one small page in the extension's own
 * process, and the only way to hear a theme change while no page of ours is
 * open. Chrome closes it when the browser quits, so call this each time the
 * worker starts. Concurrent calls share one attempt.
 *
 * @param {OffscreenApi} api - `chrome.offscreen` and `chrome.runtime`.
 * @param {string} [url] - The document, from the extension's root. Default {@link OFFSCREEN_PATH}.
 * @param {string} [justification] - What the document is for, when it does more than watch the
 *   scheme (it answers for Chrome's on-device model too, `serveModelOffscreen`): Chrome keeps it
 *   with the document, so it has to be the whole truth.
 * @returns {Promise<boolean>} Whether it opened one (false: already open).
 */
export function watchFromOffscreen({ offscreen, runtime }, url = OFFSCREEN_PATH, justification = SCHEME_JUSTIFICATION) {
  opening ??= (async () => {
    const open = await runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (open.length) return false;
    await offscreen.createDocument({
      url,
      reasons: [offscreen.Reason.MATCH_MEDIA],
      justification,
    });
    return true;
  })().finally(() => { opening = null; });
  return opening;
}

/**
 * Everything `startToolbarTheme` wires up: `chrome` itself will do.
 *
 * @typedef {object} ToolbarWorkerApi
 * @property {{local: ToolbarThemeApi['storage']}} storage `chrome.storage`.
 * @property {ToolbarThemeApi['action']} action `chrome.action`.
 * @property {OffscreenApi['offscreen']} offscreen `chrome.offscreen`.
 * @property {OffscreenApi['runtime'] & {id: string, onMessage: {addListener(listener: (message: unknown, sender: {id?: string}) => boolean): void}}} runtime
 *   `chrome.runtime`.
 */

/**
 * The whole worker side for an extension that watches from an offscreen
 * document: restore the last glyph, open the watcher, and handle its reports.
 * Call it at the worker's top level, so the listener attaches every time the
 * worker wakes.
 *
 * @param {ToolbarWorkerApi} api - `chrome`, or a fake.
 * @param {{url?: string, justification?: string}} [document] - The offscreen document and what
 *   it's for, when it isn't the kit's defaults ({@link watchFromOffscreen}).
 * @returns {ToolbarTheme} The theme, for tests.
 * @example
 * // background.js
 * startToolbarTheme(chrome);
 */
export function startToolbarTheme(api, { url, justification } = {}) {
  const theme = createToolbarTheme({ storage: api.storage.local, action: api.action, extensionId: api.runtime.id });
  theme.restore();
  watchFromOffscreen(api, url, justification).catch((error) => console.error('Opening the colour scheme watcher:', error));
  api.runtime.onMessage.addListener((message, sender) => {
    theme.onMessage(message, sender);
    return false;
  });
  return theme;
}
