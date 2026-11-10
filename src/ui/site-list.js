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

import { createMenu, moreActionsButton } from './menu.js';
import { askText } from './text-dialog.js';
import { MAX_HOST_LENGTH, siteLabel } from '../sites/sites.js';

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
export const SITE_LIST_WORDS = Object.freeze({
  add: 'Add',
  addSite: 'Add site',
  editSite: 'Edit site',
  edit: 'Edit',
  remove: 'Remove',
  save: 'Save',
  cancel: 'Cancel',
  site: 'Site',
  invalid: 'Enter a site, like example.com',
  removeLabel: (/** @type {string} */ label) => `Remove “${label}”`,
  moreActions: (/** @type {string} */ label) => `More actions for “${label}”`,
});

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
export function createSiteList({
  list, empty, form, addButton, parse, add, remove, replace, invalid, label = siteLabel, maxLength = MAX_HOST_LENGTH, words,
}) {
  const doc = list.ownerDocument;
  const w = { ...SITE_LIST_WORDS, ...words };
  const menu = addButton ? createMenu({ doc }) : null;

  /**
   * Ask for a site in the dialog.
   *
   * @param {string} title - Its title.
   * @param {string} action - Its action button.
   * @param {string} [value] - The site to start with.
   * @returns {Promise<string | null>} The site, parsed, or null when cancelled.
   */
  const ask = async (title, action, value) => {
    const text = await askText({
      title, label: w.site, value, action, cancel: w.cancel, maxLength, doc,
      validate: (typed) => (parse(typed) ? null : w.invalid),
    });
    return text === null ? null : parse(text);
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    const site = parse(input.value);
    if (!site) invalid?.(input.value);
    else if (await add(site) !== false) input.value = '';
  });
  addButton?.addEventListener('click', async () => {
    const site = await ask(w.addSite, w.add);
    if (site) await add(site);
  });

  /**
   * The end of a site's row: its ⋮ button, or its Remove button.
   *
   * @param {string} site - The site.
   * @param {string} name - How it reads.
   * @returns {HTMLButtonElement} The button.
   */
  const rowEnd = (site, name) => {
    if (menu) {
      return moreActionsButton(name, {
        label: w.moreActions(name), doc,
        onClick: (anchor) => menu.open([
          ...replace ? [{
            label: w.edit,
            run: async () => {
              const edited = await ask(w.editSite, w.save, name);
              if (edited && edited !== site) await replace(site, edited);
            },
          }] : [],
          { label: w.remove, run: () => remove(site) },
        ], { anchor }),
      });
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = w.remove;
    button.setAttribute('aria-label', w.removeLabel(name));
    button.addEventListener('click', () => remove(site));
    return button;
  };

  return {
    render(sites) {
      list.replaceChildren(...sites.map((site) => {
        const row = doc.createElement('li');
        row.className = 'row';
        const name = doc.createElement('span');
        name.className = 'label';
        name.textContent = label(site);
        row.append(name, rowEnd(site, name.textContent));
        return row;
      }));
      if (empty) empty.hidden = sites.length > 0;
    },
  };
}
