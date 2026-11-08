/**
 * The worker side of the light/dark toolbar glyph, as Chrome's own toolbar
 * icons do. The service worker can't see the scheme (no `matchMedia`), so
 * documents report it (toolbar/scheme.js); this stores the last report per
 * computer and shows the matching glyph. `setIcon` changes only the image: a
 * badge still draws over it.
 *
 * An extension with nothing of its own on every page can keep an offscreen
 * document open to hear a theme change (`watchFromOffscreen`,
 * toolbar/offscreen.js).
 *
 * @module toolbar/theme
 */
/** Where the offscreen scheme watcher lives, from the extension's root. */
export declare const OFFSCREEN_PATH = "offscreen/offscreen.html";
/** Where the rendered glyphs live (build/toolbar-icons.js writes them). */
export declare const TOOLBAR_ICON_DIR = "/icons/toolbar";
export type ToolbarIconPaths = {
    16: string;
    32: string;
    48: string;
};
export type ToolbarThemeApi = {
    /**
     *   `chrome.storage.local`.
     */
    storage: {
        get(keys: string): Promise<Record<string, any>>;
        set(items: Record<string, unknown>): Promise<void>;
    };
    /**
     * `chrome.action`.
     */
    action: {
        setIcon(details: {
            path: ToolbarIconPaths;
        }): Promise<void>;
    };
    /**
     * `chrome.runtime.id`: reports from anyone else are ignored.
     */
    extensionId: string;
};
export type ToolbarTheme = {
    /**
     * Show the dark glyph again if that's what was
     * seen last: after a restart or re-enable Chrome shows the manifest's light one.
     */
    restore: () => Promise<void>;
    /**
     * Handle a
     * scheme report; returns whether it was one (handled or ignored), so a worker's
     * message listener can stop there.
     */
    onMessage: (message: unknown, sender?: {
        id?: string;
    }) => boolean;
    /**
     * Resolves once every report so far is handled.
     */
    settled: () => Promise<void>;
};
/**
 * @typedef {{16: string, 32: string, 48: string}} ToolbarIconPaths
 */
/**
 * The worker APIs the toolbar theme uses: pieces of `chrome`, or fakes.
 *
 * @typedef {object} ToolbarThemeApi
 * @property {{get(keys: string): Promise<Record<string, any>>, set(items: Record<string, unknown>): Promise<void>}} storage
 *   `chrome.storage.local`.
 * @property {{setIcon(details: {path: ToolbarIconPaths}): Promise<void>}} action `chrome.action`.
 * @property {string} extensionId `chrome.runtime.id`: reports from anyone else are ignored.
 */
/**
 * @typedef {object} ToolbarTheme
 * @property {() => Promise<void>} restore Show the dark glyph again if that's what was
 *   seen last: after a restart or re-enable Chrome shows the manifest's light one.
 * @property {(message: unknown, sender?: {id?: string}) => boolean} onMessage Handle a
 *   scheme report; returns whether it was one (handled or ignored), so a worker's
 *   message listener can stop there.
 * @property {() => Promise<void>} settled Resolves once every report so far is handled.
 */
/**
 * The glyph for a scheme; the manifest's `default_icon` is the light one.
 * Paths start with "/": Chrome resolves `setIcon` paths against the worker's
 * own address, where a relative one fails to load.
 *
 * @param {boolean} dark - The dark scheme's glyph, else the light one's.
 * @returns {ToolbarIconPaths} Paths by size, for `chrome.action.setIcon`.
 * @example
 * toolbarIcon(true); // { 16: '/icons/toolbar/dark-16.png', 32: …, 48: … }
 */
export declare function toolbarIcon(dark: boolean): ToolbarIconPaths;
/**
 * The worker's toolbar theme: one report at a time, so two quick ones can't
 * store one scheme and show the other.
 *
 * @param {ToolbarThemeApi} api - Storage, the action and this extension's id.
 * @returns {ToolbarTheme} The theme's handlers.
 */
export declare function createToolbarTheme({ storage, action, extensionId }: ToolbarThemeApi): ToolbarTheme;
export type OffscreenApi = {
    /**
     *   `chrome.offscreen`.
     */
    offscreen: {
        createDocument(details: {
            url: string;
            reasons: string[];
            justification: string;
        }): Promise<void>;
        Reason: {
            MATCH_MEDIA: string;
        };
    };
    /**
     * `chrome.runtime`.
     */
    runtime: {
        getContexts(filter: {
            contextTypes: 'OFFSCREEN_DOCUMENT'[];
        }): Promise<unknown[]>;
    };
};
/**
 * Open the offscreen document that watches the scheme (reason MATCH_MEDIA),
 * unless it's open. It stays open: it's one small page in the extension's own
 * process, and the only way to hear a theme change while no page of ours is
 * open. Chrome closes it when the browser quits, so call this each time the
 * worker starts. Concurrent calls share one attempt.
 *
 * @param {OffscreenApi} api - `chrome.offscreen` and `chrome.runtime`.
 * @param {string} [url] - The document, from the extension's root. Default {@link OFFSCREEN_PATH}.
 * @returns {Promise<boolean>} Whether it opened one (false: already open).
 */
export declare function watchFromOffscreen({ offscreen, runtime }: OffscreenApi, url?: string): Promise<boolean>;
export type ToolbarWorkerApi = {
    /**
     * `chrome.storage`.
     */
    storage: {
        local: ToolbarThemeApi['storage'];
    };
    /**
     * `chrome.action`.
     */
    action: ToolbarThemeApi['action'];
    /**
     * `chrome.offscreen`.
     */
    offscreen: OffscreenApi['offscreen'];
    /**
     *   `chrome.runtime`.
     */
    runtime: OffscreenApi['runtime'] & {
        id: string;
        onMessage: {
            addListener(listener: (message: unknown, sender: {
                id?: string;
            }) => boolean): void;
        };
    };
};
/**
 * Everything `startToolbarTheme` wires up: `chrome` itself will do.
 *
 * @typedef {object} ToolbarWorkerApi
 * @property {{local: ToolbarThemeApi['storage']}} storage `chrome.storage`.
 * @property {ToolbarThemeApi['action']} action `chrome.action`.
 * @property {OffscreenApi['offscreen']} offscreen `chrome.offscreen`.
 * @property {OffscreenApi['runtime'] & {id: string, onMessage: {addListener(listener: (message: unknown, sender: {id?: string}) => boolean): void}}} runtime
 *   `chrome.runtime`.
 */
/**
 * The whole worker side for an extension that watches from an offscreen
 * document: restore the last glyph, open the watcher, and handle its reports.
 * Call it at the worker's top level, so the listener attaches every time the
 * worker wakes.
 *
 * @param {ToolbarWorkerApi} api - `chrome`, or a fake.
 * @returns {ToolbarTheme} The theme, for tests.
 * @example
 * // background.js
 * startToolbarTheme(chrome);
 */
export declare function startToolbarTheme(api: ToolbarWorkerApi): ToolbarTheme;
