# Changelog

All notable changes to `@arraypress/extension-kit` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.0] — unreleased

### Added

- **`createZip({store, zip64, heldBytes, date})`** (`files/zip.js`), `crc32(bytes, seed?)`, `isStoredName(name)`, `HELD_BYTES`, `SLICE_BYTES`: a ZIP written a file at a time with no dependencies. `add(name, blobOrBytes)` is async and writes in the order added; formats that are compressed already are stored, the rest deflated by the platform's `CompressionStream('deflate-raw')`; ZIP bytes go into a growing `Blob` every 16 MiB and a `Blob` is read in 4 MiB slices, so memory stays flat for a file of any size; ZIP64 is written when a file or the ZIP passes 4 GiB or there are more than 65,535 files (`zip64: true` forces it). Stored files are read twice (CRC-32 first) so they need no data descriptor, which some readers refuse on a stored entry; deflated ones have one. UTF-8 names in a ZIP marked as made on Unix, since Info-ZIP's `unzip` (macOS, Linux) fails to extract “Zürich.png” from one marked MS-DOS, as fflate's are. A name already in the ZIP is refused, and a file that can't be read leaves the ZIP as it was. Replaces Better Saves' `shared/save/zip.js` (fflate's streaming `Zip`, 32-bit only, hence its 3 GB limit) and Better Screenshots' `zipSync` in `editor/export.js`: fflate is no longer needed to write a ZIP (it is a devDependency here, to read the writer's ZIPs back in tests). For Better Images first.
- **`saveFiles(files, downloads, doc?)`** (`files/save.js`), `KEEP_URL_MS`: `{name, blob}` files saved through `chrome.downloads` when it's granted (`conflictAction: 'uniquify'`), else by a link's download; each blob address revoked after 60 s. Moved from Better Screenshots (`editor/save.js`), same signature; `doc` now defaults to `globalThis.document`, so a worker with `chrome.downloads` can call it.
- **`isLocalUrl(url)`** and **`isWebUrl(url)`** (`sites/sites.js`): whether an address is on this computer or its own network rather than the internet (`localhost`, dotless names, `.local`, `.lan`, `.internal`, `.localhost`, `.home.arpa`, and the loopback, private and link-local ranges of IPv4 and IPv6, however the address is written), and whether it is http(s) at all. Moved from Clean Links (`shared/sites.js`), where the redirect check stops at a hop from the internet into the person's network; Better Bookmarks' link checker needs the same guard, and a guard is not something to keep two copies of.

- **`ownRequests({webRequest, extensionId})`** (`net/requests.js`), `OWN_REQUESTS`, `HEADERS_WAIT_MS`: one request from a service worker that follows nothing (`redirect: 'manual'`, no cookies, no referrer, no cache, the caller's headers), with what `fetch` hides of a redirect (its status and `Location`) read through webRequest's report of the same request; `listen()` attaches the webRequest listeners only while requests are being made. The technique Clean Links' “Check the link” found (its `background/requests.js`, which can now be built on this); Better Alerts' background checks need it to look at every hop before making it, so a page on the internet can never send a check into the person's own network (`isLocalUrl`).
- **`watchFromOffscreen(api, url, justification, reasons)`** and **`startToolbarTheme(api, {reasons})`**: Chrome's reasons for whatever else the one offscreen document does, after MATCH_MEDIA (`['DOM_PARSER']` for Better Alerts, whose document also reads fetched pages).

## [1.11.1] — 2026-11-12

### Fixed

- **A ⋮ menu opened from the keyboard opens over its button, not in the window's corner.** The menu measured its button after opening, and opening takes the focus: a button shown only while its row is hovered or holds the focus (a side panel row's `.sp-suffix`, as in Tabby's panel) had no box by then. The button's box is read before the menu opens; a button that isn't drawn at all (a row's Menu key or Shift+F10 while its buttons are hidden) gives its nearest drawn ancestor's box, the row's. chrome-ui.css keeps a row's `.sp-suffix` shown while one of its buttons has its menu open (`aria-expanded="true"`), so the button the focus returns to doesn't vanish under the menu.
- **The toast stays while the keyboard focus is on Undo, or the pointer is over it**, and its wait starts again in full once they leave: its timer ran out under a keyboard user who had tabbed to Undo. As Chrome's own cr-toast, which stops its timer on `focusin` and restarts it on `focusout` (`cr_toast.ts`); the pointer holds it the same way (WCAG 2.2.1). `showPageToast` has no action to reach and is unchanged.

## [1.11.0] — 2026-11-12

Fixes from a review of the whole kit, and what the extensions' own fixes needed shared.

### Added

- **`syncItemBytes(key, value)`** is exported: what Chrome Sync counts for one item, for anything that packs data into sync items itself (Tabby's shards) and for the fake storage.
- **`contextMenuBuilder(chrome)`** (`scripting/context-menus.js`): the right-click menu built whole (`removeAll`, then each item in order, a refused one logged), one build after another. A worker that builds its menu on install and on browser start got both events in one run after a Chrome update, and the two builds' creates interleaved: “Cannot create item with duplicate id” on the Errors page. Replaces the same `removeAll`-and-create code in Better Copy, Better Tables and Clean Links.
- **`createHostedModelSession({name, options, initialPrompts, runtime, open})`** and **`serveModelOffscreen(runtime)`** (`ai/host.js`), `MODEL_HOST`, `HOST_GRACE_MS`: Chrome's on-device model for a service worker wherever Chrome puts the Prompt API. Chrome's documentation says workers have none; Chrome 157.0.8103.51 and Chromium 156 do have `LanguageModel` in an extension's service worker (checked in both with an unpacked extension: `'function'` in the worker, an extension page and an offscreen document). The hosted session is the same `ModelSession`, asking the worker's own API when there is one and otherwise the extension's offscreen document over `chrome.runtime` messages (state, answers with their time limit and schema, aborts, release; content scripts and other extensions ignored). For Topicless and Tabby.
- **`watchFromOffscreen(api, url, justification)`** and **`startToolbarTheme(api, {url, justification})`**: the offscreen document's justification can say everything it does (the scheme and the model).
- **`use_dynamic_url` for page modules, settled** (README, `scripting/call.js`, `tests/chrome-chromium.test.js`): in Chromium 156 `callInPage`'s import from the isolated world works with it and the page's own `import()` and `fetch()` of the module are refused (a page can't detect the extension), but a dynamic-URL module's static `import … from './part.js'` is refused too. The family's page modules import their parts and the kit and have no bundler, so it is not the recommendation; it suits a single-file page module.
- **`createShowOnPage({show, onChange})`** (`panel/show-on-page.js`): a side panel's “Show on page” state, for Better Fonts and Better Colours, whose panels both forgot what was shown on a rescan without clearing the page's boxes and kept the button pressed after Esc on the page. `toggle(id, ids, revealFrame)`, `reset()` (a rescan, or the panel closing: the page's boxes go, the call sent at once), `cleared()` (the page says its boxes went), `shown()`.
- **`createHighlighter`'s `onClear(reason)`**: `'escape'`, `'replaced'`, `'asked'` or `'pagehide'`, so the page's side can tell the panel about the ones it didn't ask for. The boxes now also go when the page is left (a page kept for Back came back with stale ones).
- **`callInPage(…, {timeoutMs})`** (rejects with a `TimeoutError`) and **`callInTab(…, {timeoutMs})`** (`{state: 'timeout'}`): Chrome answers `executeScript` only once every frame has (checked in Chromium 156), so one frame that never did left a panel waiting for ever.
- **`callInTab`'s `{state: 'failed', error}`** and a frame's `error` from `callInPage`, `CALL_FAILED`: Chrome gives a bare `null` for a page function that throws or a module that doesn't load (checked in Chromium 156: no rejection, for one frame or all), so a bug in the page module read as “no access”. `importAndCall` now catches and says why.
- **`pageOverlay(doc, {topLayer: true})`** and the overlay's `raise()`: the host as a manual popover in the top layer, over the page's modal dialogs, popovers and fullscreen element, put back on top when the page opens one after it. What a modal dialog makes inert stays inert (the overlay shows over it but can't be clicked while it's open).
- **`focusedIn(node)`** (`dom/focus.js`): the focused element as seen from a node's own root, a closed shadow root included.
- **chrome-ui.css on a right-to-left page**: logical properties throughout (paddings, margins, the toast's and drawer's corner, the menu pills' rounded end), and the pieces that need mirroring mirror (a select's arrow, the switch's knob, the link-row arrow, the drawer's slide). Left to right is unchanged.
- **`store.retryable(storage)`**: whether trying again could put anything held into sync (something held is still the newest and small enough).
- **`stopWorker(launched, {start})`** (`/testing`): stops the extension's service worker as Chrome does when it's idle (memory gone, storage and listeners kept) and starts it again, or leaves it for the next event. Playwright's debugger keeps a worker alive for a whole run, so no e2e check ever met a restarted worker; now one can. The same `Worker` handle is kept.
- **`fakeChromeStorage`** has `clear`, `getBytesInUse`, `onChanged.removeListener`/`hasListener`, each area's own `onChanged`, and `SYNC_MAX_ITEMS`, `SYNC_WRITES_PER_HOUR`, `LOCAL_QUOTA_BYTES`.
- **`reportFolder(dir, {own})`** and `REPORT_MARKER` (`/testing`): a live report's folder, emptied only when the kit made it.
- **`fakeLanguageModel`'s `userActivation`** state: whether a click is behind a `create()` that has to download the model.

### Fixed

- **`syncItemBytes` counts as Chrome does.** Chrome measures an item as its key plus the value written by its own JSON writer, which spells `<` as `\u003C` and U+2028 / U+2029 as `\u2028` / `\u2029` (six bytes each; `settings_storage_quota_enforcer.cc`, `base/json/string_escape.cc`). The kit counted `JSON.stringify`'s bytes, so text full of `<` passed as small and Chrome refused the whole write.
- **One item Chrome refuses no longer keeps the settings written with it out of sync.** A refused batch (for anything but the write rate) is tried again one item at a time; before, every retry sent them together and failed together, for good.
- **Two refused writes at once keep both changes**, and **a retry can't put an older value back over a newer save**: holding a change (a read-modify-write of one local item) runs under a Web Lock shared by the extension's pages and worker, and a write that had to wait checks that sync still holds what it sent.
- **A held change no longer shadows, then overwrites, a newer one from another computer.** Beside the held changes the store keeps what sync held for each when it was refused (`<unsyncedKey>Was`); once sync holds something else, the held one is the older and is dropped. A change held by an earlier version (nothing to compare) is read and retried as before.
- **A site typed as a match pattern can't break the content script's registration.** `siteHost('*.example.com')` gave `*.example.com`, and `hostPatterns` made `*://*.*.example.com/*` of it, which Chrome refuses (“Invalid host wildcard”) together with the whole `registerContentScripts` / `updateContentScripts` call (checked in Chromium 156, `tests/chrome-chromium.test.js`): the script stopped following the settings, and on a computer where it wasn't registered yet it ran nowhere. A leading `*.` (and `*://`) is now dropped, since a listed site covers its subdomains anyway, and only a real host name is a site: `*` elsewhere, a comma, an empty label (`a..b`, `.com`) give null from `siteHost` and `siteOrigin`. Lists already stored are put right the next time they're normalised.
- **A base model session Chrome has let go is made again** (`createModelSession`): it was dropped only when `create()` failed, so in a long-lived page every later question came back `'failed'` once `clone()` started rejecting.
- **“Show on page” boxes are moved, not remade, as the page scrolls** (`createHighlighter` removed and created up to 500 elements every frame), and a pending frame is cancelled when they're cleared.
- **`watchChanges` sorts a batch into subtrees by walking up from each node**, not by asking every pair (`contains()` 16 million times for 4,000 nodes a feed added at once, on the page's main thread), and **what changes inside the extension's own elements sets nothing off** (`ignore` is asked of a change's target and its ancestors: an extension setting its own note's text again re-triggered itself).
- **The ⋮ menu in a closed shadow root** (what `pageOverlay` makes): ↑/↓ stayed on the first and last items and the focus went back to the host, since the document can't see into a closed root; the menu asks its own root (`focusedIn`). Its keys no longer reach the page's own shortcut handlers (`stopPropagation`), its button's `aria-expanded` follows a close made any other way, `destroy()` takes it off the page and removes its window listener, and on a right-to-left page it lines up with its button's left edge (`menuPosition`'s `rtl`).
- **The text dialog**: a field's reason is announced as it appears (`aria-live`) and the field marked `aria-invalid` (the stylesheet already styled it); a dialog closed by anything but its own buttons is cancelled instead of leaving its promise unanswered.
- **A site list keeps the focus across a redraw** (the row after a removed one, else the way to add): the row's button that a dialog or menu gave the focus back to was replaced, and the focus fell to the page. The add row's field is cleared only if it still holds what was added.
- **`createToast().show()` on a toast taken off the page** (a site replaced its body) puts it back instead of throwing.
- **The model row after a download** shows this page's state when the worker can't be asked, instead of an unhandled rejection and a row left downloading.
- **`windowChrome`** escapes icon addresses and a favicon's letter (an `&` made the SVG ill-formed and the image failed to load) and draws a window without tabs instead of throwing.
- **`eachLimited` with a limit of 0, less, or not a number** runs the work one at a time; it resolved having done nothing.
- **`inSlices` cuts the page as the work goes** (the whole page's text was measured at every level before the first slice), and scripts, styles and templates inside a part that's cut are no longer handed over as blocks.
- **The saver stops retrying when all that's held is too big for sync** (it retried every minute for as long as the page was open), and `stop()` holds even if a write is still finishing.
- **`missingReferences` let a broken store build pass.** A file that's in the folder but left out of the zip (an SVG under `icons/`, a declaration, a vendor stamp) counted as there; and a bare `import './x.js'`, double-quoted imports, single-quoted `src`/`href`, a stylesheet's `url()` and `@import`, and the manifest's `content_scripts`, `default_locale`, `options_page`, `devtools_page`, rule files, overridden and sandboxed pages weren't read at all. A path starting `/` is read from the extension's root (it was reported missing).
- **`fakeChromeStorage` behaves as Chromium does** (each point read from Playwright's Chromium): sync's item limit counted in bytes as Chrome counts them (4,000 CJK characters, 12 KB, were accepted; it counted UTF-16 units), its 512 items and 1,800 calls an hour enforced, the write limits counted for each of `set`, `remove` and `clear` by itself with refused calls included, Chrome's own error texts (`Resource::kMaxItems quota exceeded`), `get({key: default})` giving the defaults (it gave `{}`), no `onChanged` for the same object with its keys in another order, values stored as Chrome converts them (`undefined`, functions and `NaN` dropped, a `Date` or `RegExp` as `{}`; they were JSON's), and local and session's 10 MB.
- **`runLiveCheck` never deletes a folder it didn't make**: `--out .` (or `~/Desktop`) emptied that folder before the run. A folder with files in it that isn't an earlier report is refused.
- **`runLiveCheck`: a visit that throws is reported with its error** (it was `'timed out'`), and a browser that crashed, or a page that couldn't be opened, no longer ends the whole run with every result lost: the site is `failed`, the slot gets a new browser.
- **`vendor-check` sees more than a version**: a copy edited by hand, a package whose files changed under the same version, and a vendor folder with no copies at all (a mistyped path passed as "matches"). `vendor` refuses two paths that would land in the same place (`dist/index.js` and `rules/index.js`: the second silently replaced the first) and a destination holding a `manifest.json`, `package.json` or `.git` (`extension-kit vendor extension` deleted the extension).
- **`fakeLanguageModel`: a destroyed session stops answering** (`InvalidStateError`, and `AbortError` for an answer under way), as Chrome's does; it went on answering, so a use-after-destroy passed.
- **`playPermissionPrompt` refuses a request with no click behind it**, as Chrome does; it answered “granted”.
- **`messageLookup` fills messages as Chrome does**: bare `$1`–`$9`, `$$`, names in any case, numbers as substitutions; and throws for a message naming a placeholder it doesn't define, which Chrome refuses to load (it gave '').
- **`checkRunner().finish()` fails a run in which no check ran**; **`launchExtension` says so when Chrome refuses the extension** (it waited 30 s for a worker and left the browser running); **`recordIconCalls` records an icon given as `imageData`** (it recorded `undefined`).

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
