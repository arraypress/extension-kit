/**
 * Copying text from a click: the clipboard API, or the copy command where the
 * page's focus or permissions policy keeps the API from writing (a content
 * script in a page that doesn't allow it, a side panel that isn't focused).
 *
 * @module dom/clipboard
 */
/**
 * Copy text, from a click.
 *
 * @param {Document} doc - The page.
 * @param {string} text - The text.
 * @param {ParentNode} [holder] - Where the copy command's field goes for a moment: a content
 *   script's own overlay, so the page's styles and scripts don't matter. Default the page's body.
 * @returns {Promise<void>}
 * @example
 * button.addEventListener('click', () => copyText(document, '#1a73e8'));
 */
export declare function copyText(doc: Document, text: string, holder?: ParentNode): Promise<void>;
