/**
 * Copy browser code from npm packages into an extension folder. A packaged
 * extension can't load files from outside itself, so an extension without a
 * bundler loads the kit (and any other library) from a copy in
 * `extension/vendor/`; the copy is made from the installed package on
 * `npm install` (`postinstall`) and is never committed.
 *
 * Each copy is stamped with the package's name and version
 * ({@link VENDOR_STAMP}), so {@link checkVendored} can say when a copy no
 * longer matches what's installed: `npm install some-package` installs
 * without running the extension's own `postinstall`, and the copy goes stale
 * without a word.
 *
 * An extension with a bundler imports the package instead and copies only
 * the stylesheet ({@link STYLESHEET}).
 *
 * @module build/vendor
 */

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The package's `src/` folder. */
const SOURCE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The kit's package name. */
const KIT = '@arraypress/extension-kit';

/** What a vendored copy of the kit holds, relative to `src/`: everything an extension page or worker may load. */
export const RUNTIME_ENTRIES = Object.freeze(['index.js', 'index.d.ts', 'about', 'ai', 'commands', 'content', 'dom', 'scripting', 'settings', 'sites', 'styles', 'time', 'toolbar', 'ui']);

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
 * Write a folder's {@link VENDOR_STAMP}.
 *
 * @param {string} dest - The vendored folder.
 * @param {VendorStamp} source - Where the copy came from.
 * @returns {Promise<void>}
 */
async function stamp(dest, source) {
  await writeFile(path.join(dest, VENDOR_STAMP), `${JSON.stringify(source, null, 2)}\n`);
}

/**
 * Replace `dest` with a fresh copy of the kit's runtime modules and stylesheet.
 *
 * @param {string} dest - The folder to fill, e.g. `extension/vendor/extension-kit`. Removed first.
 * @returns {Promise<string[]>} The entries copied, relative to `dest`.
 * @example
 * await vendorKit('extension/vendor/extension-kit');
 * // extension/vendor/extension-kit/index.js, …/styles/chrome-ui.css, …, vendored.json
 */
export async function vendorKit(dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  for (const entry of RUNTIME_ENTRIES) {
    await cp(path.join(SOURCE, entry), path.join(dest, entry), { recursive: true });
  }
  await stamp(dest, { package: KIT, version: await versionOf(path.dirname(SOURCE)) });
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
 * @throws {Error} When the package isn't installed, or a path isn't in it.
 * @example
 * await vendorPackage('@duckduckgo/autoconsent', ['dist/autoconsent.esm.js', 'rules/compact-rules.json', 'LICENSE'], 'extension/vendor/autoconsent');
 * // or, from postinstall: extension-kit vendor extension/vendor/clean-link @arraypress/clean-link src/
 */
export async function vendorPackage(name, files, dest, { from } = {}) {
  const dir = await packageDir(name, from);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  /** @type {string[]} */
  const written = [];
  for (const file of files) {
    const source = path.join(dir, file);
    if (file.endsWith('/')) {
      await cp(source, dest, { recursive: true });
      written.push(...await readdir(source));
    } else {
      await cp(source, path.join(dest, path.basename(file)), { recursive: true });
      written.push(path.basename(file));
    }
  }
  await stamp(dest, { package: name, version: await versionOf(dir) });
  return written;
}

/**
 * Every vendored copy under `dir` (a folder with a {@link VENDOR_STAMP},
 * searched to any depth) that no longer matches the package installed now:
 * copied from another version, or from a package that's gone.
 *
 * @param {string} dir - The vendor folder, e.g. `extension/vendor`.
 * @param {{from?: string}} [options] - `from`: where to look for `node_modules` from. Default the current folder.
 * @returns {Promise<string[]>} One line per stale copy; empty when all match (or there are none).
 * @example
 * const stale = await checkVendored('extension/vendor');
 * // ['extension/vendor/extension-kit is @arraypress/extension-kit 1.2.0; 1.3.0 is installed']
 */
export async function checkVendored(dir, { from } = {}) {
  const entries = await readdir(dir, { recursive: true }).catch(() => /** @type {string[]} */ ([]));
  /** @type {string[]} */
  const stale = [];
  for (const entry of entries.filter((file) => path.basename(file) === VENDOR_STAMP).sort()) {
    const folder = path.join(dir, path.dirname(entry));
    /** @type {VendorStamp} */
    const copied = JSON.parse(await readFile(path.join(dir, entry), 'utf8'));
    const installed = await packageDir(copied.package, from).then(versionOf, () => null);
    if (installed === null) stale.push(`${folder} is ${copied.package} ${copied.version}, which isn't installed`);
    else if (installed !== copied.version) stale.push(`${folder} is ${copied.package} ${copied.version}; ${installed} is installed`);
  }
  return stale;
}
