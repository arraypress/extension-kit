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
export function createHighlighter(doc, { root, onClear = () => {}, max = MAX_BOXES }) {
  const view = /** @type {Window} */ (doc.defaultView);
  /** @type {{elements: Element[], boxes: HTMLElement[]} | null} */
  let shown = null;
  let pending = 0;

  /** Put a box on each rectangle in the window, reusing the boxes there are: nothing is made or removed while scrolling. */
  const draw = () => {
    pending = 0;
    if (!shown) return;
    const rects = shown.elements.flatMap((element) => [...element.getClientRects()].filter((rect) => rect.width && rect.height
      && rect.bottom > 0 && rect.top < view.innerHeight && rect.right > 0 && rect.left < view.innerWidth));
    const { boxes } = shown;
    for (const box of boxes.splice(rects.length)) box.remove();
    /** @type {HTMLElement[]} */
    const added = [];
    rects.forEach((rect, index) => {
      let box = boxes[index];
      if (!box) {
        box = doc.createElement('div');
        box.className = 'box';
        boxes.push(box);
        added.push(box);
      }
      Object.assign(box.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
    });
    if (added.length) root().append(...added);
  };
  const update = () => {
    if (!pending) pending = view.requestAnimationFrame(draw);
  };
  /** @param {KeyboardEvent} event */
  const key = (event) => {
    if (event.key === 'Escape') end('escape');
  };
  const left = () => end('pagehide');

  /** @param {ClearReason} reason */
  function end(reason) {
    if (!shown) return;
    view.removeEventListener('scroll', update, true);
    view.removeEventListener('resize', update);
    view.removeEventListener('keydown', key, true);
    view.removeEventListener('pagehide', left);
    if (pending) view.cancelAnimationFrame(pending);
    pending = 0;
    for (const box of shown.boxes) box.remove();
    shown = null;
    onClear(reason);
  }

  /** @type {Highlighter['show']} */
  function show(elements, { reveal = false } = {}) {
    end('replaced');
    const some = elements.filter((element) => element.isConnected).slice(0, max);
    if (!some.length) return 0;
    if (reveal) some[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    shown = { elements: some, boxes: [] };
    view.addEventListener('scroll', update, { capture: true, passive: true });
    view.addEventListener('resize', update, { passive: true });
    view.addEventListener('keydown', key, true);
    view.addEventListener('pagehide', left);
    draw();
    return some.length;
  }

  return { show, clear: () => end('asked') };

}
