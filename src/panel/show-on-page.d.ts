/**
 * A side panel's “Show on page”: which of the panel's items (a font, a
 * colour) is boxed on the page, kept true whatever ends it. A click on the
 * item's button shows it, a second click takes it away, another item's
 * replaces it; a rescan or the panel closing clears the page's boxes
 * (`reset`); and when the page clears them itself (Esc there, or the page
 * left: the highlighter's `onClear` reasons `'escape'` and `'pagehide'`,
 * sent to the panel as a message) the panel's button is released without
 * calling the page back (`cleared`).
 *
 * @module panel/show-on-page
 */
export type ShowOnPageSetup = {
    /**
     * Boxes these on
     * the page (the panel's own call into the tab's frames), scrolling the first into view in
     * `revealFrame`; null takes the boxes away.
     */
    show: (ids: string[] | null, revealFrame?: number) => Promise<unknown>;
    /**
     * Hears which item is shown now (press its
     * button, release the others).
     */
    onChange: (shown: string | null) => void;
};
export type ShowOnPage = {
    /**
     * The item shown, or null.
     */
    shown: () => string | null;
    /**
     * Show the item
     * `id` (the page's `ids`), or take it away if it's the one shown. Rejects when the page can't be
     * reached, with nothing shown.
     */
    toggle: (id: string, ids: string[], revealFrame?: number) => Promise<void>;
    /**
     * A rescan started, or the panel is closing: take the page's boxes
     * away if any are shown. The call to the page starts at once (a closing panel still gets it out)
     * and a failure is ignored (the tab is gone).
     */
    reset: () => Promise<void>;
    /**
     * The page says its boxes went: nothing is shown, and the page isn't called.
     */
    cleared: () => void;
};
/**
 * @typedef {object} ShowOnPageSetup
 * @property {(ids: string[] | null, revealFrame?: number) => Promise<unknown>} show Boxes these on
 *   the page (the panel's own call into the tab's frames), scrolling the first into view in
 *   `revealFrame`; null takes the boxes away.
 * @property {(shown: string | null) => void} onChange Hears which item is shown now (press its
 *   button, release the others).
 */
/**
 * @typedef {object} ShowOnPage
 * @property {() => string | null} shown The item shown, or null.
 * @property {(id: string, ids: string[], revealFrame?: number) => Promise<void>} toggle Show the item
 *   `id` (the page's `ids`), or take it away if it's the one shown. Rejects when the page can't be
 *   reached, with nothing shown.
 * @property {() => Promise<void>} reset A rescan started, or the panel is closing: take the page's boxes
 *   away if any are shown. The call to the page starts at once (a closing panel still gets it out)
 *   and a failure is ignored (the tab is gone).
 * @property {() => void} cleared The page says its boxes went: nothing is shown, and the page isn't called.
 */
/**
 * A panel's “Show on page” state.
 *
 * @param {ShowOnPageSetup} setup - How to box items on the page, and who hears what's shown.
 * @returns {ShowOnPage} The controller.
 * @example
 * const onPage = createShowOnPage({
 *   show: (ids, frame) => callPage('highlight', [ids, frame]),
 *   onChange: (shown) => { for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.id === shown)); },
 * });
 * button.addEventListener('click', () => onPage.toggle(font.id, [font.id], font.frameId));
 * chrome.runtime.onMessage.addListener((message) => { if (message.type === 'boxes-cleared') onPage.cleared(); });
 * addEventListener('pagehide', () => onPage.reset());
 * await onPage.reset(); // before a rescan
 */
export declare function createShowOnPage({ show, onChange }: ShowOnPageSetup): ShowOnPage;
