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
export const MAX_BOXES = 500;

/** The boxes' styles, for the overlay's stylesheet. @type {string} */
export const HIGHLIGHT_CSS = '.box { position: fixed; box-sizing: border-box; border: 2px solid rgb(26 115 232); background: rgb(26 115 232 / 0.12); border-radius: 2px; pointer-events: none; }';

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
export function createHighlighter(doc, { root, onClear = () => {}, max = MAX_BOXES }) {
  const view = /** @type {Window} */ (doc.defaultView);
  /** @type {{elements: Element[], boxes: HTMLElement[]} | null} */
  let shown = null;
  let pending = 0;

  const draw = () => {
    pending = 0;
    if (!shown) return;
    for (const box of shown.boxes) box.remove();
    shown.boxes = shown.elements.flatMap((element) => [...element.getClientRects()].filter((rect) => rect.width && rect.height
      && rect.bottom > 0 && rect.top < view.innerHeight && rect.right > 0 && rect.left < view.innerWidth).map((rect) => {
      const box = doc.createElement('div');
      box.className = 'box';
      Object.assign(box.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
      return box;
    }));
    root().append(...shown.boxes);
  };
  const update = () => {
    if (!pending) pending = view.requestAnimationFrame(draw);
  };
  /** @param {KeyboardEvent} event */
  const key = (event) => {
    if (event.key === 'Escape') clear();
  };

  function clear() {
    if (!shown) return;
    view.removeEventListener('scroll', update, true);
    view.removeEventListener('resize', update);
    view.removeEventListener('keydown', key, true);
    for (const box of shown.boxes) box.remove();
    shown = null;
    onClear();
  }

  /** @type {Highlighter['show']} */
  function show(elements, { reveal = false } = {}) {
    clear();
    const some = elements.filter((element) => element.isConnected).slice(0, max);
    if (!some.length) return 0;
    if (reveal) some[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    shown = { elements: some, boxes: [] };
    view.addEventListener('scroll', update, { capture: true, passive: true });
    view.addEventListener('resize', update, { passive: true });
    view.addEventListener('keydown', key, true);
    draw();
    return some.length;
  }

  return { show, clear };
}
