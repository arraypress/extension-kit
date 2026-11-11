# Changelog

All notable changes to `@arraypress/extension-kit` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] — Unreleased

### Added

- **Chrome's window around a capture** (`frame/window.js`, in the runtime half): `windowChrome`, `THEMES`, `letterIcon` moved there from `build/store-frame.js` (which re-exports them), plus `windowChromeSvg` (the tab strip and toolbar as an SVG image an extension page draws on a canvas, sharp at any scale; Chrome doesn't taint the canvas) and `WINDOW_BARS`/`WINDOW_W`. Better Screenshots draws it around a capture; the store screenshots use the same drawing. The markup's `<img>`s are self-closed so it parses as XML.

## [1.7.0] — 2026-11-11

### Added

- **Chrome's on-device model** (`ai/`, in the runtime half): `createModelSession` (one base session with the instructions, a `clone()` per question, every answer within its time limit through an `AbortSignal`, a cold start answered `'late'` while the session keeps loading for the next, `release`), `modelAvailability` (never throws; `'missing'` without a Prompt API), `downloadModel` (from a click, with Chrome's progress), `describeModel` and `MODEL_MESSAGES` (the settings page's words under standard keys), `chromeLanguageModel`. From Better Downloads' `ai/namer.js` and `ai/edge.js`; Topicless is the first user, Better Downloads and Tabby to follow.
- **`createModelRow`** (`ui/`): the settings row “Chrome’s built-in AI”, its state, help and Download button with progress (Better Downloads' `options/model-section.js`).
- **`fakeLanguageModel`** (`/testing`): the Prompt API's shape for tests, moved from Better Downloads' `test/fakes/fake-model.js`, with failed downloads and answers, `responseConstraint` and clones logged.
- **Content-script helpers** (`content/`, in the runtime half): `inSlices` and `blocksOf` (a page worked through in blocks and slices that hand the main thread back) and `watchChanges` (one batch of what changed, the extension's own nodes ignored through `ignore`), from Better Prices' `content/slices.js` and `content/watch.js`, shared with Topicless.
- **`runChecks`** and **`messageLookup`**/**`readMessages`** (`/testing`): an e2e script's run (clean-ups always, each within 30 s) and `chrome.i18n.getMessage` over the real `_locales`, from the copies in Better Prices, Better Downloads, Better Saves and Clean Links.
- **`fakeChromeStorage`'s sync refuses a write past 102,400 bytes in all** (`SYNC_QUOTA_BYTES`), as Chrome's `QUOTA_BYTES` does: Topicless keeps word lists in sync and fits them to it.
- **A subpage's header** (`.subpage-head`, `.icon-arrow-back`): settings-subpage's back button and title, at the top of its card (Topicless' topic page).
- **The text dialog's fields**: `multiline` (a textarea, `rows`), `hint` (help under the field, or a function of its text), and a `value` that's a promise (`waiting` shown, the field disabled until it comes). For Topicless' word lists, which Chrome's on-device model suggests.

## [1.6.0] — 2026-11-11

### Added

- **`contentScriptSync(scripting, id, want)`** (`scripting/`, in the runtime half): keeps one registered content script in line with what may run (registered, updated or unregistered), changes one after another so quick setting and permission changes can't race. Replaces the same queue-and-register code in Upright, Clean Links and Bannerless; first used by Better Prices.
- **`eachLimited`** in the runtime half (`time/pool.js`, from the main entry), so an extension page can fetch a few files at a time (Better Saves); `/testing` still exports it.
- **`launchDownloading(chromium, dir, options)`** and **`filesIn(dir)`** (`/testing`): an extension in a browser that downloads for real, into a Downloads folder of its own, rather than Playwright's made-up names (from Better Downloads' e2e helper; Better Saves checks its files on disk with it).
- **`serve(routes, { tls })`** and **`testCertificate()`** (`/testing`): the test server over HTTPS with a throwaway certificate (`openssl`), for a site Chrome only reaches over HTTPS (every HSTS-preloaded one, YouTube's among them) mapped to it with `--host-resolver-rules`, Chromium started with `--ignore-certificate-errors`. For Better Saves' check that it does nothing on YouTube.
- **Live checkers** (`/testing`): `parseLiveOptions` (the command line), `parseProxy` and `exitPoint` (where the traffic leaves from), from Bannerless's `test/live/lib/`, for Better Prices' live check of real shops.

## [1.5.0] — 2026-11-10

### Added

- **`askFields`**: the text dialog with several fields, as chrome://settings/searchEngines asks for a site search. Each field has its own label, placeholder, `validate` and reason under it; the action button waits for all of them; the answer is each field's text by `name`. The focus starts in the first empty field. `fieldIds` gives a field's element ids for tests. For Better Downloads' folder rules (“Downloads from” and “Folder”).
- **`placeholder`** on `askText`'s field.

### Changed

- **`askText` is `askFields` with one field**, with the same ids (`text-dialog-input`, `text-dialog-error`, `text-dialog-confirm`); the dialog's fields are made each time it's asked, so `#text-dialog-label` is gone.

## [1.4.0] — 2026-11-10

### Added

- **The extension's name in messages**: `translator` (and so `localize`, `setUpPage`'s title and the `t` it returns) fills `$1` with the extension's name, `extShortName`, whenever a lookup has no substitutions. A message that names the extension (`"About $NAME$"`, content `$1`) needs nothing from the page: `data-i18n="optionsAbout"` reads “About Upright”. Replaces Clean Links' `data-name` loop and Bannerless' hand-filled headings.
- **`createSiteList({t})`**: given the page's message lookup, the list's words are its messages under standard keys, `SITE_LIST_MESSAGES` (`optionsAdd`, `optionsAddSite`, `optionsEditSite`, `optionsEdit`, `optionsRemove`, `optionsSave`, `optionsCancel`, `optionsSiteLabel`, `optionsSiteInvalid`, `optionsMoreActions`, `optionsRemoveLabel`); `words` overrides only those that differ. `SITE_LIST_WORDS` is exported from the package root. Replaces the same words block in Clean Links, Bannerless, Upright and Better Tables.
- **`within`** (`time/`) is in the runtime half, exported from the main entry and vendored with the rest (`RUNTIME_ENTRIES` gains `time`), for a service worker that mustn't wait on a Chrome call forever (Better Downloads).
- **`withSite`, `withoutSite`, `withSiteReplaced`** (`sites/`): a site list with a site added (at the end, once), taken out, or edited in place (merged with a duplicate). Replaces the same three list edits in every extension's site lists.

### Removed

- **`within` from `/testing`**: import it from the main entry (`@arraypress/extension-kit`).

## [1.3.0] — 2026-11-10

### Added

- **Sites** (`sites/`): `siteOrigin`, `siteHost`, `onSite`, `hostPatterns`, `originPattern`, `siteLabel`, `MAX_HOST_LENGTH`: what people type into a per-site list, and whether a page is on one (subdomains included). From Upright's, Better Tables', Bannerless', Clean Links' and More Tab Actions' copies.
- **`createSiteList`** (`ui/site-list.js`): a settings card's site list, with an add row (Upright, Better Tables, Bannerless) or an Add button, the one-field dialog and a ⋮ menu with Edit and Remove per row (More Tab Actions, Clean Links); `SITE_LIST_WORDS` for translations. `chrome-ui.css`: `.row.add`.
- **`setUpPage(chrome, {title})`** (`dom/setup.js`): what every page does first (report its colour scheme, localise, set the title). From Bannerless' `page-setup.js`.
- **`focusedElement`** (`dom/focus.js`): the focused element through open shadow roots.
- **`/build`**: `renderIcons` and `ICON_SIZES` (the manifest's icons from `icon.svg`); `vendorPackage` and `packageDir` (files of any installed package into `extension/vendor/`), `checkVendored` and `VENDOR_STAMP` (each copy is stamped with its package's version; a stale one is named); `buildTestCopy`, `testBuildDir` and `TEST_BUILDS_ENV` (test builds in `.test-builds/`, movable with `EXTENSION_TEST_BUILDS`); `storeFrame` (the store-screenshot canvas and Chrome window, from Upright's `store/tools/frame.mjs`).
- **`extension-kit` command**: `vendor <dir> <package> <path>...`, `vendor-check [dir]`, `icons [dir]`, `toolbar-icons [dir]`.
- **`/testing`**: a time limit per check in `checkRunner` (`CHECK_MS`, 60 s; `checkRunner({timeout})`, `check(name, fn, {timeout})`), so a hang fails instead of blocking; `within` (a value in time, or a fallback, its timer cleared), `eachLimited` (a pool), `realisticBrowser`, `chromeUserAgent` and `closeOnSignal` (a live run that passes for a person's browser and closes it on Ctrl-C), `testBuildDir`. From Bannerless' live checker.

### Changed

- **`createMenu` and `createToast`** take `root` (an element or a shadow root, e.g. a content script's) and read the focus through shadow roots. A content script that loads `ui/menu.js` or `ui/toast.js` from a vendored copy must list `vendor/extension-kit/dom/focus.js` in `web_accessible_resources` too.
- **The toast is a manual `popover`**, in the top layer: over anything a page stacks. It's open while `:popover-open` (no longer `hidden`).
- **`vendorKit`** writes `vendored.json`; the zip helpers leave it out (`ZIP_EXCLUDE`, `shipsFile`). A vendored copy now includes `sites/`.

## [1.2.0] — 2026-11-09

### Added

- **Page components** (the browser half, `ui/`): `createMenu` (Chrome's ⋮ action menu on a modal `<dialog class="menu">`: over its button or at a point, kept on screen, closed by a click outside, Esc, Tab or blur, ↑/↓/Home/End, focus returned; `placement: 'below'` as an option) with `menuPosition` and `isInside`; `moreActionsButton` (the ⋮ row button, "More actions for “…”"); `askText` (the one-field dialog: Save off while blank or invalid with the reason under the field, Enter saves, Esc cancels) with `checkText`; `createToast` (the toast with Undo, 10 seconds as chrome://bookmarks) and `TOAST_MS`. From More Tab Actions' and Tabby's copies.
- **`chrome-ui.css`**: `--icon-more-vert` (cr:more-vert) and `.icon-more-vert`, a ⋮ icon without a sprite.
- **`/testing`**: `installWarnings`, `warningsAddedBy` and `withoutPermissions` (Chrome's install warnings for a manifest, from More Tab Actions' `alarms` check); `savedTabGroups` (Chrome's saved tab groups from a closed profile, from More Tab Actions' `saved-groups.mjs`); `referencedPath`.

### Fixed

- **`missingReferences`** ignores a `#fragment` or `?query`: `getURL('options.html#workspaces')` is `options.html`, no longer reported missing. Page links with one (`href="help.html#faq"`) are now checked too, where before they were skipped.
- **`manifestReferences`** takes a typed manifest (no `any`) and reads an `action.default_icon` given as one path.

## [1.1.0] — 2026-11-09

### Added

- **`/testing`**: `extensionProfile` (start the browser on one profile more than once), `serve` (test pages on 127.0.0.1), `checkRunner().fail` (count an error found outside a check), and `profile` on what `launchExtension` returns.

### Changed

- **`until`** resolves to its value typed without the falsy ones (`until(() => ready && text, …)` is a string).

## [1.0.0] — 2026-11-09

### Added

- **`chrome-ui.css`**: the Chrome-native page styles, formerly the `Extensions/_chrome-ui` kit copied into each extension.
- **`createSettingsStore(schema)`** and **`createSettingsSaver(store, storage)`**: settings on Chrome Sync, one item per setting, per-computer keys in local, debounced writes, refused writes kept and retried. From More Tab Actions' and Upright's `settings.js`, generalised to a schema of defaults and a normaliser.
- **Toolbar glyph**: `createToolbarTheme`, `startToolbarTheme`, `watchFromOffscreen`, `watchSchemeOffscreen`, `watchColorScheme`, `reportColorScheme`, `schemeSender`, `toolbarIcon`.
- **About links**: `githubAboutLinks`, `isPlaceholder`.
- **`/build`**: `renderToolbarIcons`, `zipExtension`, `shipsFile`, `vendorKit`, `placeholderWarning`, `repositoryReminder`, `printReleaseChecks`, `findDisallowedClones`.
- **`/testing`**: `fakeChromeStorage`, `launchExtension`, `until`, `offscreenEmulator`, `recordIconCalls`, `filesUnder`, `zipEntries`, `missingReferences`, `manifestReferences`.
- **`extension-kit` command**: `vendor <dir>` and `duplication`.
