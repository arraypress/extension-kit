/**
 * Helpers for an extension's packaging test: list the folder, list the real
 * zip of it, and find every path the extension names that doesn't resolve to
 * a file inside it (a broken import, a stylesheet link, a manifest entry).
 *
 * @module testing/package
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipExtension } from '../build/zip.js';

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
 * The paths a manifest names, from the extension's root.
 *
 * @param {Record<string, any>} manifest - The parsed `manifest.json`.
 * @returns {string[]} Worker, pages, icons, side panel and web-accessible resources.
 */
export function manifestReferences(manifest) {
  return [
    manifest.background?.service_worker,
    manifest.options_ui?.page,
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...(manifest.web_accessible_resources ?? []).flatMap((/** @type {{resources: string[]}} */ entry) => entry.resources),
  ].filter((ref) => typeof ref === 'string' && !ref.includes('*'));
}

/**
 * Every path the extension names that isn't a file inside it: relative
 * imports in its scripts, `chrome.runtime.getURL('…')` paths, `src`/`href`
 * in its pages, the manifest's entries, and any `extra` paths.
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
    const file = path.resolve(root, from, target);
    if (!file.startsWith(root) || !existsSync(file)) missing.push(`${from || 'root'} → ${target}`);
  };
  for (const file of await filesUnder(root)) {
    const from = path.posix.dirname(file);
    if (file.endsWith('.js')) {
      const source = await readFile(path.join(root, file), 'utf8');
      for (const [, spec] of source.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) check(from, spec);
      for (const [, ref] of source.matchAll(/getURL\('([^']+)'\)/g)) check('', ref);
    } else if (file.endsWith('.html')) {
      const source = await readFile(path.join(root, file), 'utf8');
      for (const [, ref] of source.matchAll(/(?:src|href)="([^"#:]+)"/g)) check(from, ref);
    }
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const ref of [...manifestReferences(manifest), ...extra]) check('', ref);
  return missing;
}
