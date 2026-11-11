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

/**
 * What to put on the clipboard.
 *
 * @typedef {object} ClipboardFormats
 * @property {string} text Plain text, for every app.
 * @property {string} [html] HTML, for apps that paste formatted text.
 */

/**
 * The copy command, with a copy listener that writes the formats: it runs first (capture, on the
 * window) and stops the page's own listeners from changing what's copied.
 *
 * @param {Document} doc - The page.
 * @param {ClipboardFormats} formats - What to copy.
 * @returns {boolean} Whether the command ran and wrote them.
 */
function copyCommand(doc, { text, html }) {
  const view = doc.defaultView;
  if (!view) return false;
  let wrote = false;
  /** @param {ClipboardEvent} event */
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    if (html !== undefined) event.clipboardData.setData('text/html', html);
    event.preventDefault();
    event.stopImmediatePropagation();
    wrote = true;
  };
  view.addEventListener('copy', onCopy, true);
  try {
    return doc.execCommand('copy') && wrote;
  } catch {
    return false;
  } finally {
    view.removeEventListener('copy', onCopy, true);
  }
}

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
export async function copyFormats(doc, { text, html }) {
  const view = doc.defaultView;
  const clipboard = view?.navigator.clipboard;
  if (view && clipboard) {
    try {
      if (html === undefined) await clipboard.writeText(text);
      else {
        await clipboard.write([new view.ClipboardItem({
          'text/plain': new view.Blob([text], { type: 'text/plain' }),
          'text/html': new view.Blob([html], { type: 'text/html' }),
        })]);
      }
      return true;
    } catch {
      // No focus, or the page's permissions policy: the copy command below.
    }
  }
  return copyCommand(doc, { text, html });
}
