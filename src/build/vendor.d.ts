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
    /**
     * The paths copied, as {@link vendorPackage} took them (the kit's own copy has none).
     */
    files?: string[];
    /**
     * A hash of every file copied ({@link treeHash}); a copy from before 1.11 has none.
     */
    hash?: string;
};
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
export declare function packageDir(name: string, from?: string): Promise<string>;
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
 * @throws {Error} When the package isn't installed, a path isn't in it, two paths would land in
 *   the same place (`dist/index.js` and `rules/index.js`), or `dest` holds an extension or a project.
 *
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
export declare function checkVendored(dir: string, { from }?: {
    from?: string;
}): Promise<string[]>;
