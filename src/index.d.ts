/**
 * The kit's browser half: what an extension's pages, offscreen document and
 * service worker load, Chrome's page components (the ⋮ menu, the one-field
 * dialog, the toast with Undo, a settings card's site list) and per-site
 * lists' sites included. Every function takes the `chrome`
 * APIs it uses as arguments, so tests run the real logic against fakes.
 *
 * Build-time helpers are in `@arraypress/extension-kit/build`, test helpers
 * in `@arraypress/extension-kit/testing`, and the stylesheet is
 * `@arraypress/extension-kit/chrome-ui.css`.
 *
 * @module extension-kit
 */
export { githubAboutLinks, isPlaceholder } from './about/links.js';
export { setShortcuts } from './commands/shortcuts.js';
export { focusedElement } from './dom/focus.js';
export { localize, translator } from './dom/i18n.js';
export { byId, setAboutLinks, statusFlasher, valueRow } from './dom/page.js';
export { setUpPage } from './dom/setup.js';
export { contentScriptSync } from './scripting/registration.js';
export { createSettingsSaver } from './settings/saver.js';
export { MAX_SYNC_ITEM_BYTES } from './settings/storage.js';
export { createSettingsStore } from './settings/store.js';
export { MAX_HOST_LENGTH, hostPatterns, onSite, originPattern, siteHost, siteLabel, siteOrigin, withSite, withSiteReplaced, withoutSite, } from './sites/sites.js';
export { within } from './time/time.js';
export { POLL_MS, watchSchemeOffscreen } from './toolbar/offscreen.js';
export { DARK_QUERY, TOOLBAR_DARK_KEY, TOOLBAR_SCHEME, reportColorScheme, schemeSender, watchColorScheme } from './toolbar/scheme.js';
export { OFFSCREEN_PATH, TOOLBAR_ICON_DIR, createToolbarTheme, startToolbarTheme, toolbarIcon, watchFromOffscreen, } from './toolbar/theme.js';
export { MENU_EDGE, createMenu, isInside, menuPosition, moreActionsButton } from './ui/menu.js';
export { SITE_LIST_MESSAGES, SITE_LIST_WORDS, createSiteList } from './ui/site-list.js';
export { askFields, askText, checkText, fieldIds } from './ui/text-dialog.js';
export { TOAST_MS, createToast } from './ui/toast.js';
export type ContentScript = import('./scripting/registration.js').ContentScript;
export type ActionMenu = import('./ui/menu.js').ActionMenu;
export type MenuEntry = import('./ui/menu.js').MenuEntry;
export type MenuItem = import('./ui/menu.js').MenuItem;
export type MenuPlace = import('./ui/menu.js').MenuPlace;
export type SiteList = import('./ui/site-list.js').SiteList;
export type FieldRequest = import('./ui/text-dialog.js').FieldRequest;
export type FieldsRequest = import('./ui/text-dialog.js').FieldsRequest;
export type TextRequest = import('./ui/text-dialog.js').TextRequest;
export type Toast = import('./ui/toast.js').Toast;
/**
 * The page helpers' types, for a page's JSDoc.
 *
 * @typedef {import('./scripting/registration.js').ContentScript} ContentScript
 * @typedef {import('./ui/menu.js').ActionMenu} ActionMenu
 * @typedef {import('./ui/menu.js').MenuEntry} MenuEntry
 * @typedef {import('./ui/menu.js').MenuItem} MenuItem
 * @typedef {import('./ui/menu.js').MenuPlace} MenuPlace
 * @typedef {import('./ui/site-list.js').SiteList} SiteList
 * @typedef {import('./ui/text-dialog.js').FieldRequest} FieldRequest
 * @typedef {import('./ui/text-dialog.js').FieldsRequest} FieldsRequest
 * @typedef {import('./ui/text-dialog.js').TextRequest} TextRequest
 * @typedef {import('./ui/toast.js').Toast} Toast
 */
