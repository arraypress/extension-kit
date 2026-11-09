/**
 * Chrome's toast (cr-toast), bottom left, as chrome://bookmarks shows one
 * after a delete: "Deleted “Research”  Undo". One per page, made by
 * {@link createToast}; a new message replaces the last and restarts the wait.
 *
 * @module ui/toast
 */

/** How long chrome://bookmarks shows a toast (its cr-toast-manager's `duration`), in ms. */
export const TOAST_MS = 10_000;

/**
 * What {@link createToast} takes.
 *
 * @typedef {object} ToastOptions
 * @property {string} [undoLabel] The undo button's text. Default "Undo".
 * @property {number} [duration] How long a toast stays, in ms. Default {@link TOAST_MS}.
 * @property {number} [undoDuration] How long one with Undo stays. Default `duration`.
 * @property {Document} [doc] The page. Default `document`.
 */

/**
 * A page's toast.
 *
 * @typedef {object} Toast
 * @property {HTMLElement} element The `#toast` element (`role="status"`), in the page's body.
 * @property {(text: string, undo?: (() => unknown) | null) => void} show Show `text`, with an Undo
 *   button that hides the toast and runs `undo` when one is given.
 * @property {() => void} hide Take it down (and its Undo with it).
 */

/**
 * Make the page's toast: `<div id="toast" class="toast" role="status">` with
 * `#toast-text` and an Undo button `#toast-undo`, hidden until shown. Make it
 * when the page loads, so screen readers know the live region before it speaks.
 *
 * @param {ToastOptions} [options] - The Undo text, how long it stays, and the page.
 * @returns {Toast} The toast.
 * @example
 * const toast = createToast();
 * await deleteWorkspace(workspace);
 * toast.show(`Deleted “${workspace.name}”`, () => restore(workspace));
 */
export function createToast({ undoLabel = 'Undo', duration = TOAST_MS, undoDuration = duration, doc = document } = {}) {
  const toast = doc.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  const text = doc.createElement('span');
  text.id = 'toast-text';
  const undoButton = doc.createElement('button');
  undoButton.id = 'toast-undo';
  undoButton.type = 'button';
  undoButton.textContent = undoLabel;
  undoButton.hidden = true;
  toast.append(text, undoButton);
  doc.body.append(toast);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(() => unknown) | null} */
  let undoLast = null;

  const hide = () => {
    clearTimeout(timer);
    toast.hidden = true;
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
      toast.hidden = false;
      timer = setTimeout(hide, undo ? undoDuration : duration);
    },
    hide,
  };
}
