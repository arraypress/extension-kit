/**
 * Chrome's text dialog (cr-dialog with cr-inputs): a title, labelled fields,
 * Cancel and an action button. One field, as chrome://bookmarks asks for a
 * folder's name (`askText`); several, as chrome://settings/searchEngines asks
 * for a site search (`askFields`). The action button stays disabled while a
 * field is blank or isn't valid, with the reason under that field. Enter
 * means the action button, Esc and Cancel cancel (as does the dialog being
 * closed any other way), and the focus goes back to what opened it. A reason
 * is announced as it appears, and its field marked invalid. The page needs no markup: the dialog (`#text-dialog`) is
 * made the first time, its fields each time it's asked.
 *
 * @module ui/text-dialog
 */
export type FieldRequest = {
    /**
     * Its key in the answer ("folder"), and part of its id.
     */
    name: string;
    /**
     * Its label ("Folder").
     */
    label: string;
    /**
     * The text to start with. Default ''. A promise is text
     * still being worked out (an on-device model's suggestion): the field waits, disabled, with
     * `waiting` under it, and takes the text when it comes ('' if it fails).
     */
    value?: string | Promise<string>;
    /**
     * What the field says while its `value` is worked out ("Finding words…").
     */
    waiting?: string;
    /**
     * Shown while it's empty. Default none.
     */
    placeholder?: string;
    /**
     * A `<textarea>` (cr-textarea) rather than one line: Enter starts a new
     * line, and only the action button saves. Default false.
     */
    multiline?: boolean;
    /**
     * A multi-line field's height in lines. Default 6.
     */
    rows?: number;
    /**
     * Help under the field (cr-input's
     * description), or a function of its text, kept up as it's typed ("12 words"). Default none.
     */
    hint?: string | ((text: string) => string);
    /**
     * Why the (non-blank) text can't be used,
     * shown under the field; null when it can. Default: anything but blank.
     */
    validate?: (text: string) => string | null;
    /**
     * Its `maxlength`. Default none.
     */
    maxLength?: number;
};
export type DialogRequest = {
    /**
     * The dialog's title ("Rename folder").
     */
    title: string;
    /**
     * The action button's text. Default "Save".
     */
    action?: string;
    /**
     * The cancel button's text. Default "Cancel".
     */
    cancel?: string;
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
export type TextRequest = DialogRequest & Omit<FieldRequest, 'name'>;
export type FieldsRequest = DialogRequest & {
    fields: FieldRequest[];
};
/**
 * One field of the dialog.
 *
 * @typedef {object} FieldRequest
 * @property {string} name Its key in the answer ("folder"), and part of its id.
 * @property {string} label Its label ("Folder").
 * @property {string | Promise<string>} [value] The text to start with. Default ''. A promise is text
 *   still being worked out (an on-device model's suggestion): the field waits, disabled, with
 *   `waiting` under it, and takes the text when it comes ('' if it fails).
 * @property {string} [waiting] What the field says while its `value` is worked out ("Finding words…").
 * @property {string} [placeholder] Shown while it's empty. Default none.
 * @property {boolean} [multiline] A `<textarea>` (cr-textarea) rather than one line: Enter starts a new
 *   line, and only the action button saves. Default false.
 * @property {number} [rows] A multi-line field's height in lines. Default 6.
 * @property {string | ((text: string) => string)} [hint] Help under the field (cr-input's
 *   description), or a function of its text, kept up as it's typed ("12 words"). Default none.
 * @property {(text: string) => string | null} [validate] Why the (non-blank) text can't be used,
 *   shown under the field; null when it can. Default: anything but blank.
 * @property {number} [maxLength] Its `maxlength`. Default none.
 */
/**
 * What the dialog asks, whatever its fields.
 *
 * @typedef {object} DialogRequest
 * @property {string} title The dialog's title ("Rename folder").
 * @property {string} [action] The action button's text. Default "Save".
 * @property {string} [cancel] The cancel button's text. Default "Cancel".
 * @property {HTMLElement | (() => HTMLElement | null | undefined) | null} [returnTo] Where the focus
 *   goes when it closes, or a function that says (asked then, so it can pick a row drawn since).
 *   Default what had the focus when it opened.
 * @property {Document} [doc] The page. Default `document`.
 */
/**
 * What the one-field dialog asks.
 *
 * @typedef {DialogRequest & Omit<FieldRequest, 'name'>} TextRequest
 */
/**
 * What the dialog with several fields asks.
 *
 * @typedef {DialogRequest & {fields: FieldRequest[]}} FieldsRequest
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
/**
 * A field's element ids. A one-field dialog's are `text-dialog-input` and `text-dialog-error`;
 * with several, each is named: `text-dialog-<name>` and `text-dialog-<name>-error`. Pure.
 *
 * @param {string} name - The field's name.
 * @param {boolean} only - Whether it's the dialog's only field.
 * @returns {{input: string, error: string, hint: string}} The ids.
 * @example
 * fieldIds('folder', false); // → {input: 'text-dialog-folder', error: 'text-dialog-folder-error', hint: 'text-dialog-folder-hint'}
 */
export declare function fieldIds(name: string, only: boolean): {
    input: string;
    error: string;
    hint: string;
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
     * Where the fields go.
     */
    body: HTMLElement;
    /**
     * The cancel button.
     */
    cancel: HTMLButtonElement;
    /**
     * The action button.
     */
    confirm: HTMLButtonElement;
};
export type Field = {
    /**
     * What was asked.
     */
    request: FieldRequest;
    /**
     * Its input.
     */
    input: HTMLInputElement | HTMLTextAreaElement;
    /**
     * The reason under it.
     */
    error: HTMLElement;
    /**
     * The help under it.
     */
    hint: HTMLElement;
    /**
     * Whether its value is still being worked out.
     */
    waiting: boolean;
};
/**
 * Ask for several pieces of text in the page's dialog, one field each.
 *
 * @param {FieldsRequest} request - What to ask.
 * @returns {Promise<Record<string, string> | null>} Each field's text by its name, trimmed; null
 *   when cancelled.
 * @example
 * const rule = await askFields({
 *   title: 'Add folder rule', action: 'Add',
 *   fields: [
 *     {name: 'from', label: 'Downloads from', placeholder: 'example.com or .pdf', validate: checkFrom},
 *     {name: 'folder', label: 'Folder', placeholder: 'Receipts'},
 *   ],
 * });
 * if (rule) addRule(rule.from, rule.folder);
 */
export declare function askFields({ title, fields: requests, action, cancel, returnTo, doc, }: FieldsRequest): Promise<Record<string, string> | null>;
/**
 * Ask for a piece of text in the page's dialog, with one field.
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
export declare function askText({ label, value, placeholder, validate, maxLength, multiline, rows, hint, waiting, ...dialog }: TextRequest): Promise<string | null>;
