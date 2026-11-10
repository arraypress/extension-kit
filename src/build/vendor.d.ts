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
/** What a vendored copy of the kit holds, relative to `src/`: everything an extension page or worker may load. */
export declare const RUNTIME_ENTRIES: readonly string[];
/** The kit's stylesheet, an absolute path in the installed package. */
export declare const STYLESHEET: string;
/** The file in each vendored folder that names the package and version it was copied from (left out of the zip). */
export declare const VENDOR_STAMP = "vendored.json";
export type VendorStamp = {
    /**
     * The package's name.
     */
    package: string;
    /**
     * Its version when copied.
     */
    version: string;
};
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
export declare function packageDir(name: string, from?: string): Promise<string>;
/**
 * Replace `dest` with a fresh copy of the kit's runtime modules and stylesheet.
 *
 * @param {string} dest - The folder to fill, e.g. `extension/vendor/extension-kit`. Removed first.
 * @returns {Promise<string[]>} The entries copied, relative to `dest`.
 * @example
 * await vendorKit('extension/vendor/extension-kit');
 * // extension/vendor/extension-kit/index.js, …/styles/chrome-ui.css, …, vendored.json
 */
export declare function vendorKit(dest: string): Promise<string[]>;
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
export declare function vendorPackage(name: string, files: readonly string[], dest: string, { from }?: {
    from?: string;
}): Promise<string[]>;
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
export declare function checkVendored(dir: string, { from }?: {
    from?: string;
}): Promise<string[]>;
