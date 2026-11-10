# @arraypress/extension-kit

The pieces ArrayPress's Chrome extensions share, so each is written once:

- **`chrome-ui.css`**: one stylesheet that makes an extension page look like Chrome's own
  (chrome://settings for settings pages, chrome://bookmarks for manager pages, the side panel).
- **A settings store on Chrome Sync**: one sync item per setting, per-computer settings in local,
  debounced writes for options pages, and writes sync refuses kept on the computer and retried.
- **The light/dark toolbar glyph**: pages (or an offscreen document) report the colour scheme, the
  service worker shows the matching icon.
- **About links**: README, Issues and PRIVACY.md in the extension's GitHub repository, plus
  package-time warnings for placeholder links.
- **Chrome's page components**: the ⋮ action menu and its row button, the text dialog
  ("Rename folder", or several fields as "Add site search"), the toast with Undo and a settings card's site list, built on the
  stylesheet's classes; they work in a content script's shadow root too.
- **Sites**: what people type into a per-site list, and whether a page is on one.
- **Build and test helpers** (Node): icon rendering, vendoring npm packages (with a staleness
  check), test builds, store screenshots, zipping for the Chrome Web Store, a fake
  `chrome.storage`, Playwright helpers with time limits, packaging checks, and a copied-code guard.

Zero dependencies. Every runtime function takes the `chrome` APIs it uses as arguments, so tests run
the real logic against fakes.

## Install

```bash
npm install --save-dev @arraypress/extension-kit
```

### An extension without a bundler

A packaged extension can't load files from outside its folder, so copy the browser half in on
install, and never commit the copy:

```json
{
  "scripts": { "postinstall": "extension-kit vendor extension/vendor/extension-kit" }
}
```

```gitignore
extension/vendor/
```

Then import it relatively, and link the stylesheet first on every page:

```js
import { startToolbarTheme } from '../vendor/extension-kit/index.js';
```

```html
<link rel="stylesheet" href="../vendor/extension-kit/styles/chrome-ui.css">
```

The copy is made from the installed package every `npm install`, so it can't drift from the
version in `package.json`. The zip helper leaves its `.d.ts` files out.

Other libraries are copied the same way, by name (a path ending in `/` copies a folder's contents):

```json
{
  "scripts": {
    "postinstall": "extension-kit vendor extension/vendor/extension-kit && extension-kit vendor extension/vendor/clean-link @arraypress/clean-link src/",
    "test": "extension-kit vendor-check && eslint . && …"
  }
}
```

`npm install some-package` doesn't run the extension's own `postinstall`, so a copy can go stale
without a word. Each copy is stamped with its package's version (`vendored.json`, left out of the
zip), and `extension-kit vendor-check` fails, naming the copy, until `npm run postinstall` remakes
it. From a script: `vendorPackage(name, files, dest)`, `checkVendored(dir)`.

### An extension with a bundler

Import `@arraypress/extension-kit` directly and copy the stylesheet into the build from
`STYLESHEET` (`@arraypress/extension-kit/build`), or resolve
`@arraypress/extension-kit/chrome-ui.css`.

## Settings

```js
import { createSettingsSaver, createSettingsStore } from '../vendor/extension-kit/index.js';

export const store = createSettingsStore({
  defaults: { menuStyle: 'single', sites: [] },
  // Coerce anything (stored, typed, from a newer version) into valid settings.
  normalize: (raw) => ({
    menuStyle: raw.menuStyle === 'full' ? 'full' : 'single',
    sites: Array.isArray(raw.sites) ? raw.sites.filter((site) => typeof site === 'string') : [],
  }),
  // Tied to this computer (say, they need a site permission Chrome grants per computer).
  localKeys: ['sites'],
});

const settings = await store.load(chrome.storage);
await store.save(chrome.storage, { menuStyle: 'full' }); // → { settings, synced }
chrome.storage.onChanged.addListener((changes, area) => {
  if (store.changed(changes, area).length) rebuildMenu();
});

// Options page: a burst of clicks is one sync write (sync allows 120 a minute).
const saver = createSettingsSaver(store, chrome.storage, { onSaved: showSaved });
saver.save({ menuStyle: 'full' });
addEventListener('pagehide', () => saver.flush());
```

| Store member | What it does |
|---|---|
| `load(storage)` | Every setting: sync, then held refusals, then local, normalised. |
| `save(storage, changes)` | Writes only the settings named, so another computer's change to a different one survives. Resolves to `{settings, synced}`. |
| `writeSynced(storage, values)` | One sync write; what sync refuses (rate limit, an item over 8,192 bytes) is kept in local under `unsyncedKey` and retried with the next write. |
| `retryUnsynced(storage)` | Try the held refusals again. |
| `changed(changes, area)` | The settings a `chrome.storage.onChanged` event touches. |
| `normalize(raw)`, `defaults`, `localKeys`, `syncedKeys`, `unsyncedKey` | The schema. |

## Toolbar glyph

```js
// background.js: restore the last glyph, open the offscreen watcher, handle reports.
startToolbarTheme(chrome);

// offscreen/offscreen.js (manifest permission "offscreen"):
watchSchemeOffscreen(chrome.runtime);

// Every extension page:
watchColorScheme(chrome).catch(() => {});
```

An extension that already runs on every page (a content script) can skip the offscreen document:
call `createToolbarTheme({storage, action, extensionId})` in the worker and pass its `onMessage`
the reports, which the content script sends with `reportColorScheme(media, stored,
schemeSender(chrome.runtime))`.

Render the glyphs from `icons/toolbar/glyph.svg` (and optional pixel-fitted `glyph-16.svg`), and
the extension's own icon from `icons/icon.svg` to `icon-16.png` … `icon-128.png`, with the
extension's Playwright:

```json
{ "scripts": { "icons": "extension-kit icons", "toolbar-icons": "extension-kit toolbar-icons" } }
```

(`extension-kit toolbar-icons src/icons/toolbar` for another folder; from a script,
`renderIcons` and `renderToolbarIcons({chromium, dir})`.)

Colours are Chrome 157's toolbar icon colours, #474747 / #C7C7C7 (sources in the file).

## About links

```js
export const REPOSITORY = 'https://github.com/arraypress/upright';
export const ABOUT_LINKS = githubAboutLinks(REPOSITORY); // { help, reportIssue, privacyPolicy }
```

At the end of `npm run package`, `printReleaseChecks(ABOUT_LINKS, REPOSITORY)` warns loudly while a
link is a placeholder (`isPlaceholder`: example.com/.org/.net) and reminds you the repository must
be public before the store listing goes live.

## Page start-up

```js
const t = setUpPage(chrome, { title: 'optionsTitle' });
```

Reports the page's colour scheme for the toolbar glyph (`watchColorScheme`; a failure is only
logged), fills its `data-i18n` text (`localize`), sets its title from a message, and returns the
page's `t`.

The extension's name lives in one message, `extShortName`. A message that names the extension
takes it as a placeholder whose content is `$1`, and every lookup without substitutions (`t(key)`,
`data-i18n`, `data-i18n-*`, the title) fills it in:

```json
"optionsAbout": { "message": "About $NAME$", "placeholders": { "name": { "content": "$1" } } }
```

```html
<h2 class="section-title" data-i18n="optionsAbout"></h2> <!-- About Upright -->
```

## Sites

```js
siteOrigin('example.com');                   // 'https://example.com', what Chrome grants access to
siteHost(' https://www.GitHub.com/a ');      // 'github.com', what a per-site list keeps
onSite(siteHost(location.href), neverSites); // on a listed site or a subdomain of one
hostPatterns('github.com');                  // ['*://github.com/*', '*://*.github.com/*'] (excludeMatches)
originPattern('https://bit.ly/x');           // 'https://bit.ly/*' (permissions.request)
siteLabel('https://example.com');            // 'example.com', as a list shows it
withSite(['a.com', 'b.com'], 'a.com');       // ['b.com', 'a.com'], what a list keeps after Add (also withoutSite, withSiteReplaced)
```

A site is http or https with a dot in its host (or `localhost`); text without a scheme is https;
`localhost:8080` is a host and port. Pure, so a content script can load `sites/sites.js` alone.

## A content script on every site

```js
// The content script runs everywhere only while the optional all-sites grant is held, less the
// "Never on" sites; one call brings the registration in line, whatever changed.
const sync = contentScriptSync(chrome.scripting, 'prices', async () => {
  const settings = await store.load(chrome.storage);
  if (!settings.everySite || !(await chrome.permissions.contains({ origins: ALL_SITES }))) return null;
  return { js: ['content/loader.js'], matches: ALL_SITES, excludeMatches: settings.neverSites.flatMap(hostPatterns), runAt: 'document_idle' };
});
chrome.permissions.onAdded.addListener(() => sync());
chrome.permissions.onRemoved.addListener(() => sync()); // site access taken back on chrome://extensions
```

Registers, updates or unregisters the script `id` to match what `want()` gives at the time (null:
none). Calls run one after another, so a quick run of changes can't register twice or end out of
order; a refused change rejects that call only.

## Time limits

```js
const groups = await within(chrome.tabGroups.query({}), 2000, []); // a Chrome call that may never answer
```

`within(promise, ms, fallback)`: the value in time, or the fallback (late or failed); never
rejects; its timer cleared once the work settles (the work itself isn't stopped). In the runtime
half, so a service worker or page can use it; the test helpers use it too.

## Page components

Chrome's own components, made in the page by script (no markup to copy), styled by `chrome-ui.css`.
Each takes `doc` (default `document`); the menu and the toast also take `root`, an element or a
shadow root to go in (a content script's, so the page's styles never reach them), and follow the
focus through shadow roots. The wording defaults to Chrome's English and takes a translation.

### ⋮ menu (cr-action-menu)

```js
import { createMenu, moreActionsButton } from '../vendor/extension-kit/index.js';

const menu = createMenu(); // one <dialog class="menu" role="menu"> for the page
row.append(moreActionsButton(workspace.name, {
  onClick: (anchor) => menu.open([
    { label: 'Rename', run: () => rename(workspace) },
    'separator',
    { label: 'Delete', run: () => remove(workspace), disabled: locked },
  ], { anchor }),
}));
// A right-click: menu.open(items, { x: event.clientX, y: event.clientY, focusTo: row });
```

It opens modally over its button, as Chrome's does (its top at the button's top, its end at the
button's end), moved to stay 8px inside the window. A click outside, Esc, Tab or the window losing
focus closes it; ↑/↓ (wrapping, past disabled items), Home and End move; focus goes back to the
button (or `focusTo`); an item runs once the menu has closed. `createMenu({id, placement: 'below'})`
opens it below the button instead. `menuPosition` and `isInside` are the pure geometry.

`moreActionsButton(name, options)` is the 32px ⋮ icon button, labelled "More actions for “name”"
(`label` for a translation), with `aria-haspopup="menu"`; its icon is the stylesheet's
`.icon-more-vert` (`--icon-more-vert`, cr:more-vert), so the page needs no sprite. `className`,
`tooltip` (a `title`) and `focusable: false` (out of the tab order, for a row that takes the focus)
cover the rest.

### Text dialog (cr-dialog)

```js
const name = await askText({ title: 'Rename workspace', label: 'Name', value: workspace.name, maxLength: 200 });
const site = await askText({
  title: 'Add site', label: 'Site', action: 'Add',
  validate: (text) => (siteFromInput(text) ? null : 'Enter a site, like example.com'),
});
```

Resolves to the text, trimmed, or `null` when cancelled. The action button (default "Save") stays
disabled while the text is blank or `validate` gives a reason, which shows under the field
(`checkText` is that rule, pure). Enter presses the action button; Esc and Cancel cancel; the
focus goes back to what had it, or to `returnTo` (an element, or a function asked at the end).
One `#text-dialog` per page, made on first use.

### Dialog with several fields

```js
const rule = await askFields({
  title: 'Add folder rule', action: 'Add',
  fields: [
    { name: 'from', label: 'Downloads from', placeholder: 'example.com or .pdf', validate: checkFrom },
    { name: 'folder', label: 'Folder', value: 'Receipts' },
  ],
});
if (rule) addRule(rule.from, rule.folder);
```

The same dialog as chrome://settings/searchEngines asks for a site search: a field each, in
order. Resolves to each field's text by its `name`, trimmed, or `null` when cancelled. The action
button stays disabled until every field is filled in and valid, each field's reason under it; the
focus starts in the first empty field. `askText` is this with one field. A one-field dialog's ids
are `text-dialog-input` and `text-dialog-error`; with several, `text-dialog-<name>` and
`text-dialog-<name>-error` (`fieldIds`), for a test to find them.

### Toast with Undo (cr-toast)

```js
const toast = createToast(); // at load, so screen readers know the live region
toast.show(`Deleted “${workspace.name}”`, () => restore(workspace));
toast.show('Copied'); // no Undo
```

`#toast` (`role="status"`), bottom left, a manual `popover` so it's in the top layer, over
anything the page stacks (`:popover-open` while it shows). A new message replaces the last and
restarts the wait: 10 seconds, as chrome://bookmarks's (`TOAST_MS`), or `duration` /
`undoDuration`. Undo hides it and runs once. `undoLabel` translates the button.

### Site list

```js
// Memory Saver's way (chrome://settings/performance): an Add button and the dialog, ⋮ Edit/Remove.
// <div class="row"><span class="label secondary">…</span><button id="add-site" type="button">Add</button></div>
// <p class="row text" id="no-sites"><span class="label">No sites added</span></p> <ul class="list" id="sites"></ul>
const sites = createSiteList({
  list: byId('sites'), empty: byId('no-sites'), addButton: byId('add-site'),
  parse: siteHost,
  add: (site) => save({ sites: withSite(settings.sites, site) }),
  remove: (site) => save({ sites: withoutSite(settings.sites, site) }),
  replace: (site, edited) => save({ sites: withSiteReplaced(settings.sites, site, edited) }),
  t, // the page's messages, under the standard keys below
});
sites.render(settings.sites);

// A short list with an add row (chrome://settings): `form` instead of `addButton`.
// <form class="row add" id="add-site"><input type="text" …><button type="submit">Add</button></form>
```

`withSite` adds a site at the end, once (added again, it moves there); `withoutSite` takes it out;
`withSiteReplaced` edits it in place, merging it with a duplicate. A list that needs site access
asks for it in `add`/`replace` (the dialog's click still counts as the person's) and gives it back
in `remove`. `add` resolving to false keeps the add row's text (access refused); `invalid(text)`
hears what isn't a site in the add row; the dialog keeps its Add off with “Enter a site, like
example.com” under the field.

The words: Chrome's English (`SITE_LIST_WORDS`) without `t`; with it, the page's messages under
these keys (`SITE_LIST_MESSAGES`), so every extension's `_locales` names them alike. `words`
overrides only those that differ.

| Word | Key | English |
|---|---|---|
| `add` | `optionsAdd` | Add |
| `addSite` | `optionsAddSite` | Add site |
| `editSite` | `optionsEditSite` | Edit site |
| `edit` | `optionsEdit` | Edit |
| `remove` | `optionsRemove` | Remove |
| `save` | `optionsSave` | Save |
| `cancel` | `optionsCancel` | Cancel |
| `site` | `optionsSiteLabel` | Site |
| `invalid` | `optionsSiteInvalid` | Enter a site, like example.com |
| `moreActions` | `optionsMoreActions` | More actions for `$SITE$` (content `$1`; the ⋮ button) |
| `removeLabel` | `optionsRemoveLabel` | Remove `$SITE$` (content `$1`; the add row's Remove button) |

A list with an Add button needs every key but `optionsRemoveLabel`; one with an add row needs
`optionsRemove` and `optionsRemoveLabel`. A locale test can check them against `SITE_LIST_MESSAGES`.

## Build helpers (`@arraypress/extension-kit/build`)

| Export | What it does |
|---|---|
| `zipExtension(from, to, exclude?)` | Zip a folder for the Chrome Web Store, files only, less `ZIP_EXCLUDE` (icon SVG sources, `.d.ts`, `.DS_Store`). |
| `shipsFile(file)` | Whether a file ships, by the same rules. |
| `vendorKit(dest)` | Copy the browser half into an extension (the `extension-kit vendor` command). |
| `vendorPackage(name, files, dest)`, `packageDir(name)` | Copy files of an installed package, stamped (`extension-kit vendor <dir> <package> <path>...`). |
| `checkVendored(dir)` | The stale copies under `dir` (`extension-kit vendor-check`). |
| `renderIcons`, `renderToolbarIcons({chromium, dir})` | See above. |
| `buildTestCopy({from, to, hook, manifest})` | A test build: the extension, `hook` as its service worker (`e2e-hook.js`), the manifest changed. |
| `testBuildDir(root, name)` | `.test-builds/<name>`, or under `$EXTENSION_TEST_BUILDS` (to test another build, or run two side by side). |
| `storeFrame` | Store screenshots: `canvas`, `windowChrome`, `geometry`, `letterIcon`, `cursor`, `THEMES`, `W`×`H`. |
| `placeholderWarning`, `repositoryReminder`, `printReleaseChecks` | See About links. |
| `findDisallowedClones({runJscpd})` | Run jscpd and return clones `.jscpd-allowlist.json` doesn't cover (the `extension-kit duplication` command). |

### Copied-code guard

With `jscpd` as a devDependency and a `.jscpd.json`, `extension-kit duplication` fails on any clone
except those listed, each with a reason:

```json
{ "allow": [{ "files": ["test/e2e/a.mjs", "test/e2e/b.mjs"], "reason": "Two fixtures that must stay literal." }] }
```

## Test helpers (`@arraypress/extension-kit/testing`)

| Export | What it does |
|---|---|
| `fakeChromeStorage({local, sync, session, now})` | In-memory `chrome.storage`: JSON copies, `onChanged` for real changes only, sync's 8,192-byte item quota and 120 writes a minute. `settled()` waits for listeners. |
| `launchExtension(chromium, dir, options)` | Load an unpacked extension into a fresh profile; `{context, worker, extensionId, url(page), profile, close()}`. |
| `extensionProfile(chromium, dir, options)` | A profile to start the browser on more than once (a restart, a first start with a changed manifest): `{dir, launch(), remove()}`. |
| `checkRunner({timeout})` | Named checks that report and go on: `check(name, fn, {timeout})`, `fail(name)` for an error found outside a check, `finish()`. A check that runs past its limit (`CHECK_MS`, 60 s) fails, and the run goes on. |
| `eachLimited(items, limit, work)` | Work through a list at most `limit` at once, `work(item, slot, index)`. |
| `realisticBrowser(options)`, `chromeUserAgent(browser)` | Launch options and a user agent for a browser that doesn't say it's automated, for live checks. |
| `closeOnSignal(close)` | On Ctrl-C or a kill, close the run's browsers, then exit. |
| `testBuildDir(root, name)` | As in `/build`, for the tests that load the build. |
| `serve(routes, {port})` | Serve test pages on 127.0.0.1 from a table, a `Map` or a function of the path; `{origin, port, server, close()}`. |
| `until(fn, what, timeout?)` | Poll until truthy. |
| `offscreenEmulator(cdp)` | Emulate light/dark inside the offscreen document. |
| `recordIconCalls(worker)` | Record `chrome.action.setIcon` calls Chrome accepted. |
| `installWarnings(worker, manifest)` | Chrome's own install warnings for a manifest (`chrome.management.getPermissionWarningsByManifest`, no permission needed), from a loaded extension's worker. |
| `warningsAddedBy(worker, manifest, names)` | `{warnings, without, added}`: the warnings with and without some permissions, and those only they bring (`withoutPermissions` is the pure part). |
| `savedTabGroups(profile)` | Chrome's saved tab groups (`{title, pinned, urls}`) read from a closed profile's `Sync Data/LevelDB`: no extension API lists them. |
| `parseLiveOptions(argv, env, {usage})`, `parseProxy(address)` | A live checker's command line (`--only`, `--category`, `--concurrency`, `--proxy` or `HTTPS_PROXY`, `--locale`, `--timezone`, `--out`, `--help`), and a proxy address for Playwright with its password hidden for the output. |
| `exitPoint(request)` | Where the run's traffic leaves for the internet (`{ip, country, where, source}`), from a keyless lookup service through the context's proxy: sites decide what to show by it. |
| `filesUnder`, `zipEntries`, `missingReferences`, `manifestReferences` | For a packaging test: the zip is the folder, and every path the extension names resolves (a `#fragment` or `?query` ignored: `referencedPath`). |

## Stylesheet classes

| Piece | Markup |
|---|---|
| Page column (680px, 96%) | `<main class="page">` |
| Toolbar (56px) | `<header class="toolbar">` with `.toolbar-start` (img + `h1`), `.toolbar-center`, `.toolbar-end` |
| Search pill | `<label class="search-field"><svg class="icon">…</svg><input type="search"></label>` |
| Section title | `<h2 class="section-title">` above its card |
| Card (one per section) | `<section class="card">` |
| Row (48px) | `.row` with `<span class="label">Text<span class="secondary">Help</span></span>` and a control |
| Two-line row (64px) | `.row.two-line` |
| Paragraph row | `<p class="row text"><span class="label">…</span></p>` |
| Value at the end | `<span class="row-value">⌥⇧W</span>` |
| Heading inside a card | `.card-heading` |
| Link row | `<button class="link-row">` (›) or `.link-row.external` (↗), label as in `.row` |
| No separator above | `.first` / `.continuation` (the first row of a card gets none by itself) |
| List of rows | `<ul class="list">` of `li.row` |
| Toggle (cr-toggle) | `<input type="checkbox" class="switch" role="switch">` |
| Select (md-select) | plain `<select>` |
| Text field (cr-input) | plain `<input>`, `<textarea>`; `.field` > `label` + input for a labelled one |
| Add row under a list | `<form class="row add">` with an `<input>` and a submit `<button>` (or `createSiteList`) |
| Buttons (cr-button) | plain `<button>`; `.action` filled; `.link` as a link; `.icon-button` 32px round |
| Settings menu | `.nav` > `ul.nav-list` > `a.nav-item[aria-current="page"]`, `.nav-separator` |
| Manager layout | `.manager`/`.layout`, `.sidebar` with `.tree` > `.tree-item`, `.main` with `.list-card` |
| Menu (cr-action-menu) | `<dialog class="menu">` of `button[role="menuitem"]`, `hr` (or `createMenu`) |
| ⋮ icon | `<span class="icon icon-more-vert" aria-hidden="true">` (or `moreActionsButton`) |
| Dialog (cr-dialog) | `<dialog class="dialog"><form method="dialog">` `.dialog-title`, `.dialog-body`, `.dialog-buttons` (`askText`, `askFields`) |
| Toast (cr-toast) | `<div class="toast" popover="manual">text <button>Undo</button></div>` (or `createToast`); with `hidden` instead of `popover`, it shows over the page but not the top layer |
| Drawer (cr-drawer) | `<dialog class="drawer">` with `.drawer-head` and a `.nav` |
| Side panel page | `<body class="side-panel">`: the panel's colours, a column 100vh high |
| Panel tabs (cr-tabs) | `<div class="tabs" role="tablist">` of `button.tab[role="tab"][aria-selected]` |
| Panel body | `.sp-scroller`; `.search-field` inside a panel is the white pill |
| Panel card | `<section class="sp-card">` with `.sp-heading` (`h2` + 24px `.icon-button`s, `.expand[aria-expanded]`) |
| Panel row (cr-url-list-item) | `ul.sp-list` > `li.sp-item`: `button.sp-item-main`, `.sp-icon`, `.sp-text` > `.sp-title` + `.sp-description`, `.sp-suffix` |
| Panel empty state | `.sp-empty` with `.icon`, `h2`, `p` |
| Panel footer + pill | `<footer class="sp-footer"><button class="floating">` |
| Utilities | `.secondary`, `.error`, `.hint`, `.mono`, `.visually-hidden`, `.icon`, `.sprite` |

Tokens (`--text`, `--text-secondary`, `--primary`, `--separator`, `--card`, `--page-bg`, `--hover`,
`--selected-bg`, the side panel's `--sp-*`, …) switch with `prefers-color-scheme`; use them for
anything a page adds. Values come from Chromium's source, checked against chrome://settings and
chrome://bookmarks in Chromium 156 / Chrome 157; the sources are listed at the top of the file.

## Development

`npm test` runs ESLint, a strict TypeScript check of the JSDoc (`checkJs`), the tests (the menu,
the dialog, the toast, the dialog site list, icon rendering and the Chrome readers in Playwright's
Chromium, the rest in Node and jsdom), and the
copied-code guard. The `.d.ts` files are generated from the JSDoc: `npm run types` writes them, and
the type check fails while one is stale (it regenerates them into `.types/` and compares).

## License

MIT © 2026 David Sherlock / ArrayPress Limited
