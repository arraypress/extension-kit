/**
 * Chrome's toast (cr-toast), bottom left, as chrome://bookmarks shows one
 * after a delete: "Deleted “Research”  Undo". One per page, made by
 * {@link createToast}; a new message replaces the last and restarts the wait.
 * While the keyboard focus is on Undo, or the pointer is over the toast, it
 * stays, and the wait starts again in full once they leave (cr-toast stops
 * its timer on `focusin` and restarts it on `focusout`).
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

  /** How long the toast showing now stays, once nothing holds it. */
  let stay = duration;

  const hide = () => {
    clearTimeout(timer);
    toast.togglePopover(false);
    undoLast = null;
  };
  /** Whether the keyboard focus is in the toast (on Undo) or the pointer over it: it stays while either is. */
  const held = () => toast.matches(':focus-within, :hover');
  /** The wait starts again, in full, unless the toast is held: as cr-toast's, whose focusout restarts it. */
  const wait = () => {
    clearTimeout(timer);
    if (!held() && toast.matches(':popover-open')) timer = setTimeout(hide, stay);
  };
  // cr-toast stops its timer on focusin and restarts it on focusout, so Undo can't go from under
  // the keyboard; the pointer over it holds it the same way (WCAG 2.2.1, Timing Adjustable).
  toast.addEventListener('focusin', () => clearTimeout(timer));
  toast.addEventListener('pointerenter', () => clearTimeout(timer));
  toast.addEventListener('focusout', () => queueMicrotask(wait));
  toast.addEventListener('pointerleave', wait);
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
      // Taken off the page since (a single-page site replaced its body): put back, or showing it would throw.
      if (!toast.isConnected) (root?.isConnected === false ? doc.body : root ?? doc.body).append(toast);
      // Hidden and shown again, so it's the newest in the top layer (over a popover since).
      toast.togglePopover(false);
      toast.togglePopover(true);
      stay = undo ? undoDuration : duration;
      wait();
    },
    hide,
  };
}
