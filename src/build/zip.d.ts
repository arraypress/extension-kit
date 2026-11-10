/**
 * Zip an extension folder for the Chrome Web Store: the folder's contents
 * with `manifest.json` at the zip's root, less source-only files.
 *
 * @module build/zip
 */
/**
 * `zip -x` patterns left out by default (a `*` crosses folders): SVG sources
 * of rendered icons, type declarations that only editors read, the stamps
 * of vendored copies (`vendored.json`, build/vendor.js), and Finder's
 * `.DS_Store` files.
 */
export declare const ZIP_EXCLUDE: readonly string[];
/**
 * Whether a file under an extension folder ships, by the same rules as
 * {@link ZIP_EXCLUDE}: for tests that compare the zip with the folder.
 *
 * @param {string} file - Path relative to the extension folder, forward slashes.
 * @returns {boolean} False for `icons/**.svg`, `*.d.ts`, a vendored copy's `vendored.json` and `.DS_Store`.
 */
export declare function shipsFile(file: string): boolean;
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
export declare function zipExtension(from: string, to: string, exclude?: readonly string[]): Promise<string>;
