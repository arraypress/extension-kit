/**
 * Chrome's message lookup for an extension's unit tests: its real `_locales`
 * files, a locale's messages over `en`'s, named placeholders ("$SITE$" →
 * `{site: {content: '$1'}}`) filled from substitutions as
 * `chrome.i18n.getMessage` fills them, and refused as Chrome refuses them (a
 * placeholder that isn't defined). Node only. From the copies in Better
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

/** A named placeholder in a message, as Chrome reads one: `$SITE$` (letters, digits, `_`, `@`). */
const PLACEHOLDER = /\$([A-Za-z0-9_@]+)\$/g;

/**
 * A message with its named placeholders put in, as Chrome does when it loads an extension.
 *
 * @param {string} key - The message's name, for the error.
 * @param {Messages[string]} entry - The message.
 * @returns {string} The message, `$1`-style substitutions still to fill.
 * @throws {Error} When it names a placeholder it doesn't define: Chrome refuses to load such an extension.
 */
function withPlaceholders(key, entry) {
  const contents = new Map(Object.entries(entry.placeholders ?? {}).map(([name, { content }]) => [name.toLowerCase(), content]));
  return entry.message.replace(PLACEHOLDER, (_, name) => {
    const content = contents.get(name.toLowerCase());
    if (content === undefined) throw new Error(`Message “${key}” uses $${name}$ but has no such placeholder: Chrome wouldn't load the extension`);
    return content;
  });
}

/**
 * Fill a message's substitutions as Chrome does: `$1`–`$9` from the list ('' past its end), `$$`
 * a dollar sign; a `$` before anything else is dropped with what follows it.
 *
 * @param {string} message - The message, named placeholders already put in.
 * @param {readonly string[]} subs - The substitutions.
 * @returns {string} The text.
 */
function substituted(message, subs) {
  return message.replace(/\$(\$+|[\s\S])?/g, (_, next) => {
    if (next === undefined) return '';
    if (next.startsWith('$')) return next;
    return /[1-9]/.test(next) ? String(subs[Number(next) - 1] ?? '') : '';
  });
}

/**
 * `chrome.i18n.getMessage` over a locale's real messages, as Chrome reads them (checked against
 * Chromium): names found whatever their case, named placeholders and `$1`–`$9` filled, `$$` a
 * dollar sign, '' for a missing key, `undefined` for more than nine substitutions.
 *
 * @param {string} extensionDir - The extension's folder.
 * @param {string} [locale] - Default "en"; another locale is read over en.
 * @returns {(key: string, substitutions?: string | number | (string | number)[]) => string} The lookup.
 * @throws {Error} When a message names a placeholder it doesn't define (Chrome refuses to load the extension).
 *
 * @example
 * const t = messageLookup('extension');
 * t('optionsMoreActions', ['example.com']); // 'More actions for example.com'
 */
export function messageLookup(extensionDir, locale = 'en') {
  const read = { ...readMessages(extensionDir, 'en'), ...(locale === 'en' ? {} : readMessages(extensionDir, locale)) };
  const messages = new Map(Object.entries(read).map(([key, entry]) => [key.toLowerCase(), withPlaceholders(key, entry)]));
  return (key, substitutions = []) => {
    const subs = [substitutions].flat().map(String);
    if (subs.length > 9) return /** @type {string} */ (/** @type {unknown} */ (undefined));
    const message = messages.get(key.toLowerCase());
    return message === undefined ? '' : substituted(message, subs);
  };
}
