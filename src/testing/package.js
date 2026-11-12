/**
 * Helpers for an extension's packaging test: list the folder, list the real
 * zip of it, and find every path the extension names that doesn't resolve to
 * a file the zip holds (a broken import, a stylesheet link, a manifest entry).
 *
 * @module testing/package
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shipsFile, zipExtension } from '../build/zip.js';

/**
 * Every file under `dir`.
 *
 * @param {string} dir - The folder.
 * @returns {Promise<string[]>} Paths relative to it, forward slashes, sorted.
 */
export async function filesUnder(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * The entries of the real zip of `from` (build/zip.js), listed by `unzip`.
 *
 * @param {string} from - The extension folder.
 * @param {readonly string[]} [exclude] - `zip -x` patterns, as `zipExtension` takes.
 * @returns {Promise<string[]>} Entry names, sorted.
 */
export async function zipEntries(from, exclude) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'extension-zip-'));
  try {
    const zip = await zipExtension(from, path.join(tmp, 'out.zip'), exclude);
    return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').sort();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * The parts of a manifest that name files.
 *
 * @typedef {object} ManifestFiles
 * @property {{service_worker?: string}} [background] The worker.
 * @property {{page?: string}} [options_ui] The options page.
 * @property {string} [options_page] The options page, the older way.
 * @property {{default_popup?: string, default_icon?: string | Record<string, string>}} [action] The popup and toolbar icon.
 * @property {{default_path?: string}} [side_panel] The side panel.
 * @property {Record<string, string>} [icons] The extension's icons.
 * @property {{resources: string[]}[]} [web_accessible_resources] Files pages may load.
 * @property {{js?: string[], css?: string[]}[]} [content_scripts] Scripts and styles Chrome puts in pages.
 * @property {string} [default_locale] The locale whose `_locales/<locale>/messages.json` must be there.
 * @property {{rule_resources?: {path: string}[]}} [declarative_net_request] Rule files.
 * @property {Record<string, string>} [chrome_url_overrides] Pages that replace Chrome's (the new tab page).
 * @property {string} [devtools_page] The DevTools page.
 * @property {{pages?: string[]}} [sandbox] Sandboxed pages.
 */

/**
 * The paths a manifest names, from the extension's root.
 *
 * @param {ManifestFiles} manifest - The parsed `manifest.json`.
 * @returns {string[]} Worker, pages, icons, side panel, content scripts and their styles, the default
 *   locale's messages, rule files, overridden and DevTools pages, and web-accessible resources
 *   (less patterns with `*`).
 */
export function manifestReferences(manifest) {
  const icon = manifest.action?.default_icon;
  return [
    manifest.background?.service_worker,
    manifest.options_ui?.page,
    manifest.options_page,
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    manifest.devtools_page,
    ...Object.values(manifest.icons ?? {}),
    ...(typeof icon === 'string' ? [icon] : Object.values(icon ?? {})),
    ...(manifest.content_scripts ?? []).flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
    ...(manifest.default_locale ? [`_locales/${manifest.default_locale}/messages.json`] : []),
    ...(manifest.declarative_net_request?.rule_resources ?? []).map((entry) => entry.path),
    ...Object.values(manifest.chrome_url_overrides ?? {}),
    ...(manifest.sandbox?.pages ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources),
  ].filter((ref) => typeof ref === 'string').filter((ref) => !ref.includes('*'));
}

/**
 * The file a reference names: the path without its `#fragment` or `?query`
 * (`options.html#workspaces` is `options.html`). Pure.
 *
 * @param {string} reference - A path as the extension writes it.
 * @returns {string} The path alone; '' for a reference to the page itself (`#top`).
 */
export function referencedPath(reference) {
  return reference.replace(/[?#].*$/s, '');
}

/** A reference with a scheme (`https:`, `data:`, `mailto:`) or protocol-relative: not a file of the extension. */
const ELSEWHERE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** A module a script imports: `… from './x.js'`, `import('./x.js')`, or `import './x.js'` alone on its line; either quote. */
const IMPORTS = [/(?:from|import\()\s*(['"])(\.{1,2}\/[^'"]+)\1/g, /^\s*import\s*(['"])(\.{1,2}\/[^'"]+)\1/gm];

/** `getURL('…')`, either quote. */
const GET_URL = /getURL\(\s*(['"])([^'"]+)\1\s*\)/g;

/** A page's `src="…"` or `href="…"`, either quote. */
const ATTRIBUTES = /\s(?:src|href)\s*=\s*(['"])([^'"]+)\1/g;

/** A stylesheet's `url(…)` and `@import "…"`. */
const STYLE_URLS = [/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, /@import\s+(['"])([^'"]+)\1/g];

/**
 * Every path the extension names that isn't a file it ships: relative imports in its scripts
 * (`from`, `import()` and a bare `import './x.js'`), `chrome.runtime.getURL('…')` paths,
 * `src`/`href` in its pages, `url(…)` and `@import` in its stylesheets, the manifest's entries
 * ({@link manifestReferences}), and any `extra` paths. A file that's there but left out of the
 * zip (`shipsFile`: an SVG under `icons/`, a declaration, a vendor stamp) is as missing as one
 * that isn't: the store build won't have it. A `#fragment` or `?query` is ignored:
 * `getURL('options.html#workspaces')` names `options.html`. A path starting `/` is from the
 * extension's root. Files that don't ship aren't read.
 *
 * @param {string} dir - The extension folder.
 * @param {readonly string[]} [extra] - More paths from the root (say, a script injected by name).
 * @returns {Promise<string[]>} "from → target" for each missing one; empty when all resolve.
 */
export async function missingReferences(dir, extra = []) {
  const root = path.resolve(dir);
  /** @type {string[]} */
  const missing = [];
  /** @param {string} from @param {string} target */
  const check = (from, target) => {
    const name = referencedPath(target);
    if (!name || ELSEWHERE.test(target)) return;
    const file = name.startsWith('/') ? path.join(root, name) : path.resolve(root, from, name);
    const inside = path.relative(root, file).split(path.sep).join('/');
    if (inside.startsWith('..') || !existsSync(file) || !shipsFile(inside)) missing.push(`${from || 'root'} → ${target}`);
  };
  /** @param {string} source @param {readonly RegExp[]} patterns @param {string} from */
  const each = (source, patterns, from) => {
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) check(from, match[2]);
  };
  for (const file of (await filesUnder(root)).filter(shipsFile)) {
    const from = path.posix.dirname(file);
    const kind = path.posix.extname(file);
    if (kind !== '.js' && kind !== '.html' && kind !== '.css') continue;
    const source = await readFile(path.join(root, file), 'utf8');
    if (kind === '.js') {
      each(source, IMPORTS, from);
      each(source, [GET_URL], '');
    } else if (kind === '.html') {
      each(source, [ATTRIBUTES], from);
    } else {
      each(source, STYLE_URLS, from);
    }
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const ref of [...manifestReferences(manifest), ...extra]) check('', ref);
  return missing;
}
