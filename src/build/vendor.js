/**
 * Copy the kit's browser half (the runtime modules and the stylesheet) into
 * an extension folder. A packaged extension can't load files from outside
 * itself, so an extension without a bundler loads the kit from a copy; the
 * copy is made from the installed package on `npm install` and is never
 * committed, so it can't drift from the version in package.json.
 *
 * An extension with a bundler imports the package instead and copies only
 * the stylesheet ({@link STYLESHEET}).
 *
 * @module build/vendor
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The package's `src/` folder. */
const SOURCE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** What a vendored copy holds, relative to `src/`: everything an extension page or worker may load. */
export const RUNTIME_ENTRIES = Object.freeze(['index.js', 'index.d.ts', 'about', 'commands', 'dom', 'settings', 'styles', 'toolbar', 'ui']);

/** The kit's stylesheet, an absolute path in the installed package. */
export const STYLESHEET = path.join(SOURCE, 'styles', 'chrome-ui.css');

/**
 * Replace `dest` with a fresh copy of the runtime modules and stylesheet.
 *
 * @param {string} dest - The folder to fill, e.g. `extension/vendor/extension-kit`. Removed first.
 * @returns {Promise<string[]>} The entries copied, relative to `dest`.
 * @example
 * await vendorKit('extension/vendor/extension-kit');
 * // extension/vendor/extension-kit/index.js, …/styles/chrome-ui.css, …
 */
export async function vendorKit(dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  for (const entry of RUNTIME_ENTRIES) {
    await cp(path.join(SOURCE, entry), path.join(dest, entry), { recursive: true });
  }
  return [...RUNTIME_ENTRIES];
}
