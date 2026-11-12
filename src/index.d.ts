/**
 * The kit's browser half: what an extension's pages, offscreen document,
 * service worker and content scripts load, Chrome's page components (the ⋮
 * menu, the text dialog, the toast with Undo, a settings card's site list,
 * the built-in AI row), Chrome's window drawn around a capture, per-site lists' sites, Chrome's on-device model,
 * a content script's slices, change watcher, overlay and “Show on page” boxes, a module's
 * function called in a page or every frame of a tab, a tab's side panel opened from a click,
 * copying (plain text and HTML), and making elements and icon buttons in a line. Every function takes the `chrome`
 * APIs it uses as arguments, so tests run the real logic against fakes.
 *
 * Build-time helpers are in `@arraypress/extension-kit/build`, test helpers
 * in `@arraypress/extension-kit/testing`, and the stylesheet is
 * `@arraypress/extension-kit/chrome-ui.css`.
 *
 * @module extension-kit
 */
export { githubAboutLinks, isPlaceholder } from './about/links.js';
export { MODEL_MESSAGES, chromeLanguageModel, createModelSession, describeModel, downloadModel, modelAvailability, } from './ai/model.js';
export { setShortcuts } from './commands/shortcuts.js';
export { BLOCK_CHARS, SLICE_MS, blocksOf, eachInSlices, inSlices } from './content/slices.js';
export { MAX_ELEMENTS, otherSiteFrames, renderedElements, shadowRootOf } from './content/elements.js';
export { HIGHLIGHT_CSS, MAX_BOXES, createHighlighter } from './content/highlight.js';
export { pageOverlay } from './content/overlay.js';
export { PAGE_TOAST_MS, showPageToast } from './content/page-toast.js';
export { MAX_WAIT_MS, SETTLE_MS, watchChanges } from './content/watch.js';
export { copyFormats } from './dom/copy.js';
export { focusedElement } from './dom/focus.js';
export { iconButton, make, spriteIcon } from './dom/make.js';
export { MAC_WINDOW, THEMES, WINDOW_BARS, WINDOW_W, letterIcon, macWindowSvg, windowChrome, windowChromeSvg } from './frame/window.js';
export { counted, localize, translator } from './dom/i18n.js';
export { byId, setAboutLinks, statusFlasher, valueRow } from './dom/page.js';
export { setUpPage } from './dom/setup.js';
export { openSidePanel, sidePanelPath } from './panel/side-panel.js';
export { callInPage, importAndCall } from './scripting/call.js';
export { contentScriptSync } from './scripting/registration.js';
export { callInTab, isBrowserPage } from './scripting/tab.js';
export { createSettingsSaver } from './settings/saver.js';
export { MAX_SYNC_ITEM_BYTES, syncItemBytes } from './settings/storage.js';
export { createSettingsStore } from './settings/store.js';
export { MAX_HOST_LENGTH, hostPatterns, onSite, originPattern, siteHost, siteLabel, siteOrigin, withSite, withSiteReplaced, withoutSite, } from './sites/sites.js';
export { eachLimited } from './time/pool.js';
export { within } from './time/time.js';
export { POLL_MS, watchSchemeOffscreen } from './toolbar/offscreen.js';
export { DARK_QUERY, TOOLBAR_DARK_KEY, TOOLBAR_SCHEME, reportColorScheme, schemeSender, watchColorScheme } from './toolbar/scheme.js';
export { OFFSCREEN_PATH, TOOLBAR_ICON_DIR, createToolbarTheme, startToolbarTheme, toolbarIcon, watchFromOffscreen, } from './toolbar/theme.js';
export { MENU_EDGE, createMenu, isInside, menuPosition, moreActionsButton } from './ui/menu.js';
export { createModelRow } from './ui/model-row.js';
export { SITE_LIST_MESSAGES, SITE_LIST_WORDS, createSiteList } from './ui/site-list.js';
export { askFields, askText, checkText, fieldIds } from './ui/text-dialog.js';
export { noticeCard } from './ui/notice.js';
export { TOAST_MS, createToast } from './ui/toast.js';
export type Availability = import('./ai/model.js').Availability;
export type InitialPrompt = import('./ai/model.js').InitialPrompt;
export type LanguageModelOptions = import('./ai/model.js').LanguageModelOptions;
export type LanguageModelSession = import('./ai/model.js').LanguageModelSession;
export type LanguageModelStatic = import('./ai/model.js').LanguageModelStatic;
export type ModelAnswer = import('./ai/model.js').ModelAnswer;
export type ModelSession = import('./ai/model.js').ModelSession;
export type ModelStatus = import('./ai/model.js').ModelStatus;
export type SliceOptions = import('./content/slices.js').SliceOptions;
export type Highlighter = import('./content/highlight.js').Highlighter;
export type PageOverlay = import('./content/overlay.js').PageOverlay;
export type ClipboardFormats = import('./dom/copy.js').ClipboardFormats;
export type WatchHandlers = import('./content/watch.js').WatchHandlers;
export type WindowTab = import('./frame/window.js').Tab;
export type WindowTheme = import('./frame/window.js').Theme;
export type WindowShadow = import('./frame/window.js').WindowShadow;
export type ModelRow = import('./ui/model-row.js').ModelRow;
export type ContentScript = import('./scripting/registration.js').ContentScript;
export type FrameResult = import('./scripting/call.js').FrameResult<unknown>;
export type TabReading = import('./scripting/tab.js').TabReading<unknown>;
export type TabEdges = import('./scripting/tab.js').TabEdges;
export type ActionMenu = import('./ui/menu.js').ActionMenu;
export type MenuEntry = import('./ui/menu.js').MenuEntry;
export type MenuItem = import('./ui/menu.js').MenuItem;
export type MenuPlace = import('./ui/menu.js').MenuPlace;
export type SiteList = import('./ui/site-list.js').SiteList;
export type FieldRequest = import('./ui/text-dialog.js').FieldRequest;
export type FieldsRequest = import('./ui/text-dialog.js').FieldsRequest;
export type TextRequest = import('./ui/text-dialog.js').TextRequest;
export type Notice = import('./ui/notice.js').Notice;
export type Toast = import('./ui/toast.js').Toast;
/**
 * The page helpers' types, for a page's JSDoc.
 *
 * @typedef {import('./ai/model.js').Availability} Availability
 * @typedef {import('./ai/model.js').InitialPrompt} InitialPrompt
 * @typedef {import('./ai/model.js').LanguageModelOptions} LanguageModelOptions
 * @typedef {import('./ai/model.js').LanguageModelSession} LanguageModelSession
 * @typedef {import('./ai/model.js').LanguageModelStatic} LanguageModelStatic
 * @typedef {import('./ai/model.js').ModelAnswer} ModelAnswer
 * @typedef {import('./ai/model.js').ModelSession} ModelSession
 * @typedef {import('./ai/model.js').ModelStatus} ModelStatus
 * @typedef {import('./content/slices.js').SliceOptions} SliceOptions
 * @typedef {import('./content/highlight.js').Highlighter} Highlighter
 * @typedef {import('./content/overlay.js').PageOverlay} PageOverlay
 * @typedef {import('./dom/copy.js').ClipboardFormats} ClipboardFormats
 * @typedef {import('./content/watch.js').WatchHandlers} WatchHandlers
 * @typedef {import('./frame/window.js').Tab} WindowTab
 * @typedef {import('./frame/window.js').Theme} WindowTheme
 * @typedef {import('./frame/window.js').WindowShadow} WindowShadow
 * @typedef {import('./ui/model-row.js').ModelRow} ModelRow
 * @typedef {import('./scripting/registration.js').ContentScript} ContentScript
 * @typedef {import('./scripting/call.js').FrameResult<unknown>} FrameResult
 * @typedef {import('./scripting/tab.js').TabReading<unknown>} TabReading
 * @typedef {import('./scripting/tab.js').TabEdges} TabEdges
 * @typedef {import('./ui/menu.js').ActionMenu} ActionMenu
 * @typedef {import('./ui/menu.js').MenuEntry} MenuEntry
 * @typedef {import('./ui/menu.js').MenuItem} MenuItem
 * @typedef {import('./ui/menu.js').MenuPlace} MenuPlace
 * @typedef {import('./ui/site-list.js').SiteList} SiteList
 * @typedef {import('./ui/text-dialog.js').FieldRequest} FieldRequest
 * @typedef {import('./ui/text-dialog.js').FieldsRequest} FieldsRequest
 * @typedef {import('./ui/text-dialog.js').TextRequest} TextRequest
 * @typedef {import('./ui/notice.js').Notice} Notice
 * @typedef {import('./ui/toast.js').Toast} Toast
 */
