/**
 * Helpers for an extension's packaging test: list the folder, list the real
 * zip of it, and find every path the extension names that doesn't resolve to
 * a file inside it (a broken import, a stylesheet link, a manifest entry).
 *
 * @module testing/package
 */
/**
 * Every file under `dir`.
 *
 * @param {string} dir - The folder.
 * @returns {Promise<string[]>} Paths relative to it, forward slashes, sorted.
 */
export declare function filesUnder(dir: string): Promise<string[]>;
/**
 * The entries of the real zip of `from` (build/zip.js), listed by `unzip`.
 *
 * @param {string} from - The extension folder.
 * @param {readonly string[]} [exclude] - `zip -x` patterns, as `zipExtension` takes.
 * @returns {Promise<string[]>} Entry names, sorted.
 */
export declare function zipEntries(from: string, exclude?: readonly string[]): Promise<string[]>;
/**
 * The paths a manifest names, from the extension's root.
 *
 * @param {Record<string, any>} manifest - The parsed `manifest.json`.
 * @returns {string[]} Worker, pages, icons, side panel and web-accessible resources.
 */
export declare function manifestReferences(manifest: Record<string, any>): string[];
/**
 * Every path the extension names that isn't a file inside it: relative
 * imports in its scripts, `chrome.runtime.getURL('…')` paths, `src`/`href`
 * in its pages, the manifest's entries, and any `extra` paths.
 *
 * @param {string} dir - The extension folder.
 * @param {readonly string[]} [extra] - More paths from the root (say, a script injected by name).
 * @returns {Promise<string[]>} "from → target" for each missing one; empty when all resolve.
 */
export declare function missingReferences(dir: string, extra?: readonly string[]): Promise<string[]>;
