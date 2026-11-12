/**
 * Helpers for an extension's packaging test: list the folder, list the real
 * zip of it, and find every path the extension names that doesn't resolve to
 * a file the zip holds (a broken import, a stylesheet link, a manifest entry).
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
     * The options page, the older way.
     */
    options_page?: string;
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
    /**
     * Scripts and styles Chrome puts in pages.
     */
    content_scripts?: {
        js?: string[];
        css?: string[];
    }[];
    /**
     * The locale whose `_locales/<locale>/messages.json` must be there.
     */
    default_locale?: string;
    /**
     * Rule files.
     */
    declarative_net_request?: {
        rule_resources?: {
            path: string;
        }[];
    };
    /**
     * Pages that replace Chrome's (the new tab page).
     */
    chrome_url_overrides?: Record<string, string>;
    /**
     * The DevTools page.
     */
    devtools_page?: string;
    /**
     * Sandboxed pages.
     */
    sandbox?: {
        pages?: string[];
    };
};
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
export declare function missingReferences(dir: string, extra?: readonly string[]): Promise<string[]>;
