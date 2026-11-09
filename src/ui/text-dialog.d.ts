/**
 * Chrome's one-field dialog (cr-dialog with a cr-input), as chrome://bookmarks
 * asks for a folder's name: a title, a labelled field, Cancel and an action
 * button. The action button stays disabled while the text is blank or isn't
 * valid, with the reason under the field. Enter means the action button, Esc
 * and Cancel cancel, and the focus goes back to what opened it. The page
 * needs no markup: the dialog (`#text-dialog`) is made the first time.
 *
 * @module ui/text-dialog
 */
export type TextRequest = {
    /**
     * The dialog's title ("Rename folder").
     */
    title: string;
    /**
     * The field's label ("Name").
     */
    label: string;
    /**
     * The text to start with (selected). Default ''.
     */
    value?: string;
    /**
     * The action button's text. Default "Save".
     */
    action?: string;
    /**
     * The cancel button's text. Default "Cancel".
     */
    cancel?: string;
    /**
     * Why the (non-blank) text can't be used,
     * shown under the field; null when it can. Default: anything but blank.
     */
    validate?: (text: string) => string | null;
    /**
     * The field's `maxlength`. Default none.
     */
    maxLength?: number;
    /**
     * Where the focus
     * goes when it closes, or a function that says (asked then, so it can pick a row drawn since).
     * Default what had the focus when it opened.
     */
    returnTo?: HTMLElement | (() => HTMLElement | null | undefined) | null;
    /**
     * The page. Default `document`.
     */
    doc?: Document;
};
/**
 * What the dialog asks.
 *
 * @typedef {object} TextRequest
 * @property {string} title The dialog's title ("Rename folder").
 * @property {string} label The field's label ("Name").
 * @property {string} [value] The text to start with (selected). Default ''.
 * @property {string} [action] The action button's text. Default "Save".
 * @property {string} [cancel] The cancel button's text. Default "Cancel".
 * @property {(text: string) => string | null} [validate] Why the (non-blank) text can't be used,
 *   shown under the field; null when it can. Default: anything but blank.
 * @property {number} [maxLength] The field's `maxlength`. Default none.
 * @property {HTMLElement | (() => HTMLElement | null | undefined) | null} [returnTo] Where the focus
 *   goes when it closes, or a function that says (asked then, so it can pick a row drawn since).
 *   Default what had the focus when it opened.
 * @property {Document} [doc] The page. Default `document`.
 */
/**
 * Whether a text can be used, and the reason to show when it can't. Pure.
 *
 * @param {string} text - What's typed.
 * @param {(text: string) => string | null} [validate] - Why a non-blank text can't be used, or null.
 * @returns {{ok: boolean, reason: string}} `ok` when it can be used; `reason` is '' for blank text
 *   (nothing to say yet) and for a usable one.
 * @example
 * checkText('  ');                         // → {ok: false, reason: ''}
 * checkText('x', () => 'Enter a site');    // → {ok: false, reason: 'Enter a site'}
 */
export declare function checkText(text: string, validate?: (text: string) => string | null): {
    ok: boolean;
    reason: string;
};
export type Parts = {
    /**
     * The `<dialog>`.
     */
    dialog: HTMLDialogElement;
    /**
     * Its form.
     */
    form: HTMLFormElement;
    /**
     * The title.
     */
    title: HTMLElement;
    /**
     * The field's label.
     */
    label: HTMLLabelElement;
    /**
     * The field.
     */
    input: HTMLInputElement;
    /**
     * The reason under the field.
     */
    error: HTMLElement;
    /**
     * The cancel button.
     */
    cancel: HTMLButtonElement;
    /**
     * The action button.
     */
    confirm: HTMLButtonElement;
};
/**
 * Ask for a piece of text in the page's one-field dialog.
 *
 * @param {TextRequest} request - What to ask.
 * @returns {Promise<string | null>} The text, trimmed; null when cancelled.
 * @example
 * const name = await askText({title: 'Rename workspace', label: 'Name', value: workspace.name, maxLength: 200});
 * if (name) rename(workspace, name);
 *
 * const site = await askText({
 *   title: 'Add site', label: 'Site', action: 'Add',
 *   validate: (text) => (siteFromInput(text) ? null : 'Enter a site, like example.com'),
 * });
 */
export declare function askText({ title, label, value, action, cancel, validate, maxLength, returnTo, doc, }: TextRequest): Promise<string | null>;
