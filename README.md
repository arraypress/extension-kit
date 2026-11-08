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
- **Build and test helpers** (Node): toolbar icon rendering, zipping for the Chrome Web Store, a
  fake `chrome.storage`, Playwright helpers, packaging checks, and a copied-code guard.

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

Render the glyphs from `icons/toolbar/glyph.svg` (and optional pixel-fitted `glyph-16.svg`):

```js
import { chromium } from 'playwright';
import { renderToolbarIcons } from '@arraypress/extension-kit/build';
await renderToolbarIcons({ chromium, dir: 'extension/icons/toolbar' });
```

Colours are Chrome 157's toolbar icon colours, #474747 / #C7C7C7 (sources in the file).

## About links

```js
export const REPOSITORY = 'https://github.com/arraypress/upright';
export const ABOUT_LINKS = githubAboutLinks(REPOSITORY); // { help, reportIssue, privacyPolicy }
```

At the end of `npm run package`, `printReleaseChecks(ABOUT_LINKS, REPOSITORY)` warns loudly while a
link is a placeholder (`isPlaceholder`: example.com/.org/.net) and reminds you the repository must
be public before the store listing goes live.

## Build helpers (`@arraypress/extension-kit/build`)

| Export | What it does |
|---|---|
| `zipExtension(from, to, exclude?)` | Zip a folder for the Chrome Web Store, files only, less `ZIP_EXCLUDE` (icon SVG sources, `.d.ts`, `.DS_Store`). |
| `shipsFile(file)` | Whether a file ships, by the same rules. |
| `vendorKit(dest)` | Copy the browser half into an extension (the `extension-kit vendor` command). |
| `renderToolbarIcons({chromium, dir})` | See above. |
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
| `launchExtension(chromium, dir, options)` | Load an unpacked extension into a fresh profile; `{context, worker, extensionId, url(page), close()}`. |
| `until(fn, what, timeout?)` | Poll until truthy. |
| `offscreenEmulator(cdp)` | Emulate light/dark inside the offscreen document. |
| `recordIconCalls(worker)` | Record `chrome.action.setIcon` calls Chrome accepted. |
| `filesUnder`, `zipEntries`, `missingReferences`, `manifestReferences` | For a packaging test: the zip is the folder, and every path the extension names resolves. |

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
| Buttons (cr-button) | plain `<button>`; `.action` filled; `.link` as a link; `.icon-button` 32px round |
| Settings menu | `.nav` > `ul.nav-list` > `a.nav-item[aria-current="page"]`, `.nav-separator` |
| Manager layout | `.manager`/`.layout`, `.sidebar` with `.tree` > `.tree-item`, `.main` with `.list-card` |
| Menu (cr-action-menu) | `<dialog class="menu">` of `button[role="menuitem"]`, `hr` |
| Dialog (cr-dialog) | `<dialog class="dialog"><form method="dialog">` `.dialog-title`, `.dialog-body`, `.dialog-buttons` |
| Toast (cr-toast) | `<div class="toast">text <button>Undo</button></div>` |
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

`npm test` runs ESLint, a strict TypeScript check of the JSDoc (`checkJs`), the tests, and the
copied-code guard. The `.d.ts` files are generated from the JSDoc: `npm run types` writes them, and
the type check fails while one is stale (it regenerates them into `.types/` and compares).

## License

MIT © 2026 David Sherlock / ArrayPress Limited
