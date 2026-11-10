/**
 * Chrome's toast (cr-toast), bottom left, as chrome://bookmarks shows one
 * after a delete: "Deleted “Research”  Undo". One per page, made by
 * {@link createToast}; a new message replaces the last and restarts the wait.
 *
 * It's a manual `popover`, so it shows in the top layer: over anything the
 * page stacks (a content script's toast over a site's own fixed bars), and
 * never clipped by an ancestor.
 *
 * @module ui/toast
 */

import { rootDocument } from '../dom/focus.js';

/** How long chrome://bookmarks shows a toast (its cr-toast-manager's `duration`), in ms. */
export const TOAST_MS = 10_000;

/**
 * What {@link createToast} takes.
 *
 * @typedef {object} ToastOptions
 * @property {string} [undoLabel] The undo button's text. Default "Undo".
 * @property {number} [duration] How long a toast stays, in ms. Default {@link TOAST_MS}.
 * @property {number} [undoDuration] How long one with Undo stays. Default `duration`.
 * @property {ParentNode} [root] Where the toast goes: an element, or a shadow root (a content
 *   script's). Default the page's `body`.
 * @property {Document} [doc] The page. Default `root`'s document, else `document`.
 */

/**
 * A page's toast.
 *
 * @typedef {object} Toast
 * @property {HTMLElement} element The `#toast` element (`role="status"`, `popover="manual"`), in
 *   `root`; `:popover-open` while it shows.
 * @property {(text: string, undo?: (() => unknown) | null) => void} show Show `text`, with an Undo
 *   button that hides the toast and runs `undo` when one is given.
 * @property {() => void} hide Take it down (and its Undo with it).
 */

/**
 * Make the page's toast: `<div id="toast" class="toast" role="status"
 * popover="manual">` with `#toast-text` and an Undo button `#toast-undo`,
 * closed until shown. Make it when the page loads, so screen readers know the
 * live region before it speaks.
 *
 * @param {ToastOptions} [options] - The Undo text, how long it stays, and where it goes.
 * @returns {Toast} The toast.
 * @example
 * const toast = createToast();
 * await deleteWorkspace(workspace);
 * toast.show(`Deleted “${workspace.name}”`, () => restore(workspace));
 * // In a content script's shadow root:
 * createToast({ root: host.attachShadow({ mode: 'open' }), duration: 4000 });
 */
export function createToast({ undoLabel = 'Undo', duration = TOAST_MS, undoDuration = duration, root, doc = rootDocument(root) } = {}) {
  const toast = doc.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.popover = 'manual';
  const text = doc.createElement('span');
  text.id = 'toast-text';
  const undoButton = doc.createElement('button');
  undoButton.id = 'toast-undo';
  undoButton.type = 'button';
  undoButton.textContent = undoLabel;
  undoButton.hidden = true;
  toast.append(text, undoButton);
  (root ?? doc.body).append(toast);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(() => unknown) | null} */
  let undoLast = null;

  const hide = () => {
    clearTimeout(timer);
    toast.togglePopover(false);
    undoLast = null;
  };
  undoButton.addEventListener('click', () => {
    const undo = undoLast;
    hide();
    undo?.();
  });

  return {
    element: toast,
    show(message, undo = null) {
      clearTimeout(timer);
      text.textContent = message;
      undoButton.hidden = !undo;
      undoLast = undo;
      // Hidden and shown again, so it's the newest in the top layer (over a popover since).
      toast.togglePopover(false);
      toast.togglePopover(true);
      timer = setTimeout(hide, undo ? undoDuration : duration);
    },
    hide,
  };
}
