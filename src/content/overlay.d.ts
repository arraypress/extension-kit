/**
 * A content script's layer over the page: a host element of its own name on
 * the page's root element, holding a closed shadow root with the script's
 * styles, so the page's styles and scripts can't reach in and its styles
 * can't reach out. Pickers, toasts, bars and inspectors draw in it.
 *
 * @module content/overlay
 */
export type PageOverlay = {
    /**
     * The host element, on the page's root element.
     */
    host: HTMLElement;
    /**
     * Its closed shadow root, the styles first: append to it.
     */
    root: ShadowRoot;
    /**
     * Take it off the page.
     */
    remove: () => void;
    /**
     * With `topLayer`: put it over whatever entered the top layer since.
     */
    raise: () => void;
};
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
 * dialog is open. The popover's own backdrop is taken away (first in the overlay's styles), so a
 * page's `::backdrop` rule can't tint the window through it.
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
export declare function pageOverlay(doc: Document, { name, css, hostStyle, topLayer }: {
    name: string;
    css: string;
    hostStyle?: Record<string, string>;
    topLayer?: boolean;
}): PageOverlay;
