/**
 * A content script's layer over the page: a host element of its own name on
 * the page's root element, holding a closed shadow root with the script's
 * styles, so the page's styles and scripts can't reach in and its styles
 * can't reach out. Pickers, toasts, bars and inspectors draw in it.
 *
 * @module content/overlay
 */

/**
 * A page overlay.
 *
 * @typedef {object} PageOverlay
 * @property {HTMLElement} host The host element, on the page's root element.
 * @property {ShadowRoot} root Its closed shadow root, the styles first: append to it.
 * @property {() => void} remove Take it off the page.
 */

/**
 * Put an overlay on the page, replacing one of the same name a run before left.
 * The host's own styles are reset (`all: initial`) before `css`, so the page's
 * rules for unknown elements can't move or hide it; `css` styles `:host` and what's inside.
 *
 * @param {Document} doc - The page.
 * @param {{name: string, css: string}} options - `name`: the host's element name, with a hyphen
 *   (never registered: a plain element); `css`: the overlay's styles.
 * @returns {PageOverlay} The overlay.
 * @example
 * const { root, remove } = pageOverlay(document, { name: 'better-fonts-inspector', css: ':host { position: fixed; inset: 0; pointer-events: none; }' });
 * root.append(card);
 */
export function pageOverlay(doc, { name, css }) {
  for (const old of doc.querySelectorAll(name)) old.remove();
  const host = doc.createElement(name);
  host.style.setProperty('all', 'initial', 'important');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = css;
  root.append(style);
  doc.documentElement.append(host);
  return { host, root, remove: () => host.remove() };
}
