/**
 * The page side of the light/dark toolbar glyph: documents tell the service
 * worker whether they see a light or dark colour scheme, so it can swap the
 * glyph (toolbar/theme.js). The worker has no `matchMedia`, so documents
 * report: an extension's pages, its offscreen watcher, or a content script.
 * Kept tiny, as a content script may carry it.
 *
 * @module toolbar/scheme
 */

/** `chrome.storage.local`: the scheme last reported. This computer's, never synced. */
export const TOOLBAR_DARK_KEY = 'toolbarDark';

/** The report's message type: `{type: TOOLBAR_SCHEME, dark: boolean}`. */
export const TOOLBAR_SCHEME = 'toolbar-scheme';

/** The media query that matches a dark colour scheme. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * What a document reports through: `chrome.runtime`, or a fake.
 *
 * @typedef {{sendMessage(message: unknown): Promise<unknown>}} MessageSender
 */

/**
 * What `watchColorScheme` needs: `chrome` itself will do.
 *
 * @typedef {object} SchemeApi
 * @property {MessageSender} runtime `chrome.runtime`.
 * @property {{local: {get(keys: string): Promise<Record<string, any>>}}} storage `chrome.storage`.
 */

/**
 * The smallest `MediaQueryList`: `matchMedia(DARK_QUERY)`.
 *
 * @typedef {Pick<MediaQueryList, 'matches' | 'addEventListener'>} SchemeMedia
 */

/**
 * Send `dark` now if it differs from `known` (what's stored), then on each
 * change: a page load where nothing changed sends nothing.
 *
 * @param {SchemeMedia} media - `matchMedia(DARK_QUERY)`.
 * @param {boolean | undefined} known - What the worker last stored;
 *   undefined (unknown) sends once.
 * @param {(dark: boolean) => void} send - Delivers a report.
 * @returns {() => void} The check itself, for a document that has to poll
 *   (an offscreen document never hears `change`).
 */
export function reportColorScheme(media, known, send) {
  let last = known;
  const report = () => {
    if (media.matches === last) return;
    last = media.matches;
    send(last);
  };
  report();
  media.addEventListener('change', report);
  return report;
}

/**
 * A sender of scheme reports. The worker may be asleep or restarting: a lost
 * report is retried by the next change or page, so failures are dropped.
 *
 * @param {MessageSender} runtime - `chrome.runtime`.
 * @returns {(dark: boolean) => Promise<unknown>} Sends one report.
 */
export function schemeSender(runtime) {
  return (dark) => runtime.sendMessage({ type: TOOLBAR_SCHEME, dark }).catch(() => {});
}

/**
 * For an extension page: read what's stored, then report now if it differs
 * and on every change.
 *
 * @param {SchemeApi} api - `chrome`, or a fake with `runtime` and `storage.local`.
 * @param {SchemeMedia} [media] - Default `matchMedia(DARK_QUERY)`.
 * @returns {Promise<void>} Resolves once the first check has run.
 * @example
 * watchColorScheme(chrome).catch((error) => console.debug('Reporting the colour scheme:', error));
 */
export async function watchColorScheme(api, media = matchMedia(DARK_QUERY)) {
  const { [TOOLBAR_DARK_KEY]: stored } = await api.storage.local.get(TOOLBAR_DARK_KEY);
  reportColorScheme(media, stored === true, schemeSender(api.runtime));
}
