/**
 * A page's rendered elements, for a content script that reads them all: in
 * document order, into open shadow roots and closed ones (where Chrome lets
 * an extension see them, `chrome.dom.openOrClosedShadowRoot`), leaving out
 * what Chrome doesn't render and what holds no page content (scripts,
 * styles, templates, `<head>`).
 *
 * @module content/elements
 */

/** Elements that are never drawn as the page's content, nor anything inside them. */
const NEVER_RENDERED = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link']);

/** The most elements read (a very long page's first ones). */
export const MAX_ELEMENTS = 20_000;

/**
 * An element's shadow root, closed ones too where Chrome lets the extension see them.
 *
 * @param {Element} element - The element.
 * @returns {ShadowRoot | null} Its shadow root.
 * @example
 * const root = shadowRootOf(host); // a closed root, from a content script
 */
export function shadowRootOf(element) {
  const dom = /** @type {{dom?: {openOrClosedShadowRoot?: (element: HTMLElement) => ShadowRoot | null}}} */ (globalThis.chrome ?? {}).dom;
  return (dom?.openOrClosedShadowRoot && element instanceof HTMLElement ? dom.openOrClosedShadowRoot(element) : element.shadowRoot) ?? null;
}

/**
 * Every rendered element from the body down, in document order, a shadow root's elements before
 * its host's children. An element Chrome doesn't draw (`visibility: hidden`) is left out, but
 * what's inside it is still read (a child can be visible again), as is what's inside a
 * `display: contents` element (a slot), which has no box of its own; nothing inside a
 * `display: none` or `content-visibility: hidden` part is.
 *
 * @param {Document} doc - The page.
 * @param {{skip?: (element: Element) => boolean, limit?: number}} [options] - `skip`: elements left
 *   out with what's inside (the extension's overlay); `limit`: the most elements ({@link MAX_ELEMENTS}).
 * @returns {Element[]} The elements.
 * @example
 * for (const element of renderedElements(document, { skip: isLayer })) read(element);
 */
export function renderedElements(doc, { skip = () => false, limit = MAX_ELEMENTS } = {}) {
  /** @type {Element[]} */
  const found = [];
  /** @param {Element} element */
  const visit = (element) => {
    if (found.length >= limit || NEVER_RENDERED.has(element.localName) || skip(element)) return;
    if (element.checkVisibility()) {
      if (element.checkVisibility({ visibilityProperty: true })) found.push(element);
    } else if (element.ownerDocument.defaultView?.getComputedStyle(element).display !== 'contents') {
      return;
    }
    const shadow = shadowRootOf(element);
    if (shadow) for (const child of shadow.children) visit(child);
    for (const child of element.children) visit(child);
  };
  if (doc.body) visit(doc.body);
  return found;
}

/**
 * The origins of a page's frames that are another site's: their content isn't the page's to read,
 * and an extension reads them only with that site's access (`chrome.permissions.request`, from a
 * click). Frames inside shadow roots are found too.
 *
 * @param {Document} doc - The page.
 * @param {Element[]} [elements] - Its elements, when already listed ({@link renderedElements}).
 * @returns {string[]} Their origins (`https://ads.example.net`), each once.
 * @example
 * otherSiteFrames(document); // ['https://www.youtube.com']
 */
export function otherSiteFrames(doc, elements = renderedElements(doc)) {
  const own = doc.location?.origin;
  /** @type {Set<string>} */
  const sites = new Set();
  for (const frame of elements) {
    if (frame.localName !== 'iframe' && frame.localName !== 'frame') continue;
    try {
      const url = new URL(/** @type {HTMLIFrameElement} */ (frame).src);
      if (/^https?:$/.test(url.protocol) && url.origin !== own) sites.add(url.origin);
    } catch {
      // No address (srcdoc, about:blank): the page's own.
    }
  }
  return [...sites];
}
