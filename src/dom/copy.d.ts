/**
 * Copying in several formats at once: plain text, and HTML for apps that paste it rich (a link
 * with its title in Google Docs, Slack or Notion), from a page, a popup or a content script.
 * Says whether it worked, so a caller can offer another way when the page won't let it.
 *
 * Chrome lets the focused page write without a click (it grants clipboard-write to the active
 * tab), so a content script can copy from a context-menu click or a keyboard shortcut; a page
 * served over plain HTTP has no clipboard API, and one with `Permissions-Policy:
 * clipboard-write=()` refuses it: there the copy command is tried, which needs a click in the page.
 *
 * @module dom/copy
 */
export type ClipboardFormats = {
    /**
     * Plain text, for every app.
     */
    text: string;
    /**
     * HTML, for apps that paste formatted text.
     */
    html?: string;
};
/**
 * Put text, and HTML when given, on the clipboard: the clipboard API (one item holding both
 * formats), else the copy command.
 *
 * @param {Document} doc - The page, popup or content script's document.
 * @param {ClipboardFormats} formats - Plain text, and HTML for rich pasting.
 * @returns {Promise<boolean>} Whether it's on the clipboard.
 * @example
 * const link = document.createElement('a');
 * link.href = url;
 * link.textContent = title;
 * if (!(await copyFormats(document, { text: `${title} – ${url}`, html: link.outerHTML }))) offerCopyButton();
 */
export declare function copyFormats(doc: Document, { text, html }: ClipboardFormats): Promise<boolean>;
