/**
 * Localising extension pages from `_locales/<lang>/messages.json`. Markup
 * opts in with `data-i18n="key"` (sets the text) or
 * `data-i18n-<attribute>="key"` (sets that attribute, e.g.
 * `data-i18n-placeholder`, `data-i18n-aria-label`).
 *
 * @module dom/i18n
 */

/**
 * `chrome.i18n`, as far as pages need it.
 *
 * @typedef {object} I18nApi
 * @property {(key: string, substitutions?: string | string[]) => string} getMessage
 * @property {() => string} getUILanguage
 */

/**
 * A message lookup that never comes back blank: a missing key shows as
 * itself, so a typo is visible on screen instead of an empty label.
 *
 * @param {Pick<I18nApi, 'getMessage'>} i18n - `chrome.i18n`.
 * @returns {(key: string, substitutions?: string | string[]) => string} Looks a key up.
 * @example
 * const t = translator(chrome.i18n);
 * t('optionsVersion', ['1.0.0']); // 'Version 1.0.0'
 */
export function translator(i18n) {
  return (key, substitutions) => i18n.getMessage(key, substitutions) || key;
}

/**
 * Fill every `data-i18n*` attribute under `root`, and, for a whole document,
 * set its `lang` to Chrome's UI language.
 *
 * @param {ParentNode} root - A document or an element.
 * @param {I18nApi} i18n - `chrome.i18n`.
 * @returns {void}
 */
export function localize(root, i18n) {
  const t = translator(i18n);
  for (const element of root.querySelectorAll('*')) {
    for (const { name, value } of [...element.attributes]) {
      if (name === 'data-i18n') element.textContent = t(value);
      else if (name.startsWith('data-i18n-')) element.setAttribute(name.slice('data-i18n-'.length), t(value));
    }
  }
  if ('documentElement' in root) /** @type {Document} */ (root).documentElement.lang = i18n.getUILanguage();
}
