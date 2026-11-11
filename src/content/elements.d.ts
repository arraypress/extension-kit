/**
 * A page's rendered elements, for a content script that reads them all: in
 * document order, into open shadow roots and closed ones (where Chrome lets
 * an extension see them, `chrome.dom.openOrClosedShadowRoot`), leaving out
 * what Chrome doesn't render and what holds no page content (scripts,
 * styles, templates, `<head>`).
 *
 * @module content/elements
 */
/** The most elements read (a very long page's first ones). */
export declare const MAX_ELEMENTS = 20000;
/**
 * An element's shadow root, closed ones too where Chrome lets the extension see them.
 *
 * @param {Element} element - The element.
 * @returns {ShadowRoot | null} Its shadow root.
 * @example
 * const root = shadowRootOf(host); // a closed root, from a content script
 */
export declare function shadowRootOf(element: Element): ShadowRoot | null;
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
export declare function renderedElements(doc: Document, { skip, limit }?: {
    skip?: (element: Element) => boolean;
    limit?: number;
}): Element[];
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
export declare function otherSiteFrames(doc: Document, elements?: Element[]): string[];
