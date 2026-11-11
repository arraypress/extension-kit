/**
 * “Show on page”: boxes in Chrome's blue (DevTools' highlight) around a set of
 * elements, kept on them as the page scrolls or resizes, until cleared (the
 * extension's button again, another set, or Esc). The first can be scrolled
 * into view. The boxes go in the extension's own overlay (`pageOverlay`), so
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
     * Take the boxes away.
     */
    clear: () => void;
};
/**
 * A page's highlight: one set of elements boxed at a time.
 *
 * @typedef {object} Highlighter
 * @property {(elements: Element[], options?: {reveal?: boolean}) => number} show Box elements (the
 *   ones still in the page, the first {@link MAX_BOXES}), clearing any boxed before; `reveal`
 *   scrolls the first into view. Returns how many are boxed.
 * @property {() => void} clear Take the boxes away.
 */
/**
 * A highlighter for a page.
 *
 * @param {Document} doc - The page.
 * @param {object} options
 * @param {() => ParentNode} options.root - Where boxes go: the overlay's shadow root, made when first needed.
 * @param {() => void} [options.onClear] - After the boxes go (take an empty overlay away).
 * @param {number} [options.max] - The most elements boxed. Default {@link MAX_BOXES}.
 * @returns {Highlighter} It.
 * @example
 * const highlight = createHighlighter(document, { root: () => layer(document), onClear: tidyLayer });
 * highlight.show(elements, { reveal: true });
 */
export declare function createHighlighter(doc: Document, { root, onClear, max }: {
    root: () => ParentNode;
    onClear?: () => void;
    max?: number;
}): Highlighter;
