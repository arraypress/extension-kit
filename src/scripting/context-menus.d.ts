/**
 * The right-click menu built whole, one build after another. A worker builds its menu on install
 * and on browser start, and after a Chrome update both events come in the same run: two builds
 * side by side clear the menu twice and then each creates every item, so Chrome reports
 * "Cannot create item with duplicate id" for each on the extension's Errors page. Built through
 * this, the second build starts once the first is done.
 *
 * @module scripting/context-menus
 */
export type MenuEdges = {
    /**
     * The menu.
     */
    contextMenus: Pick<typeof chrome.contextMenus, 'removeAll' | 'create'>;
    /**
     * Where Chrome leaves `create`'s error.
     */
    runtime: {
        lastError?: {
            message?: string;
        };
    };
};
/**
 * The parts of `chrome` a menu build uses.
 *
 * @typedef {object} MenuEdges
 * @property {Pick<typeof chrome.contextMenus, 'removeAll' | 'create'>} contextMenus The menu.
 * @property {{lastError?: {message?: string}}} runtime Where Chrome leaves `create`'s error.
 */
/**
 * A builder for an extension's right-click menu: each call takes every item away and creates the
 * ones given, in order (a parent before its children), after any build still under way.
 * `contextMenus.create` has no promise form; an item Chrome refuses is logged, not thrown, so one
 * bad item can't stop the rest.
 *
 * @param {MenuEdges} edges - `chrome` (or fakes in tests).
 * @returns {(items: readonly chrome.contextMenus.CreateProperties[]) => Promise<void>} Builds the
 *   menu; settles once Chrome has made (or refused) the last item.
 * @example
 * const buildMenu = contextMenuBuilder(chrome);
 * chrome.runtime.onInstalled.addListener(() => buildMenu(menuItems(t)));
 * chrome.runtime.onStartup.addListener(() => buildMenu(menuItems(t)));
 */
export declare function contextMenuBuilder({ contextMenus, runtime }: MenuEdges): (items: readonly chrome.contextMenus.CreateProperties[]) => Promise<void>;
