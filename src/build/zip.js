/**
 * Zip an extension folder for the Chrome Web Store: the folder's contents
 * with `manifest.json` at the zip's root, less source-only files.
 *
 * @module build/zip
 */

import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * `zip -x` patterns left out by default (a `*` crosses folders): SVG sources
 * of rendered icons, type declarations that only editors read, and Finder's
 * `.DS_Store` files.
 */
export const ZIP_EXCLUDE = Object.freeze(['icons/*.svg', '*.d.ts', '*.DS_Store']);

/**
 * Whether a file under an extension folder ships, by the same rules as
 * {@link ZIP_EXCLUDE}: for tests that compare the zip with the folder.
 *
 * @param {string} file - Path relative to the extension folder, forward slashes.
 * @returns {boolean} False for `icons/**.svg`, `*.d.ts` and `.DS_Store`.
 */
export function shipsFile(file) {
  return !/^icons\/.*\.svg$/.test(file) && !file.endsWith('.d.ts') && path.posix.basename(file) !== '.DS_Store';
}

/**
 * Zip everything under `from` into `to`, paths relative to `from`. An older
 * zip at `to` is replaced. Needs the `zip` command (macOS and Linux have it).
 *
 * @param {string} from - The extension folder.
 * @param {string} to - The zip to write; its folder is made if missing.
 * @param {readonly string[]} [exclude] - `zip -x` patterns. Default {@link ZIP_EXCLUDE}.
 * @returns {Promise<string>} `to`.
 * @throws {Error} When `zip` fails.
 */
export async function zipExtension(from, to, exclude = ZIP_EXCLUDE) {
  await mkdir(path.dirname(to), { recursive: true });
  await rm(to, { force: true });
  // -X leaves out macOS extended attributes (the store rejects __MACOSX
  // entries); -D leaves out folder entries, so the zip lists files only.
  execFileSync('zip', ['-r', '-X', '-D', '-q', to, '.', '-x', ...exclude], { cwd: from, stdio: 'inherit' });
  return to;
}
