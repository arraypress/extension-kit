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

import { focusedElement, focusedIn, rootDocument } from '../dom/focus.js';

/** The gap kept between a menu and the window's edges, in px. */
export const MENU_EDGE = 8;

/** The gap between a button and a menu placed below it, in px. */
const BELOW_GAP = 4;

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
 * @param {{anchor?: Box, x?: number, y?: number, placement?: 'over' | 'below', rtl?: boolean}} where - The
 *   anchor's box, or a point; `placement` says where it goes from an anchor (default `'over'`); `rtl`
 *   (a right-to-left page) lines its start up with the anchor's left edge and opens leftwards from a
 *   point, as Chrome mirrors its own.
 * @returns {{left: number, top: number}} The menu's top-left, in px.
 * @example
 * menuPosition({width: 160, height: 120}, {width: 800, height: 600}, {anchor: button.getBoundingClientRect()});
 * // → {left: anchor.right - 160, top: anchor.top}
 */
export function menuPosition(size, viewport, { anchor, x = 0, y = 0, placement = 'over', rtl = false }) {
  const { width, height } = size;
  const left = (/** @type {number} */ start) => Math.max(MENU_EDGE, Math.min(start, viewport.width - width - MENU_EDGE));
  const room = (/** @type {number} */ top) => top + height <= viewport.height - MENU_EDGE;
  if (!anchor) return { left: left(rtl ? x - width : x), top: Math.max(MENU_EDGE, room(y) ? y : y - height) };
  const start = left(rtl ? anchor.left : anchor.right - width);
  if (placement === 'below') {
    const below = anchor.bottom + BELOW_GAP;
    return { left: start, top: Math.max(MENU_EDGE, room(below) ? below : anchor.top - height - BELOW_GAP) };
  }
  return { left: start, top: Math.max(MENU_EDGE, room(anchor.top) ? anchor.top : anchor.bottom - height) };
}

/**
 * Whether a point is inside a box (edges included). Pure.
 *
 * @param {Box} box - The box.
 * @param {number} x - The point's x.
 * @param {number} y - The point's y.
 * @returns {boolean} True when inside.
 */
export function isInside(box, x, y) {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/**
 * What {@link createMenu} takes.
 *
 * @typedef {object} MenuOptions
 * @property {string} [id] The menu element's id.
 * @property {'over' | 'below'} [placement] Where it opens from a button. Default `'over'`, as Chrome's.
 * @property {ParentNode} [root] Where the menu goes: an element, or a shadow root (a content
 *   script's, so the page's styles never reach it). Default the page's `body`.
 * @property {Document} [doc] The page. Default `root`'s document, else `document`.
 */

/**
 * A page's action menu.
 *
 * @typedef {object} ActionMenu
 * @property {HTMLDialogElement} element The `<dialog class="menu" role="menu">`, in `root`.
 * @property {(entries: readonly MenuEntry[], where: MenuPlace) => void} open Fill it with `entries`
 *   and open it (closing it first if it's open).
 * @property {() => void} close Close it, if open, and return the focus.
 * @property {() => void} destroy Take it off the page and stop listening to the window (a content
 *   script's overlay being removed).
 */

/**
 * Make a page's action menu: one `<dialog class="menu">` that any number of
 * ⋮ buttons (or right-clicks) open with their own items.
 *
 * @param {MenuOptions} [options] - Its id, placement, and where it goes.
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
export function createMenu({ id, placement = 'over', root, doc = rootDocument(root) } = {}) {
  const view = /** @type {Window & typeof globalThis} */ (doc.defaultView);
  const menu = doc.createElement('dialog');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  if (id) menu.id = id;
  (root ?? doc.body).append(menu);

  /** @type {HTMLElement | null} */
  let returnFocus = null;
  /** @type {HTMLElement | null} */
  let expanded = null;

  const items = () => /** @type {HTMLButtonElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')]);

  /** Close without returning the focus (another open follows at once). */
  const shut = () => {
    if (menu.open) menu.close();
    expanded?.setAttribute('aria-expanded', 'false');
    expanded = null;
  };

  const close = () => {
    if (!menu.open) return;
    const target = returnFocus;
    returnFocus = null;
    shut();
    if (target?.isConnected) target.focus();
  };

  menu.addEventListener('keydown', (event) => {
    const list = items();
    // Asked of the menu's own root: a closed shadow root's focused element can't be seen from the document.
    const at = list.indexOf(/** @type {HTMLButtonElement} */ (focusedIn(menu)));
    /** @param {number} index */
    const go = (index) => {
      handled();
      list[(index + list.length) % list.length]?.focus();
    };
    /** The key is the menu's: the page under a content script's menu doesn't act on it too (its own shortcuts). */
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(-1);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      handled();
      close();
    }
  });
  // Closed any other way (the browser's own close, another script): the button no longer says it's open.
  menu.addEventListener('close', () => {
    expanded?.setAttribute('aria-expanded', 'false');
    expanded = null;
  });
  // Esc the browser handles itself (when the keydown above didn't see it).
  menu.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  // A modal dialog's backdrop is part of it: a click there targets the dialog, outside its box.
  menu.addEventListener('click', (event) => {
    if (event.target === menu && !isInside(menu.getBoundingClientRect(), event.clientX, event.clientY)) close();
  });
  view.addEventListener('blur', close);

  return {
    element: menu,
    open(entries, { anchor, x, y, label, focusTo }) {
      shut();
      menu.replaceChildren(...entries.map((entry) => {
        if (entry === 'separator') {
          const line = doc.createElement('hr');
          line.setAttribute('role', 'separator');
          return line;
        }
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.tabIndex = -1;
        button.textContent = entry.label;
        button.disabled = Boolean(entry.disabled);
        button.addEventListener('click', () => {
          close();
          entry.run();
        });
        return button;
      }));
      if (label) menu.setAttribute('aria-label', label);
      else menu.removeAttribute('aria-label');

      const active = focusedIn(menu) ?? focusedElement(doc);
      returnFocus = focusTo ?? anchor ?? (active instanceof view.HTMLElement ? active : null);
      if (anchor?.hasAttribute('aria-haspopup')) {
        anchor.setAttribute('aria-expanded', 'true');
        expanded = anchor;
      }
      menu.showModal();
      const { width, height } = menu.getBoundingClientRect();
      const { left, top } = menuPosition({ width, height }, { width: view.innerWidth, height: view.innerHeight }, {
        anchor: anchor?.getBoundingClientRect(), x, y, placement, rtl: view.getComputedStyle(menu).direction === 'rtl',
      });
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      items()[0]?.focus();
    },
    close,
    destroy() {
      shut();
      view.removeEventListener('blur', close);
      menu.remove();
    },
  };
}

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
export function moreActionsButton(name, { label, className, focusable = true, tooltip = false, onClick, doc = document } = {}) {
  const text = label ?? `More actions for “${name}”`;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className ? `icon-button ${className}` : 'icon-button';
  button.setAttribute('aria-label', text);
  button.setAttribute('aria-haspopup', 'menu');
  if (tooltip) button.title = text;
  if (!focusable) button.tabIndex = -1;
  const icon = doc.createElement('span');
  icon.className = 'icon icon-more-vert';
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  if (onClick) button.addEventListener('click', (event) => onClick(button, event));
  return button;
}
