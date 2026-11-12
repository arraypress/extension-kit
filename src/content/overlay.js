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
 * @property {() => void} raise With `topLayer`: put it over whatever entered the top layer since.
 */

/**
 * Put an overlay on the page, replacing one of the same name a run before left.
 *
 * The host's own styles are reset inline (`all: initial !important`), so the page's rules for
 * unknown elements can't move or hide it. That reset also beats a plain `:host { … }` rule in
 * `css` and an inline `host.style.x = …`: give the host's own styles as `hostStyle`, set inline
 * with `!important` after the reset. `css` styles what's inside (and `:host` custom properties,
 * which the reset doesn't touch).
 *
 * With `topLayer` the host is a manual popover, shown: it draws in the top layer, over the page's
 * modal dialogs, popovers and fullscreen element, which no `z-index` reaches. The top layer
 * paints in the order things entered it, so the overlay goes back on top (`raise`) whenever the
 * page opens a dialog or a popover or goes fullscreen after it. What a modal dialog makes inert
 * stays inert, the overlay with it: it shows over the dialog, but can't be clicked while the
 * dialog is open.
 *
 * @param {Document} doc - The page.
 * @param {{name: string, css: string, hostStyle?: Record<string, string>, topLayer?: boolean}} options -
 *   `name`: the host's element name, with a hyphen (never registered: a plain element); `css`: the
 *   overlay's styles; `hostStyle`: the host's own styles by CSS property name (`'z-index'`), each
 *   `!important`; `topLayer`: draw over the page's dialogs and fullscreen element. Default false.
 * @returns {PageOverlay} The overlay.
 * @example
 * const { root, remove } = pageOverlay(document, {
 *   name: 'better-fonts-inspector',
 *   hostStyle: { position: 'fixed', inset: '0', 'z-index': '2147483647', 'pointer-events': 'none' },
 *   css: '.card { position: absolute; }',
 * });
 * root.append(card);
 */
export function pageOverlay(doc, { name, css, hostStyle = {}, topLayer = false }) {
  for (const old of doc.querySelectorAll(name)) old.remove();
  const host = doc.createElement(name);
  host.style.setProperty('all', 'initial', 'important');
  for (const [property, value] of Object.entries(hostStyle)) host.style.setProperty(property, value, 'important');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = css;
  root.append(style);
  doc.documentElement.append(host);
  if (!topLayer || typeof host.showPopover !== 'function') return { host, root, remove: () => host.remove(), raise: () => {} };

  host.popover = 'manual';
  const raise = () => {
    if (!host.isConnected) return;
    host.hidePopover();
    host.showPopover();
  };
  /** Something of the page's entered the top layer: a dialog or popover opened, or the page went fullscreen. */
  const entered = (/** @type {Event} */ event) => {
    if (event.target === host) return;
    if (event.type === 'toggle' && /** @type {ToggleEvent} */ (event).newState !== 'open') return;
    raise();
  };
  const view = doc.defaultView;
  view?.addEventListener('toggle', entered, true);
  view?.addEventListener('fullscreenchange', entered, true);
  host.showPopover();
  return {
    host,
    root,
    raise,
    remove() {
      view?.removeEventListener('toggle', entered, true);
      view?.removeEventListener('fullscreenchange', entered, true);
      host.remove();
    },
  };
}
