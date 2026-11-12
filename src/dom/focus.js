/**
 * The focus and the document, seen through shadow roots: what the page
 * components need to work inside a content script's shadow root as well as
 * in a page of their own. A shadow root's focused element shows outside it
 * as the host, so `document.activeElement` alone can't say which item of a
 * menu in a shadow root has the focus.
 *
 * @module dom/focus
 */

/**
 * The element that really has the focus: the document's `activeElement`,
 * followed into each open shadow root it's the host of.
 *
 * @param {Document | ShadowRoot} [root] - Where to start. Default `document`.
 * @returns {Element | null} The focused element, or null when nothing has it.
 * @example
 * // A button focused in a content script's shadow root:
 * document.activeElement; // → the shadow root's host
 * focusedElement();       // → the button
 */
export function focusedElement(root = document) {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/**
 * The focused element as seen from where `node` is: its shadow root's (a
 * closed one too, which the document's `activeElement` stops at) or its
 * document's, followed into open shadow roots below.
 *
 * @param {Node} node - A node in the page or in a shadow root.
 * @returns {Element | null} The focused element, or null when nothing there has it.
 * @example
 * focusedIn(menu); // the menu's focused item, in a content script's closed shadow root too
 */
export function focusedIn(node) {
  const root = /** @type {Document | ShadowRoot} */ (node.getRootNode());
  return 'activeElement' in root ? focusedElement(root) : null;
}

/**
 * The document a component is made in: `root`'s, or the page's.
 *
 * @param {ParentNode} [root] - Where the component goes (an element or a shadow root), if given.
 * @returns {Document} Its document, else `document`.
 */
export function rootDocument(root) {
  return root ? /** @type {Node} */ (/** @type {unknown} */ (root)).ownerDocument ?? document : document;
}
