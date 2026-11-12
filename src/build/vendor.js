/**
 * Copy browser code from npm packages into an extension folder. A packaged
 * extension can't load files from outside itself, so an extension without a
 * bundler loads the kit (and any other library) from a copy in
 * `extension/vendor/`; the copy is made from the installed package on
 * `npm install` (`postinstall`) and is never committed.
 *
 * Each copy is stamped with the package's name and version, what was copied
 * and a hash of it ({@link VENDOR_STAMP}), so {@link checkVendored} can say
 * when a copy no longer matches what's installed: `npm install some-package`
 * installs without running the extension's own `postinstall`, and the copy
 * goes stale without a word; so does a copy edited by hand, or a package
 * whose files changed under the same version (a library copied into
 * `node_modules` to try it before it's published).
 *
 * An extension with a bundler imports the package instead and copies only
 * the stylesheet ({@link STYLESHEET}).
 *
 * @module build/vendor
 */

import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The package's `src/` folder. */
const SOURCE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The kit's package name. */
const KIT = '@arraypress/extension-kit';

/** What a vendored copy of the kit holds, relative to `src/`: everything an extension page or worker may load. */
export const RUNTIME_ENTRIES = Object.freeze(['index.js', 'index.d.ts', 'about', 'ai', 'commands', 'content', 'dom', 'frame', 'panel', 'scripting', 'settings', 'sites', 'styles', 'time', 'toolbar', 'ui']);

/** The kit's stylesheet, an absolute path in the installed package. */
export const STYLESHEET = path.join(SOURCE, 'styles', 'chrome-ui.css');

/** The file in each vendored folder that names the package and version it was copied from (left out of the zip). */
export const VENDOR_STAMP = 'vendored.json';

/**
 * Where a vendored copy came from.
 *
 * @typedef {object} VendorStamp
 * @property {string} package The package's name.
 * @property {string} version Its version when copied.
 * @property {string[]} [files] The paths copied, as {@link vendorPackage} took them (the kit's own copy has none).
 * @property {string} [hash] A hash of every file copied ({@link treeHash}); a copy from before 1.11 has none.
 */

/**
 * The folder of an installed package, found as Node finds it (the nearest
 * `node_modules/<name>` up from `from`), read from disk so a package whose
 * `exports` hide its `package.json` is found too.
 *
 * @param {string} name - The package's name, e.g. `@duckduckgo/autoconsent`.
 * @param {string} [from] - Where to look up from. Default the current folder.
 * @returns {Promise<string>} The package's folder.
 * @throws {Error} When it isn't installed.
 */
export async function packageDir(name, from = process.cwd()) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (await access(path.join(candidate, 'package.json')).then(() => true, () => false)) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`${name} isn't installed (no node_modules/${name} up from ${from})`);
  }
}

/**
 * A package's version, from its `package.json`.
 *
 * @param {string} dir - The package's folder.
 * @returns {Promise<string>} Its version.
 */
async function versionOf(dir) {
  return JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')).version;
}

/**
 * Every file under a file or folder.
 *
 * @param {string} source - A file or a folder.
 * @returns {Promise<string[]>} Paths from `source`, forward slashes ('' for a file itself).
 */
async function filesOf(source) {
  if (!(await stat(source)).isDirectory()) return [''];
  const entries = await readdir(source, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.relative(source, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/**
 * What a copy holds: each file's place in the vendored folder and the file it comes from. A
 * path lands under its own name (`dist/lib.esm.js` → `lib.esm.js`); a path ending in `/` has its
 * contents copied instead (`src/` → `index.js`, …).
 *
 * @param {string} dir - The folder the paths are in (a package's, or the kit's `src/`).
 * @param {readonly string[]} files - The paths.
 * @returns {Promise<Map<string, string>>} Place in the copy (forward slashes) → source file.
 * @throws {Error} When a path isn't there, or two files would land in the same place.
 */
async function copyPlan(dir, files) {
  /** @type {Map<string, string>} */
  const plan = new Map();
  for (const file of files) {
    const source = path.join(dir, file);
    const under = file.endsWith('/') ? '' : path.basename(file);
    for (const inner of await filesOf(source)) {
      const place = [under, inner].filter(Boolean).join('/');
      const taken = plan.get(place);
      if (taken) throw new Error(`${path.relative(dir, taken)} and ${path.relative(dir, path.join(source, inner))} would both be copied to ${place}`);
      plan.set(place, path.join(source, inner));
    }
  }
  return plan;
}

/**
 * A hash of a set of files: their places and contents, in order of place.
 *
 * @param {Iterable<[string, string]>} files - Place (forward slashes) → the file to read.
 * @returns {Promise<string>} SHA-256, hex.
 */
async function treeHash(files) {
  const hash = createHash('sha256');
  for (const [place, file] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    hash.update(`${place}\0`).update(await readFile(file)).update('\0');
  }
  return hash.digest('hex');
}

/**
 * Whether a folder is somewhere a copy mustn't go: it would be deleted first, and it holds an
 * extension or a project (`manifest.json`, `package.json`, a `.git`) rather than an older copy.
 *
 * @param {string} dest - The folder to fill.
 * @returns {Promise<void>}
 * @throws {Error} When it does.
 */
async function refuseSource(dest) {
  for (const sign of ['manifest.json', 'package.json', '.git']) {
    if (await access(path.join(dest, sign)).then(() => true, () => false)) {
      throw new Error(`${dest} holds a ${sign}: it isn't a vendor folder, and copying into it would delete it first`);
    }
  }
}

/**
 * Replace `dest` with the files of a plan, stamped.
 *
 * @param {string} dest - The vendored folder. Removed first.
 * @param {Map<string, string>} plan - From {@link copyPlan}.
 * @param {Omit<VendorStamp, 'hash'>} source - Where the copy comes from.
 * @returns {Promise<void>}
 */
async function copyStamped(dest, plan, source) {
  await refuseSource(dest);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  for (const [place, file] of plan) {
    await mkdir(path.dirname(path.join(dest, place)), { recursive: true });
    await copyFile(file, path.join(dest, place));
  }
  await writeFile(path.join(dest, VENDOR_STAMP), `${JSON.stringify({ ...source, hash: await treeHash(plan) }, null, 2)}\n`);
}

/**
 * Replace `dest` with a fresh copy of the kit's runtime modules and stylesheet.
 *
 * @param {string} dest - The folder to fill, e.g. `extension/vendor/extension-kit`. Removed first.
 * @returns {Promise<string[]>} The entries copied, relative to `dest`.
 * @throws {Error} When `dest` holds an extension or a project (`manifest.json`, `package.json`, `.git`).
 *
 * @example
 * await vendorKit('extension/vendor/extension-kit');
 * // extension/vendor/extension-kit/index.js, …/styles/chrome-ui.css, …, vendored.json
 */
export async function vendorKit(dest) {
  await copyStamped(dest, await copyPlan(SOURCE, RUNTIME_ENTRIES), { package: KIT, version: await versionOf(path.dirname(SOURCE)) });
  return [...RUNTIME_ENTRIES];
}

/**
 * Replace `dest` with named files and folders of an installed npm package.
 * Each path is relative to the package's folder and lands in `dest` under
 * its own name (`dist/lib.esm.js` → `dest/lib.esm.js`); a path ending in `/`
 * has its contents copied into `dest` instead (`src/` → `dest/index.js`, …).
 *
 * @param {string} name - The package, as installed (`@arraypress/clean-link`).
 * @param {readonly string[]} files - What to copy.
 * @param {string} dest - The folder to fill, e.g. `extension/vendor/clean-link`. Removed first.
 * @param {{from?: string}} [options] - `from`: where to look for `node_modules` from. Default the current folder.
 * @returns {Promise<string[]>} The files and folders written, relative to `dest`.
 * @throws {Error} When the package isn't installed, a path isn't in it, two paths would land in
 *   the same place (`dist/index.js` and `rules/index.js`), or `dest` holds an extension or a project.
 *
 * @example
 * await vendorPackage('@duckduckgo/autoconsent', ['dist/autoconsent.esm.js', 'rules/compact-rules.json', 'LICENSE'], 'extension/vendor/autoconsent');
 * // or, from postinstall: extension-kit vendor extension/vendor/clean-link @arraypress/clean-link src/
 */
export async function vendorPackage(name, files, dest, { from } = {}) {
  const dir = await packageDir(name, from);
  const plan = await copyPlan(dir, files);
  await copyStamped(dest, plan, { package: name, version: await versionOf(dir), files: [...files] });
  return [...new Set([...plan.keys()].map((place) => place.split('/')[0]))];
}

/**
 * Why a stamped copy no longer matches the package installed now, if it doesn't.
 *
 * @param {string} folder - The vendored folder.
 * @param {VendorStamp} copied - Its stamp.
 * @param {string | undefined} from - Where to look for `node_modules` from.
 * @returns {Promise<string | null>} The line to print, or null when it matches.
 */
async function staleness(folder, copied, from) {
  const dir = await packageDir(copied.package, from).catch(() => null);
  if (dir === null) return `${folder} is ${copied.package} ${copied.version}, which isn't installed`;
  const installed = await versionOf(dir);
  if (installed !== copied.version) return `${folder} is ${copied.package} ${copied.version}; ${installed} is installed`;
  if (!copied.hash) return null;
  const plan = await (copied.files ? copyPlan(dir, copied.files) : copyPlan(path.join(dir, 'src'), RUNTIME_ENTRIES)).catch(() => null);
  if (plan === null || await treeHash(plan) !== copied.hash) {
    return `${folder} is ${copied.package} ${copied.version}, but the installed ${copied.version}'s files are different`;
  }
  // The copied files as they are now; files a script wrote beside them afterwards aren't the package's.
  const here = await treeHash([...plan.keys()].map((place) => [place, path.join(folder, place)])).catch(() => null);
  if (here !== copied.hash) return `${folder} has changed since it was copied from ${copied.package} ${copied.version}`;
  return null;
}

/**
 * Every vendored copy under `dir` (a folder with a {@link VENDOR_STAMP},
 * searched to any depth) that no longer matches the package installed now:
 * copied from another version, from a package that's gone, edited since (a
 * file a script wrote beside the copied ones afterwards doesn't count), or
 * from files the installed package no longer has as they were. A folder with
 * no vendored copy at all (a mistyped path, `postinstall` never run) is
 * reported too.
 *
 * @param {string} dir - The vendor folder, e.g. `extension/vendor`.
 * @param {{from?: string}} [options] - `from`: where to look for `node_modules` from. Default the current folder.
 * @returns {Promise<string[]>} One line per stale copy; empty when all match.
 *
 * @example
 * const stale = await checkVendored('extension/vendor');
 * // ['extension/vendor/extension-kit is @arraypress/extension-kit 1.2.0; 1.3.0 is installed']
 */
export async function checkVendored(dir, { from } = {}) {
  const entries = await readdir(dir, { recursive: true }).catch(() => /** @type {string[]} */ ([]));
  const stamps = entries.filter((file) => path.basename(file) === VENDOR_STAMP).sort();
  if (!stamps.length) return [`${dir} has no vendored copies (no ${VENDOR_STAMP} in it)`];
  /** @type {string[]} */
  const stale = [];
  for (const entry of stamps) {
    /** @type {VendorStamp} */
    const copied = JSON.parse(await readFile(path.join(dir, entry), 'utf8'));
    const line = await staleness(path.join(dir, path.dirname(entry)), copied, from);
    if (line) stale.push(line);
  }
  return stale;
}
