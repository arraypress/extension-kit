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
export type ManifestFiles = {
    /**
     * The worker.
     */
    background?: {
        service_worker?: string;
    };
    /**
     * The options page.
     */
    options_ui?: {
        page?: string;
    };
    /**
     * The popup and toolbar icon.
     */
    action?: {
        default_popup?: string;
        default_icon?: string | Record<string, string>;
    };
    /**
     * The side panel.
     */
    side_panel?: {
        default_path?: string;
    };
    /**
     * The extension's icons.
     */
    icons?: Record<string, string>;
    /**
     * Files pages may load.
     */
    web_accessible_resources?: {
        resources: string[];
    }[];
};
/**
 * The parts of a manifest that name files.
 *
 * @typedef {object} ManifestFiles
 * @property {{service_worker?: string}} [background] The worker.
 * @property {{page?: string}} [options_ui] The options page.
 * @property {{default_popup?: string, default_icon?: string | Record<string, string>}} [action] The popup and toolbar icon.
 * @property {{default_path?: string}} [side_panel] The side panel.
 * @property {Record<string, string>} [icons] The extension's icons.
 * @property {{resources: string[]}[]} [web_accessible_resources] Files pages may load.
 */
/**
 * The paths a manifest names, from the extension's root.
 *
 * @param {ManifestFiles} manifest - The parsed `manifest.json`.
 * @returns {string[]} Worker, pages, icons, side panel and web-accessible resources (less patterns with `*`).
 */
export declare function manifestReferences(manifest: ManifestFiles): string[];
/**
 * The file a reference names: the path without its `#fragment` or `?query`
 * (`options.html#workspaces` is `options.html`). Pure.
 *
 * @param {string} reference - A path as the extension writes it.
 * @returns {string} The path alone; '' for a reference to the page itself (`#top`).
 */
export declare function referencedPath(reference: string): string;
/**
 * Every path the extension names that isn't a file inside it: relative
 * imports in its scripts, `chrome.runtime.getURL('…')` paths, `src`/`href`
 * in its pages, the manifest's entries, and any `extra` paths. A `#fragment`
 * or `?query` is ignored: `getURL('options.html#workspaces')` names
 * `options.html`.
 *
 * @param {string} dir - The extension folder.
 * @param {readonly string[]} [extra] - More paths from the root (say, a script injected by name).
 * @returns {Promise<string[]>} "from → target" for each missing one; empty when all resolve.
 */
export declare function missingReferences(dir: string, extra?: readonly string[]): Promise<string[]>;
