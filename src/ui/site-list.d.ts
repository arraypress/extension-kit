/**
 * A settings card's list of sites (“Never on”, “Allowed sites”), in one of
 * Chrome's two ways:
 *
 * - **With an add row** (`form`), as a short list in a chrome://settings
 *   card: a row per site with a Remove button, and below them a field and an
 *   Add button.
 * - **With an Add button and a dialog** (`addButton`), as
 *   chrome://settings/performance lists the sites Memory Saver keeps active:
 *   the button asks for a site in the one-field dialog (“Add site”), and each
 *   row has a ⋮ menu with Edit and Remove.
 *
 * Either way, an optional “No sites added” row shows while there are none.
 * The page's markup holds the list, the empty row and the form or button (so
 * they're localised with the rest of the page); this fills the list and wires
 * them up.
 *
 * ```html
 * <ul class="list" id="never-sites"></ul>
 * <p class="row text" id="no-sites"><span class="label secondary">No sites added</span></p>
 * <form class="row add" id="add-never">
 *   <input type="text" placeholder="example.com" aria-label="Site" autocomplete="off" spellcheck="false">
 *   <button type="submit">Add</button>
 * </form>
 * ```
 *
 * @module ui/site-list
 */
export type SiteListWords = {
    /**
     * The Add button in the dialog.
     */
    add: string;
    /**
     * The dialog's title when adding.
     */
    addSite: string;
    /**
     * The dialog's title when editing.
     */
    editSite: string;
    /**
     * The ⋮ menu's Edit item.
     */
    edit: string;
    /**
     * The Remove button, or the ⋮ menu's Remove item.
     */
    remove: string;
    /**
     * The dialog's action when editing.
     */
    save: string;
    /**
     * The dialog's Cancel button.
     */
    cancel: string;
    /**
     * The dialog's field label.
     */
    site: string;
    /**
     * Under the dialog's field while what's typed isn't a site.
     */
    invalid: string;
    /**
     * The Remove button's name for screen readers.
     */
    removeLabel: (label: string) => string;
    /**
     * The ⋮ button's name for screen readers.
     */
    moreActions: (label: string) => string;
};
/**
 * The list's words, Chrome's English by default; a page passes its translations.
 *
 * @typedef {object} SiteListWords
 * @property {string} add The Add button in the dialog.
 * @property {string} addSite The dialog's title when adding.
 * @property {string} editSite The dialog's title when editing.
 * @property {string} edit The ⋮ menu's Edit item.
 * @property {string} remove The Remove button, or the ⋮ menu's Remove item.
 * @property {string} save The dialog's action when editing.
 * @property {string} cancel The dialog's Cancel button.
 * @property {string} site The dialog's field label.
 * @property {string} invalid Under the dialog's field while what's typed isn't a site.
 * @property {(label: string) => string} removeLabel The Remove button's name for screen readers.
 * @property {(label: string) => string} moreActions The ⋮ button's name for screen readers.
 */
/** @type {Readonly<SiteListWords>} */
export declare const SITE_LIST_WORDS: Readonly<SiteListWords>;
export type SiteListOptions = {
    /**
     * The `<ul class="list">` to fill.
     */
    list: HTMLElement;
    /**
     * Shown while the list is empty.
     */
    empty?: HTMLElement;
    /**
     * An add row: a form with one text field and a submit button.
     */
    form?: HTMLFormElement;
    /**
     * Or an Add button that asks in the dialog; each row then has a
     * ⋮ menu (Edit, Remove) instead of a Remove button.
     */
    addButton?: HTMLElement;
    /**
     * What was typed as the site the list keeps
     * (`siteHost`, `siteOrigin`), or null when it isn't one.
     */
    parse: (text: string) => string | null;
    /**
     * Adds a parsed site (asking Chrome for access first, if
     * the list needs it). Resolve to false to keep the text in the add row's field (access refused).
     */
    add: (site: string) => unknown;
    /**
     * Removes a site.
     */
    remove: (site: string) => unknown;
    /**
     * Puts an edited site in place of
     * the old one (the ⋮ menu's Edit; without it, the menu has only Remove).
     */
    replace?: (site: string, edited: string) => unknown;
    /**
     * The add row: called with what was typed when it isn't a site.
     */
    invalid?: (text: string) => void;
    /**
     * How a site reads. Default {@link siteLabel}.
     */
    label?: (site: string) => string;
    /**
     * The dialog field's `maxlength`. Default {@link MAX_HOST_LENGTH}.
     */
    maxLength?: number;
    /**
     * Translations of {@link SITE_LIST_WORDS}.
     */
    words?: Partial<SiteListWords>;
};
export type SiteList = {
    /**
     * Show these sites (call it whenever they change).
     */
    render: (sites: readonly string[]) => void;
};
/**
 * What {@link createSiteList} takes: the list, one way to add to it, and
 * what adding, removing and editing do.
 *
 * @typedef {object} SiteListOptions
 * @property {HTMLElement} list The `<ul class="list">` to fill.
 * @property {HTMLElement} [empty] Shown while the list is empty.
 * @property {HTMLFormElement} [form] An add row: a form with one text field and a submit button.
 * @property {HTMLElement} [addButton] Or an Add button that asks in the dialog; each row then has a
 *   ⋮ menu (Edit, Remove) instead of a Remove button.
 * @property {(text: string) => string | null} parse What was typed as the site the list keeps
 *   (`siteHost`, `siteOrigin`), or null when it isn't one.
 * @property {(site: string) => unknown} add Adds a parsed site (asking Chrome for access first, if
 *   the list needs it). Resolve to false to keep the text in the add row's field (access refused).
 * @property {(site: string) => unknown} remove Removes a site.
 * @property {(site: string, edited: string) => unknown} [replace] Puts an edited site in place of
 *   the old one (the ⋮ menu's Edit; without it, the menu has only Remove).
 * @property {(text: string) => void} [invalid] The add row: called with what was typed when it isn't a site.
 * @property {(site: string) => string} [label] How a site reads. Default {@link siteLabel}.
 * @property {number} [maxLength] The dialog field's `maxlength`. Default {@link MAX_HOST_LENGTH}.
 * @property {Partial<SiteListWords>} [words] Translations of {@link SITE_LIST_WORDS}.
 */
/**
 * A site list.
 *
 * @typedef {object} SiteList
 * @property {(sites: readonly string[]) => void} render Show these sites (call it whenever they change).
 */
/**
 * Fill a site list and wire its way of adding: an add row (typing a site and
 * pressing Enter or Add) or an Add button (the dialog, which keeps its Add off
 * until what's typed is a site). A row's Remove (or its ⋮ menu's Remove and
 * Edit) hands its site to `remove` (or `replace`).
 *
 * @param {SiteListOptions} options - The markup, the parser and what adding and removing do.
 * @returns {SiteList} The list.
 * @example
 * const never = createSiteList({
 *   list: byId('never-sites'), form: byId('add-never', HTMLFormElement), empty: byId('no-sites'),
 *   parse: siteHost,
 *   add: (host) => save({ neverSites: [...settings.neverSites, host] }),
 *   remove: (host) => save({ neverSites: settings.neverSites.filter((h) => h !== host) }),
 *   words: { remove: t('optionsRemove'), removeLabel: (site) => t('optionsRemoveLabel', [site]) },
 * });
 * never.render(settings.neverSites);
 */
export declare function createSiteList({ list, empty, form, addButton, parse, add, remove, replace, invalid, label, maxLength, words, }: SiteListOptions): SiteList;
