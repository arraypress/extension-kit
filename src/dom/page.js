/**
 * Small DOM helpers for extension pages built on chrome-ui.css: finding an
 * element with its real type, the markup of a value row, the About card's
 * links, and the "Saved" indicator. Browser only.
 *
 * @module dom/page
 */

/** @import { AboutLinks } from '../about/links.js' */

/**
 * The element with `id`, checked to be a `Type`, so the page's code gets the
 * real type (an `HTMLInputElement` has `.checked`) and fails loudly when the
 * markup and the script disagree.
 *
 * @template {typeof HTMLElement} C
 * @param {string} id - The element's id.
 * @param {C} [Type] - Its class. Default `HTMLElement`.
 * @param {ParentNode & {getElementById(id: string): HTMLElement | null}} [root] - Where to look. Default `document`.
 * @returns {InstanceType<C>} The element.
 * @throws {Error} When there is no such element, or it isn't a `Type`.
 * @example
 * const days = byId('inactiveDays', HTMLInputElement);
 * days.valueAsNumber; // typed
 */
export function byId(id, Type = /** @type {C} */ (HTMLElement), root = document) {
  /** @type {Element | null} */
  const element = root.getElementById(id);
  if (!element) throw new Error(`#${id} is missing`);
  if (!(element instanceof Type)) throw new Error(`#${id} is a ${element.constructor.name}, not a ${Type.name}`);
  return /** @type {InstanceType<C>} */ (element);
}

/**
 * A row with a label and a value at its end, as chrome://settings shows a
 * keyboard shortcut: `.row` > `.label` + `.row-value`.
 *
 * @param {string} label - The row's text.
 * @param {string} value - What sits at its end.
 * @param {Document} [doc] - Where to make it. Default `document`.
 * @returns {HTMLDivElement} The row.
 */
export function valueRow(label, value, doc = document) {
  const row = doc.createElement('div');
  row.className = 'row';
  const text = doc.createElement('span');
  text.className = 'label';
  text.textContent = label;
  const end = doc.createElement('span');
  end.className = 'row-value';
  end.textContent = value;
  row.append(text, end);
  return row;
}

/**
 * Point the About card's link rows (`#help`, `#report-issue`,
 * `#privacy-policy`, all `<a>`) at their addresses.
 *
 * @param {AboutLinks} links - From `githubAboutLinks`.
 * @param {Document} [doc] - The page. Default `document`.
 * @returns {void}
 * @throws {Error} When a link row is missing.
 */
export function setAboutLinks(links, doc = document) {
  // The page's own class, so this works in any window (and in jsdom).
  const { HTMLAnchorElement: Anchor } = /** @type {Window & typeof globalThis} */ (doc.defaultView);
  byId('help', Anchor, doc).href = links.help;
  byId('report-issue', Anchor, doc).href = links.reportIssue;
  byId('privacy-policy', Anchor, doc).href = links.privacyPolicy;
}

/**
 * The "Saved" indicator: a `.save-status` element that shows a text, then
 * fades out after `ms`. A new flash restarts the wait.
 *
 * @param {HTMLElement} element - The `.save-status` element.
 * @param {number} ms - How long it stays.
 * @returns {(text: string) => void} Shows `text`.
 * @example
 * const flash = statusFlasher(byId('status'), 1500);
 * flash('Saved');
 */
export function statusFlasher(element, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return (text) => {
    element.textContent = text;
    element.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('show'), ms);
  };
}
