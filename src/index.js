/**
 * The kit's browser half: what an extension's pages, offscreen document and
 * service worker load. Every function takes the `chrome` APIs it uses as
 * arguments, so tests run the real logic against fakes.
 *
 * Build-time helpers are in `@arraypress/extension-kit/build`, test helpers
 * in `@arraypress/extension-kit/testing`, and the stylesheet is
 * `@arraypress/extension-kit/chrome-ui.css`.
 *
 * @module extension-kit
 */

export { githubAboutLinks, isPlaceholder } from './about/links.js';
export { setShortcuts } from './commands/shortcuts.js';
export { localize, translator } from './dom/i18n.js';
export { byId, setAboutLinks, statusFlasher, valueRow } from './dom/page.js';
export { createSettingsSaver } from './settings/saver.js';
export { MAX_SYNC_ITEM_BYTES } from './settings/storage.js';
export { createSettingsStore } from './settings/store.js';
export { POLL_MS, watchSchemeOffscreen } from './toolbar/offscreen.js';
export { DARK_QUERY, TOOLBAR_DARK_KEY, TOOLBAR_SCHEME, reportColorScheme, schemeSender, watchColorScheme } from './toolbar/scheme.js';
export {
  OFFSCREEN_PATH, TOOLBAR_ICON_DIR, createToolbarTheme, startToolbarTheme, toolbarIcon, watchFromOffscreen,
} from './toolbar/theme.js';
