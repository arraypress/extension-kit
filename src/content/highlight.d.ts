/**
 * “Show on page”: boxes in Chrome's blue (DevTools' highlight) around a set of
 * elements, kept on them as the page scrolls or resizes, until cleared (the
 * extension's button again, another set, Esc, or the page being left) and
 * `onClear` is told which, so a panel's pressed button can follow an Esc on
 * the page. The first can be scrolled into view. The boxes go in the extension's own overlay (`pageOverlay`), so
 * the page's styles can't touch them.
 *
 * @module content/highlight
 */
/** The most elements boxed at once. */
export declare const MAX_BOXES = 500;
/** The boxes' styles, for the overlay's stylesheet. @type {string} */
export declare const HIGHLIGHT_CSS: string;
export type Highlighter = {
    /**
     * Box elements (the
     * ones still in the page, the first {@link MAX_BOXES}), clearing any boxed before; `reveal`
     * scrolls the first into view. Returns how many are boxed.
     */
    show: (elements: Element[], options?: {
        reveal?: boolean;
    }) => number;
    /**
     * Take the boxes away (`onClear('asked')`).
     */
    clear: () => void;
};
export type ClearReason = 'escape' | 'replaced' | 'asked' | 'pagehide';
/**
 * A page's highlight: one set of elements boxed at a time.
 *
 * @typedef {object} Highlighter
 * @property {(elements: Element[], options?: {reveal?: boolean}) => number} show Box elements (the
 *   ones still in the page, the first {@link MAX_BOXES}), clearing any boxed before; `reveal`
 *   scrolls the first into view. Returns how many are boxed.
 * @property {() => void} clear Take the boxes away (`onClear('asked')`).
 */
/**
 * Why the boxes went: Esc on the page, another set shown in their place, `clear()` called, or
 * the page left (`pagehide`: a page kept for Back would come back with stale boxes).
 *
 * @typedef {'escape' | 'replaced' | 'asked' | 'pagehide'} ClearReason
 */
/**
 * A highlighter for a page.
 *
 * @param {Document} doc - The page.
 * @param {object} options
 * @param {() => ParentNode} options.root - Where boxes go: the overlay's shadow root, made when first needed.
 * @param {(reason: ClearReason) => void} [options.onClear] - After the boxes go, and why (take an empty
 *   overlay away; tell the panel when it's `'escape'` or `'pagehide'`, which it didn't ask for).
 * @param {number} [options.max] - The most elements boxed. Default {@link MAX_BOXES}.
 * @returns {Highlighter} It.
 * @example
 * const highlight = createHighlighter(document, { root: () => layer(document), onClear: tidyLayer });
 * highlight.show(elements, { reveal: true });
 */
export declare function createHighlighter(doc: Document, { root, onClear, max }: {
    root: () => ParentNode;
    onClear?: (reason: ClearReason) => void;
    max?: number;
}): Highlighter;
