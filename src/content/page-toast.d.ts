/**
 * Chrome's own confirmation in a web page: the dark pill with a check mark that Chrome shows at
 * the bottom of the window for “Link copied”, for a content script that just did something the
 * person asked for from a menu or a shortcut. In a closed shadow root (the kit's `pageOverlay`)
 * the page can't style, as a popover in the top layer, over anything the page stacks; light on
 * a dark system. One at a time: a new one replaces the last.
 *
 * @module content/page-toast
 */
/** How long it shows, in ms (as Chrome's “Link copied”). */
export declare const PAGE_TOAST_MS = 4000;
/**
 * Show Chrome's confirmation toast in a page.
 *
 * @param {Document} doc - The page.
 * @param {string} text - What it says (“Link copied”).
 * @param {{name?: string, ms?: number}} [options] - `name`: the overlay's element name (the
 *   extension's own, with a hyphen); `ms`: how long it shows. Defaults `extension-toast`, {@link PAGE_TOAST_MS}.
 * @returns {() => void} Takes it away now.
 * @example
 * showPageToast(document, chrome.i18n.getMessage('copied'), { name: 'better-copy-toast' });
 */
export declare function showPageToast(doc: Document, text: string, { name, ms }?: {
    name?: string;
    ms?: number;
}): () => void;
