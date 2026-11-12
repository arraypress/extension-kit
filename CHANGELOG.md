# Changelog

All notable changes to `@arraypress/extension-kit` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.11.0] — unreleased

Fixes from a review of the whole kit, and what the extensions' own fixes needed shared.

### Added

- **`syncItemBytes(key, value)`** is exported: what Chrome Sync counts for one item, for anything that packs data into sync items itself (Tabby's shards) and for the fake storage.
- **`contextMenuBuilder(chrome)`** (`scripting/context-menus.js`): the right-click menu built whole (`removeAll`, then each item in order, a refused one logged), one build after another. A worker that builds its menu on install and on browser start got both events in one run after a Chrome update, and the two builds' creates interleaved: “Cannot create item with duplicate id” on the Errors page. Replaces the same `removeAll`-and-create code in Better Copy, Better Tables and Clean Links.
- **`createHostedModelSession({name, options, initialPrompts, runtime, open})`** and **`serveModelOffscreen(runtime)`** (`ai/host.js`), `MODEL_HOST`, `HOST_GRACE_MS`: Chrome's on-device model for a service worker wherever Chrome puts the Prompt API. Chrome's documentation says workers have none; Chrome 157.0.8103.51 and Chromium 156 do have `LanguageModel` in an extension's service worker (checked in both with an unpacked extension: `'function'` in the worker, an extension page and an offscreen document). The hosted session is the same `ModelSession`, asking the worker's own API when there is one and otherwise the extension's offscreen document over `chrome.runtime` messages (state, answers with their time limit and schema, aborts, release; content scripts and other extensions ignored). For Topicless and Tabby.
- **`watchFromOffscreen(api, url, justification)`** and **`startToolbarTheme(api, {url, justification})`**: the offscreen document's justification can say everything it does (the scheme and the model).
- **`use_dynamic_url` is the family's way to list page modules** (README, `scripting/call.js`): checked in Chromium 156 that `callInPage`'s import from the isolated world still works with it while the page's own `import()` and `fetch()` of the module are refused, so a page can't detect the extension.
- **`store.retryable(storage)`**: whether trying again could put anything held into sync (something held is still the newest and small enough).

### Fixed

- **`syncItemBytes` counts as Chrome does.** Chrome measures an item as its key plus the value written by its own JSON writer, which spells `<` as `\u003C` and U+2028 / U+2029 as `\u2028` / `\u2029` (six bytes each; `settings_storage_quota_enforcer.cc`, `base/json/string_escape.cc`). The kit counted `JSON.stringify`'s bytes, so text full of `<` passed as small and Chrome refused the whole write.
- **One item Chrome refuses no longer keeps the settings written with it out of sync.** A refused batch (for anything but the write rate) is tried again one item at a time; before, every retry sent them together and failed together, for good.
- **Two refused writes at once keep both changes**, and **a retry can't put an older value back over a newer save**: holding a change (a read-modify-write of one local item) runs under a Web Lock shared by the extension's pages and worker, and a write that had to wait checks that sync still holds what it sent.
- **A held change no longer shadows, then overwrites, a newer one from another computer.** Beside the held changes the store keeps what sync held for each when it was refused (`<unsyncedKey>Was`); once sync holds something else, the held one is the older and is dropped. A change held by an earlier version (nothing to compare) is read and retried as before.
- **A site typed as a match pattern can't break the content script's registration.** `siteHost('*.example.com')` gave `*.example.com`, and `hostPatterns` made `*://*.*.example.com/*` of it, which Chrome refuses (“Invalid host wildcard”) together with the whole `registerContentScripts` / `updateContentScripts` call (checked in Chromium 156, `tests/chrome-chromium.test.js`): the script stopped following the settings, and on a computer where it wasn't registered yet it ran nowhere. A leading `*.` (and `*://`) is now dropped, since a listed site covers its subdomains anyway, and only a real host name is a site: `*` elsewhere, a comma, an empty label (`a..b`, `.com`) give null from `siteHost` and `siteOrigin`. Lists already stored are put right the next time they're normalised.
- **A base model session Chrome has let go is made again** (`createModelSession`): it was dropped only when `create()` failed, so in a long-lived page every later question came back `'failed'` once `clone()` started rejecting.
- **The saver stops retrying when all that's held is too big for sync** (it retried every minute for as long as the page was open), and `stop()` holds even if a write is still finishing.

## [1.10.0] — unreleased

### Added

- **`callInTab(edges, tabId, module, name, args)`** and **`isBrowserPage(url)`** (`scripting/tab.js`): a page module called in every frame of a tab, the answers top frame first, or why it can't be read (`'browser'`: Chrome's own pages and the Web Store, told by address or by Chrome's refusal; `'no-access'`). From Better Fonts' `panel/scan.js`; Better Colours reads its palette with it.
- **`createHighlighter(doc, {root, onClear, max})`**, `HIGHLIGHT_CSS`, `MAX_BOXES` (`content/highlight.js`): “Show on page” boxes in DevTools' blue in the extension's overlay, only those in the window, following the page as it scrolls, cleared by Esc. From Better Fonts' `content/highlight.js`; Better Colours shows colours and contrast failures with it.
- **`renderedElements(doc, {skip, limit})`**, **`shadowRootOf(element)`** and **`otherSiteFrames(doc)`** (`content/elements.js`): every element Chrome draws, in document order, into open and closed shadow roots and through `display: contents` wrappers (slots). From Better Fonts' `content/text.js` walk and `otherSites`; Better Colours reads every element's colours with it.
- **`copyFormats(doc, {text, html})`** (`dom/copy.js`): plain text and HTML on the clipboard as one item (a link pastes with its title in Docs, Slack, Notion), from a page, a popup or a content script without a click (Chrome grants the active tab clipboard-write), else the copy command with a copy listener that writes both formats and keeps the page's own copy listeners out; says whether it worked (`false` on a page with `clipboard-write=()` or plain HTTP and no click), so a caller can offer another way. Made for Better Copy; Better Fonts' and Better Colours' plain-text copying (`copyFormats(doc, {text})`) uses it too, in place of Fonts' `shared/clipboard.js`.
- **`showPageToast(doc, text, {name, ms})`** and `PAGE_TOAST_MS` (`content/page-toast.js`): Chrome's “Link copied” confirmation (the dark pill with a check mark) in a page, in the kit's `pageOverlay`, as a popover in the top layer (over the page's highest fixed bars), `role="status"`; a new one replaces the last. From Clean Links' and Better Prices' toasts; Better Copy uses it.
- **`make`, `spriteIcon`, `iconButton`** (`dom/make.js`): an element with its class and text, an icon from the page's sprite, Chrome's icon button with its tooltip, for any document. From Better Fonts' panel and layer.
- **`noticeCard({icon, tone, title, text, buttons, actions})`** (`ui/notice.js`) and chrome-ui.css's `.sp-notice`: a side panel's notice card (frames from other sites to allow, a font that didn't load). From Better Fonts' `panel/render.js`.
- **`counted(count, one, many, {t, lang})`** (`dom/i18n.js`): a count in words, the number as the language writes it. From Better Fonts' panel.
- **`/testing`: `tabIdOf`, `callTabModule`, `pierceNodes`, `nodeAttribute`, `nodeText`**: a page's tab id, the page module called in its frames, and its whole tree through CDP (closed shadow roots, frames). From Better Fonts' e2e helpers.
- **`runLiveCheck`** and `liveUsage` (`/testing`): a live checker's whole run (command line, sites chosen, exit point, browsers a slot each, time limits, Ctrl-C), from Better Fonts' `test/live/run.mjs`; Better Colours' checker uses it.
- **`storeShots`, `storeShotHtml`, `contextMenuHtml`, `pngUrl`, `PANEL_W`, `PANEL_HEADER_H`** (`/build`, `build/store-shots.js`): the family's store screenshots in one style, on `storeFrame`'s canvas and window: the extension pinned in the toolbar, real captures inside, and what headless Chrome can't capture composed around the real extension UI (the popup hung from the pressed toolbar button, the side panel with its header, the right-click menu as macOS draws Chrome's); writes 1280×800 PNGs. Better Copy, Better Screenshots, Better Fonts and Better Colours make theirs with it.
- **`buildTestCopy`'s `panelOpener`** and `PANEL_OPENER` (`/build`): the test page that opens the real side panel from a click, from Better Fonts' and Better Saves' copies of `open-panel.html`.

### Fixed

- **`pageOverlay`'s host can be styled**: its inline `all: initial !important` reset beat a plain `:host { position: fixed … }` rule (only `!important` `:host` rules applied) and reset `host.style.x = …`; the new `hostStyle` option sets the host's own styles inline, `!important`, after the reset. The README and JSDoc example used the losing `:host` rule; they use `hostStyle` now. Existing callers (Better Screenshots, Better Prices, Better Fonts) are unchanged: their `:host` rules are `!important`.

## [1.9.0] — 2026-11-11

### Added

- **`callInPage(scripting, target, module, name, args)`** (`scripting/call.js`): one of an extension module's exports called in a page's isolated world (`executeScript` of a function that imports the module), each frame's result with its `frameId`; the module and its state stay loaded between calls. From Better Screenshots' `callPage`; Better Fonts uses it for its scan, inspector and highlights.
- **`openSidePanel(sidePanel, tabId, path)`** and `sidePanelPath` (`panel/side-panel.js`, a new runtime folder): a tab's own side panel opened from a click, nothing awaited before `open`. From Better Saves' `background/panel.js` (it can switch); Better Fonts opens its panel with it.
- **A plain macOS window around a capture** (`frame/window.js`): `macWindowSvg({title, theme, w})`, its title bar as an SVG image a canvas draws untainted (as `windowChromeSvg`), as macOS 26 and later draw it (measured from AppKit on macOS 27.2: a 32px title bar, 14px traffic lights, the title after them), with `MAC_WINDOW` (`titleBar` 32, `radius` 16); `THEMES` gains `titleBar`, `titleLine` and `windowShadow` (the window's shadow as numbers for a canvas; `shadow`, the CSS, is now made from it). The traffic lights' markup is shared with Chrome's strip. Better Screenshots' “Mac window” frame.
- **`eachInSlices(items, work, {sliceMs, pause})`** (`content/slices.js`): any list worked through in slices that hand the main thread back, `inSlices` now built on it. Better Fonts reads 4,000 elements' styles with it without holding the page.
- **`pageOverlay(doc, {name, css})`** (`content/overlay.js`): a content script's layer over the page, a host element with a closed shadow root and its styles, replacing one a run before left. The same few lines were in Better Screenshots' pickers, Better Prices' toast and Topicless' bar (they can switch); Better Fonts' inspector draws in it.

## [1.8.0] — 2026-11-11

### Added

- **Chrome's window around a capture** (`frame/window.js`, in the runtime half): `windowChrome`, `THEMES`, `letterIcon` moved there from `build/store-frame.js` (which re-exports them), plus `windowChromeSvg` (the tab strip and toolbar as an SVG image an extension page draws on a canvas, sharp at any scale; Chrome doesn't taint the canvas) and `WINDOW_BARS`/`WINDOW_W`. Better Screenshots draws it around a capture; the store screenshots use the same drawing. The markup's `<img>`s are self-closed so it parses as XML.
- **`saver.follow(onChange, chrome.storage.onChanged)`**: the settings changed elsewhere (another tab, another computer), this page's unwritten changes laid over them: the few lines every settings page had (Better Saves', Better Screenshots' settings page and editor).
- **`heartbeat`** (`/testing`): the longest a page's main thread was held, from Topicless' and Better Screenshots' performance checks (Topicless can switch to it).
- **`playPermissionPrompt`** (`/testing`): Chrome's permission prompt played in a page for an e2e test, moved from Topicless' e2e helpers so Better Screenshots shares it (Topicless can switch to it).

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
