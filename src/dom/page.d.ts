/**
 * Small DOM helpers for extension pages built on chrome-ui.css: finding an
 * element with its real type, the markup of a value row, the About card's
 * links, and the "Saved" indicator. Browser only.
 *
 * @module dom/page
 */
import type { AboutLinks } from '../about/links.js';
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
export declare function byId<C extends typeof HTMLElement>(id: string, Type?: C, root?: ParentNode & {
    getElementById(id: string): HTMLElement | null;
}): InstanceType<C>;
/**
 * A row with a label and a value at its end, as chrome://settings shows a
 * keyboard shortcut: `.row` > `.label` + `.row-value`.
 *
 * @param {string} label - The row's text.
 * @param {string} value - What sits at its end.
 * @param {Document} [doc] - Where to make it. Default `document`.
 * @returns {HTMLDivElement} The row.
 */
export declare function valueRow(label: string, value: string, doc?: Document): HTMLDivElement;
/**
 * Point the About card's link rows (`#help`, `#report-issue`,
 * `#privacy-policy`, all `<a>`) at their addresses.
 *
 * @param {AboutLinks} links - From `githubAboutLinks`.
 * @param {Document} [doc] - The page. Default `document`.
 * @returns {void}
 * @throws {Error} When a link row is missing.
 */
export declare function setAboutLinks(links: AboutLinks, doc?: Document): void;
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
export declare function statusFlasher(element: HTMLElement, ms: number): (text: string) => void;
