/**
 * Chrome's message lookup for an extension's unit tests: its real `_locales`
 * files, a locale's messages over `en`'s, named placeholders ("$SITE$" →
 * `{site: {content: '$1'}}`) filled from substitutions as
 * `chrome.i18n.getMessage` fills them. Node only. From the copies in Better
 * Prices, Better Downloads, Better Saves and Clean Links (`test/helpers/i18n.js`).
 *
 * @module testing/messages
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
export function readMessages(extensionDir, locale) {
  return JSON.parse(readFileSync(path.join(extensionDir, '_locales', locale, 'messages.json'), 'utf8'));
}

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
export function messageLookup(extensionDir, locale = 'en') {
  const messages = { ...readMessages(extensionDir, 'en'), ...(locale === 'en' ? {} : readMessages(extensionDir, locale)) };
  return (key, substitutions = []) => {
    const entry = messages[key];
    if (!entry) return '';
    const subs = [substitutions].flat();
    return entry.message.replace(/\$([A-Za-z_]+)\$/g, (_, name) => (entry.placeholders?.[name.toLowerCase()]?.content ?? '')
      .replace(/\$(\d)/g, (/** @type {string} */ __, /** @type {string} */ n) => subs[Number(n) - 1] ?? ''));
  };
}
