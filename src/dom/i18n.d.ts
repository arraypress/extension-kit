/**
 * Localising extension pages from `_locales/<lang>/messages.json`. Markup
 * opts in with `data-i18n="key"` (sets the text) or
 * `data-i18n-<attribute>="key"` (sets that attribute, e.g.
 * `data-i18n-placeholder`, `data-i18n-aria-label`).
 *
 * The extension's name lives in one message, `extShortName`; a message that
 * names the extension takes it as a placeholder whose content is `$1`
 * (`"About $NAME$"`), and every lookup made without substitutions fills it
 * in, in markup and script alike.
 *
 * @module dom/i18n
 */
export type I18nApi = {
    getMessage: (key: string, substitutions?: string | string[]) => string;
    getUILanguage: () => string;
};
/**
 * `chrome.i18n`, as far as pages need it.
 *
 * @typedef {object} I18nApi
 * @property {(key: string, substitutions?: string | string[]) => string} getMessage
 * @property {() => string} getUILanguage
 */
/**
 * A message lookup that never comes back blank: a missing key shows as
 * itself, so a typo is visible on screen instead of an empty label. Without
 * substitutions, `$1` is the extension's name (`extShortName`).
 *
 * @param {Pick<I18nApi, 'getMessage'>} i18n - `chrome.i18n`.
 * @returns {(key: string, substitutions?: string | string[]) => string} Looks a key up.
 * @example
 * const t = translator(chrome.i18n);
 * t('optionsVersion', ['1.0.0']); // 'Version 1.0.0'
 * t('optionsAbout');              // 'About Upright', from "About $NAME$"
 */
export declare function translator(i18n: Pick<I18nApi, 'getMessage'>): (key: string, substitutions?: string | string[]) => string;
/**
 * Fill every `data-i18n*` attribute under `root` (a message that names the
 * extension gets its name), and, for a whole document, set its `lang` to
 * Chrome's UI language.
 *
 * @param {ParentNode} root - A document or an element.
 * @param {I18nApi} i18n - `chrome.i18n`.
 * @returns {void}
 */
export declare function localize(root: ParentNode, i18n: I18nApi): void;
/**
 * A count in words, its number written as the person's language writes numbers: one message for
 * one, another (with the number as `$1`) for any other count.
 *
 * @param {number} count - How many.
 * @param {string} one - The message for one (`"1 colour"`).
 * @param {string} many - The message for others (`"$COUNT$ colours"`, its placeholder `$1`).
 * @param {{t: (key: string, substitutions?: string | string[]) => string, lang: string}} words - The
 *   page's message lookup and the UI language.
 * @returns {string} The words.
 * @example
 * counted(1200, 'panelColoursOne', 'panelColours', { t, lang: 'en-GB' }); // '1,200 colours'
 */
export declare const counted: (count: number, one: string, many: string, { t, lang }: {
    t: (key: string, substitutions?: string | string[]) => string;
    lang: string;
}) => string;
