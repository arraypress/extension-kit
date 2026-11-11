export type Messages = Record<string, {
    message: string;
    description?: string;
    placeholders?: Record<string, {
        content: string;
    }>;
}>;
/**
 * One locale's messages.json.
 *
 * @typedef {Record<string, {message: string, description?: string, placeholders?: Record<string, {content: string}>}>} Messages
 */
/**
 * Read a locale's messages.
 *
 * @param {string} extensionDir - The extension's folder (with `_locales/`).
 * @param {string} locale - "en" or "en_GB".
 * @returns {Messages} Its messages.
 * @example
 * readMessages('extension', 'en_GB').optionsColour.message;
 */
export declare function readMessages(extensionDir: string, locale: string): Messages;
/**
 * `chrome.i18n.getMessage` over a locale's real messages ('' for a missing key, as Chrome gives).
 *
 * @param {string} extensionDir - The extension's folder.
 * @param {string} [locale] - Default "en"; another locale is read over en.
 * @returns {(key: string, substitutions?: string | string[]) => string} The lookup.
 * @example
 * const t = messageLookup('extension');
 * t('optionsMoreActions', ['example.com']); // 'More actions for example.com'
 */
export declare function messageLookup(extensionDir: string, locale?: string): (key: string, substitutions?: string | string[]) => string;
