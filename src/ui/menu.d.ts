/**
 * Chrome's action menu (cr-action-menu), the ⋮ menu of chrome://bookmarks and
 * chrome://settings: a `<dialog class="menu">` of `role="menuitem"` buttons,
 * shown modally over the button that opened it (or at the pointer, for a
 * right-click) and kept on screen. A click outside it, Esc, Tab or the window
 * losing focus closes it; ↑/↓ (wrapping), Home and End move between its
 * items; and focus goes back to where it came from. Also the rows' ⋮ button,
 * labelled "More actions for …" as Chrome labels its own.
 *
 * Sources: ui/webui/resources/cr_elements/cr_action_menu/cr_action_menu.ts
 * (a modal `<dialog>`; a click on its backdrop closes it; the anchor gets the
 * focus back; ↑/↓ wrap) and cr_icon_button with cr:more-vert.
 *
 * @module ui/menu
 */
/** The gap kept between a menu and the window's edges, in px. */
export declare const MENU_EDGE = 8;
export type MenuItem = {
    /**
     * Its text ("Rename").
     */
    label: string;
    /**
     * Runs once the menu has closed.
     */
    run: () => unknown;
    /**
     * Greyed out, and skipped by the arrow keys.
     */
    disabled?: boolean;
};
export type MenuEntry = MenuItem | 'separator';
export type MenuPlace = {
    /**
     * The button that opened it.
     */
    anchor?: HTMLElement;
    /**
     * Without an anchor: the pointer's x (a right-click's `clientX`).
     */
    x?: number;
    /**
     * Without an anchor: the pointer's y.
     */
    y?: number;
    /**
     * The menu's name for screen readers ("Actions for Research").
     */
    label?: string;
    /**
     * Where focus goes when it closes. Default the anchor, else what had focus.
     */
    focusTo?: HTMLElement;
};
export type Box = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};
/**
 * One item: its text, what it does, and whether it's greyed out.
 *
 * @typedef {object} MenuItem
 * @property {string} label Its text ("Rename").
 * @property {() => unknown} run Runs once the menu has closed.
 * @property {boolean} [disabled] Greyed out, and skipped by the arrow keys.
 */
/**
 * An item, or `'separator'` for a line between groups of items.
 *
 * @typedef {MenuItem | 'separator'} MenuEntry
 */
/**
 * Where a menu opens: over (or below) the button that opened it, or at a
 * pointer position.
 *
 * @typedef {object} MenuPlace
 * @property {HTMLElement} [anchor] The button that opened it.
 * @property {number} [x] Without an anchor: the pointer's x (a right-click's `clientX`).
 * @property {number} [y] Without an anchor: the pointer's y.
 * @property {string} [label] The menu's name for screen readers ("Actions for Research").
 * @property {HTMLElement} [focusTo] Where focus goes when it closes. Default the anchor, else what had focus.
 */
/**
 * A rectangle in the window, as `getBoundingClientRect()` gives it.
 *
 * @typedef {{left: number, top: number, right: number, bottom: number}} Box
 */
/**
 * Where to put a menu, so it stays on screen. Pure.
 *
 * Over an anchor (Chrome's way): the menu's top at the anchor's top and its
 * end at the anchor's end; moved up to end at the anchor's bottom when it
 * would leave the window below. Below an anchor: 4px under it, or above it
 * when there's no room. At a point: its top-left there, or its bottom-left
 * when there's no room below. Always at least {@link MENU_EDGE} from the
 * window's edges.
 *
 * @param {{width: number, height: number}} size - The menu's size.
 * @param {{width: number, height: number}} viewport - The window's (`innerWidth`, `innerHeight`).
 * @param {{anchor?: Box, x?: number, y?: number, placement?: 'over' | 'below'}} where - The anchor's
 *   box, or a point; `placement` says where it goes from an anchor (default `'over'`).
 * @returns {{left: number, top: number}} The menu's top-left, in px.
 * @example
 * menuPosition({width: 160, height: 120}, {width: 800, height: 600}, {anchor: button.getBoundingClientRect()});
 * // → {left: anchor.right - 160, top: anchor.top}
 */
export declare function menuPosition(size: {
    width: number;
    height: number;
}, viewport: {
    width: number;
    height: number;
}, { anchor, x, y, placement }: {
    anchor?: Box;
    x?: number;
    y?: number;
    placement?: 'over' | 'below';
}): {
    left: number;
    top: number;
};
/**
 * Whether a point is inside a box (edges included). Pure.
 *
 * @param {Box} box - The box.
 * @param {number} x - The point's x.
 * @param {number} y - The point's y.
 * @returns {boolean} True when inside.
 */
export declare function isInside(box: Box, x: number, y: number): boolean;
export type MenuOptions = {
    /**
     * The menu element's id.
     */
    id?: string;
    /**
     * Where it opens from a button. Default `'over'`, as Chrome's.
     */
    placement?: 'over' | 'below';
    /**
     * The page. Default `document`.
     */
    doc?: Document;
};
export type ActionMenu = {
    /**
     * The `<dialog class="menu" role="menu">`, in the page's body.
     */
    element: HTMLDialogElement;
    /**
     * Fill it with `entries`
     * and open it (closing it first if it's open).
     */
    open: (entries: readonly MenuEntry[], where: MenuPlace) => void;
    /**
     * Close it, if open, and return the focus.
     */
    close: () => void;
};
/**
 * What {@link createMenu} takes.
 *
 * @typedef {object} MenuOptions
 * @property {string} [id] The menu element's id.
 * @property {'over' | 'below'} [placement] Where it opens from a button. Default `'over'`, as Chrome's.
 * @property {Document} [doc] The page. Default `document`.
 */
/**
 * A page's action menu.
 *
 * @typedef {object} ActionMenu
 * @property {HTMLDialogElement} element The `<dialog class="menu" role="menu">`, in the page's body.
 * @property {(entries: readonly MenuEntry[], where: MenuPlace) => void} open Fill it with `entries`
 *   and open it (closing it first if it's open).
 * @property {() => void} close Close it, if open, and return the focus.
 */
/**
 * Make a page's action menu: one `<dialog class="menu">` that any number of
 * ⋮ buttons (or right-clicks) open with their own items.
 *
 * @param {MenuOptions} [options] - Its id, placement and page.
 * @returns {ActionMenu} The menu.
 * @example
 * const menu = createMenu();
 * row.append(moreActionsButton(workspace.name, {
 *   onClick: (button) => menu.open([
 *     {label: 'Rename', run: () => rename(workspace)},
 *     'separator',
 *     {label: 'Delete', run: () => remove(workspace)},
 *   ], {anchor: button}),
 * }));
 */
export declare function createMenu({ id, placement, doc }?: MenuOptions): ActionMenu;
export type MoreActionsOptions = {
    /**
     * The whole label, for a page that translates it. Default
     * `More actions for “<name>”`, Chrome's words.
     */
    label?: string;
    /**
     * More classes, after `icon-button`.
     */
    className?: string;
    /**
     * In the tab order. Default true; false for a row that takes the
     * focus itself and opens the menu from the keyboard.
     */
    focusable?: boolean;
    /**
     * Show the label on hover too (`title`). Default false.
     */
    tooltip?: boolean;
    /**
     * Opens its menu.
     */
    onClick?: (button: HTMLButtonElement, event: MouseEvent) => void;
    /**
     * The page. Default `document`.
     */
    doc?: Document;
};
/**
 * What {@link moreActionsButton} takes.
 *
 * @typedef {object} MoreActionsOptions
 * @property {string} [label] The whole label, for a page that translates it. Default
 *   `More actions for “<name>”`, Chrome's words.
 * @property {string} [className] More classes, after `icon-button`.
 * @property {boolean} [focusable] In the tab order. Default true; false for a row that takes the
 *   focus itself and opens the menu from the keyboard.
 * @property {boolean} [tooltip] Show the label on hover too (`title`). Default false.
 * @property {(button: HTMLButtonElement, event: MouseEvent) => void} [onClick] Opens its menu.
 * @property {Document} [doc] The page. Default `document`.
 */
/**
 * A row's ⋮ button: a 32px cr-icon-button with cr:more-vert (the
 * stylesheet's `--icon-more-vert`, so the page needs no sprite), labelled for
 * screen readers as Chrome labels its own.
 *
 * @param {string} name - What the row is ("Research"), for "More actions for “Research”".
 * @param {MoreActionsOptions} [options] - Its label, classes, tab stop, tooltip and click.
 * @returns {HTMLButtonElement} The button.
 * @example
 * row.append(moreActionsButton(site, {onClick: (button) => menu.open(siteItems(site), {anchor: button})}));
 * // A translated label:
 * moreActionsButton(name, {label: t('rowActions', name), className: 'row-menu', focusable: false});
 */
export declare function moreActionsButton(name: string, { label, className, focusable, tooltip, onClick, doc }?: MoreActionsOptions): HTMLButtonElement;
