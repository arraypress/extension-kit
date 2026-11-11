/**
 * Chrome's own confirmation in a web page: the dark pill with a check mark that Chrome shows at
 * the bottom of the window for “Link copied”, for a content script that just did something the
 * person asked for from a menu or a shortcut. In a closed shadow root (the kit's `pageOverlay`)
 * the page can't style, as a popover in the top layer, over anything the page stacks; light on
 * a dark system. One at a time: a new one replaces the last.
 *
 * @module content/page-toast
 */

import { pageOverlay } from './overlay.js';

/** How long it shows, in ms (as Chrome's “Link copied”). */
export const PAGE_TOAST_MS = 4000;

/** The toast's look: Chrome's cr-toast colours, its 48px pill, the check mark. */
const CSS = `
  .toast { position: fixed; inset: auto auto 24px 50%; margin: 0; transform: translateX(-50%); z-index: 2147483647;
    display: flex; align-items: center; gap: 12px; min-height: 48px; max-width: calc(100vw - 48px);
    box-sizing: border-box; padding: 0 20px 0 16px; border: 0; border-radius: 24px; overflow: hidden;
    background: rgb(48 48 48); color: rgb(242 242 242); box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.28);
    font: 13px/20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-align: start;
    animation: in 150ms ease-out; }
  .toast:not(:popover-open)[popover] { display: none; }
  .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { width: 20px; height: 20px; fill: currentColor; flex: none; }
  @media (prefers-color-scheme: dark) { .toast { background: rgb(227 227 227); color: rgb(31 31 31); } }
  @keyframes in { from { opacity: 0; translate: 0 8px; } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }`;

/** Chrome's check mark (Material “check”). */
const CHECK = 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';

/**
 * Show Chrome's confirmation toast in a page.
 *
 * @param {Document} doc - The page.
 * @param {string} text - What it says (“Link copied”).
 * @param {{name?: string, ms?: number}} [options] - `name`: the overlay's element name (the
 *   extension's own, with a hyphen); `ms`: how long it shows. Defaults `extension-toast`, {@link PAGE_TOAST_MS}.
 * @returns {() => void} Takes it away now.
 * @example
 * showPageToast(document, chrome.i18n.getMessage('copied'), { name: 'better-copy-toast' });
 */
export function showPageToast(doc, text, { name = 'extension-toast', ms = PAGE_TOAST_MS } = {}) {
  const { root, remove } = pageOverlay(doc, { name, css: CSS });
  const toast = doc.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute('d', CHECK);
  svg.append(path);
  const words = doc.createElement('span');
  words.className = 'text';
  words.textContent = text;
  toast.append(svg, words);
  root.append(toast);
  // The top layer, over the page's own fixed bars and open dialogs, where popovers exist.
  if (typeof toast.showPopover === 'function') {
    toast.popover = 'manual';
    toast.showPopover();
  }
  const timer = setTimeout(remove, ms);
  return () => {
    clearTimeout(timer);
    remove();
  };
}
