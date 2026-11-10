/**
 * What every extension page does first: report its light or dark scheme
 * for the toolbar glyph, fill its `data-i18n` text, and set its title.
 * Browser only.
 *
 * @module dom/setup
 */

import { localize, translator } from './i18n.js';
import { DARK_QUERY, watchColorScheme } from '../toolbar/scheme.js';

/** @import { I18nApi } from './i18n.js' */
/** @import { SchemeApi, SchemeMedia } from '../toolbar/scheme.js' */

/**
 * What {@link setUpPage} takes besides `chrome`.
 *
 * @typedef {object} PageSetup
 * @property {string} [title] The title's message (“optionsTitle”). Default: the title is left as it is.
 * @property {string | string[]} [substitutions] The title's placeholders (the extension's name).
 * @property {Document} [doc] The page. Default `document`.
 * @property {SchemeMedia} [media] The scheme to report. Default the page's `matchMedia(DARK_QUERY)`.
 */

/**
 * Set up an extension page: start reporting its colour scheme (a failure is
 * only logged: the glyph is cosmetic), localise it, and set its title.
 *
 * @param {SchemeApi & {i18n: I18nApi}} api - `chrome`.
 * @param {PageSetup} [options] - The title's message, and the page.
 * @returns {(key: string, substitutions?: string | string[]) => string} The page's message lookup
 *   (`translator(chrome.i18n)`).
 * @example
 * const t = setUpPage(chrome, { title: 'optionsTitle', substitutions: [t('extShortName')] });
 * // The popup, whose title Chrome doesn't show:
 * const t = setUpPage(chrome);
 */
export function setUpPage(api, { title, substitutions, doc = document, media } = {}) {
  const t = translator(api.i18n);
  // The toolbar glyph follows this page's light or dark scheme.
  watchColorScheme(api, media ?? /** @type {Window} */ (doc.defaultView).matchMedia(DARK_QUERY))
    .catch((error) => console.debug('Reporting the colour scheme:', error));
  localize(doc, api.i18n);
  if (title) doc.title = t(title, substitutions);
  return t;
}
