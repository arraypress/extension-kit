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
/** How long chrome://bookmarks shows a toast (its cr-toast-manager's `duration`), in ms. */
export declare const TOAST_MS = 10000;
export type ToastOptions = {
    /**
     * The undo button's text. Default "Undo".
     */
    undoLabel?: string;
    /**
     * How long a toast stays, in ms. Default {@link TOAST_MS}.
     */
    duration?: number;
    /**
     * How long one with Undo stays. Default `duration`.
     */
    undoDuration?: number;
    /**
     * Where the toast goes: an element, or a shadow root (a content
     * script's). Default the page's `body`.
     */
    root?: ParentNode;
    /**
     * The page. Default `root`'s document, else `document`.
     */
    doc?: Document;
};
export type Toast = {
    /**
     * The `#toast` element (`role="status"`, `popover="manual"`), in
     * `root`; `:popover-open` while it shows.
     */
    element: HTMLElement;
    /**
     * Show `text`, with an Undo
     * button that hides the toast and runs `undo` when one is given.
     */
    show: (text: string, undo?: (() => unknown) | null) => void;
    /**
     * Take it down (and its Undo with it).
     */
    hide: () => void;
};
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
export declare function createToast({ undoLabel, duration, undoDuration, root, doc }?: ToastOptions): Toast;
