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

import { focusedElement } from '../dom/focus.js';

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
export function checkText(text, validate = () => null) {
  if (!text.trim()) return { ok: false, reason: '' };
  const reason = validate(text);
  return { ok: reason === null, reason: reason ?? '' };
}

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
export function fieldIds(name, only) {
  return only
    ? { input: 'text-dialog-input', error: 'text-dialog-error', hint: 'text-dialog-hint' }
    : { input: `text-dialog-${name}`, error: `text-dialog-${name}-error`, hint: `text-dialog-${name}-hint` };
}

/**
 * The dialog's lasting parts; the fields go in `body` each time.
 *
 * @typedef {object} Parts
 * @property {HTMLDialogElement} dialog The `<dialog>`.
 * @property {HTMLFormElement} form Its form.
 * @property {HTMLElement} title The title.
 * @property {HTMLElement} body Where the fields go.
 * @property {HTMLButtonElement} cancel The cancel button.
 * @property {HTMLButtonElement} confirm The action button.
 */

/**
 * A field as shown.
 *
 * @typedef {object} Field
 * @property {FieldRequest} request What was asked.
 * @property {HTMLInputElement | HTMLTextAreaElement} input Its input.
 * @property {HTMLElement} error The reason under it.
 * @property {HTMLElement} hint The help under it.
 * @property {boolean} waiting Whether its value is still being worked out.
 */

/** Each page's dialog, made on first use. @type {WeakMap<Document, Parts>} */
const made = new WeakMap();

/**
 * An element of `doc` with `attributes`.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc - The page.
 * @param {K} tag - Its tag.
 * @param {Record<string, string>} [attributes] - Its attributes.
 * @returns {HTMLElementTagNameMap[K]} The element.
 */
function element(doc, tag, attributes = {}) {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

/**
 * The page's dialog, made the first time.
 *
 * @param {Document} doc - The page.
 * @returns {Parts} Its parts.
 */
function partsFor(doc) {
  const existing = made.get(doc);
  if (existing) return existing;
  const dialog = element(doc, 'dialog', { id: 'text-dialog', class: 'dialog', 'aria-labelledby': 'text-dialog-title' });
  const form = element(doc, 'form', { novalidate: '' });
  const title = element(doc, 'h2', { id: 'text-dialog-title', class: 'dialog-title' });
  const body = element(doc, 'div', { class: 'dialog-body' });
  const buttons = element(doc, 'div', { class: 'dialog-buttons' });
  const cancel = element(doc, 'button', { type: 'button', class: 'cancel' });
  const confirm = element(doc, 'button', { id: 'text-dialog-confirm', type: 'submit', class: 'action' });
  buttons.append(cancel, confirm);
  form.append(title, body, buttons);
  dialog.append(form);
  doc.body.append(dialog);
  const parts = { dialog, form, title, body, cancel, confirm };
  made.set(doc, parts);
  return parts;
}

/**
 * A field's label, input and reason, as cr-input lays them out.
 *
 * @param {Document} doc - The page.
 * @param {FieldRequest} request - The field.
 * @param {boolean} only - Whether it's the dialog's only field.
 * @returns {{row: HTMLElement, field: Field}} Its markup, and the parts to read.
 */
function fieldFor(doc, request, only) {
  const ids = fieldIds(request.name, only);
  const row = element(doc, 'div', { class: 'field' });
  const label = element(doc, 'label', { for: ids.input });
  label.textContent = request.label;
  const described = `${ids.error} ${ids.hint}`;
  const input = request.multiline
    ? element(doc, 'textarea', { id: ids.input, rows: String(request.rows ?? 6), 'aria-describedby': described })
    : element(doc, 'input', { id: ids.input, type: 'text', autocomplete: 'off', 'aria-describedby': described });
  input.value = typeof request.value === 'string' ? request.value : '';
  if (request.placeholder) input.placeholder = request.placeholder;
  if (request.maxLength !== undefined) input.maxLength = request.maxLength;
  const error = element(doc, 'span', { id: ids.error, class: 'hint error', 'aria-live': 'polite' });
  error.hidden = true;
  const hint = element(doc, 'span', { id: ids.hint, class: 'hint secondary' });
  hint.hidden = true;
  row.append(label, input, error, hint);
  return { row, field: { request, input, error, hint, waiting: false } };
}

/** The open dialog's settle function, per page. @type {WeakMap<Document, (answer: Record<string, string> | null) => void>} */
const pending = new WeakMap();

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
export function askFields({
  title, fields: requests, action = 'Save', cancel = 'Cancel', returnTo, doc = document,
}) {
  const parts = partsFor(doc);
  pending.get(doc)?.(null);
  const active = focusedElement(doc);
  const back = returnTo === undefined ? (active instanceof /** @type {Window & typeof globalThis} */ (doc.defaultView).HTMLElement ? active : null) : returnTo;

  const built = requests.map((request) => fieldFor(doc, request, requests.length === 1));
  const fields = built.map(({ field }) => field);
  parts.body.replaceChildren(...built.map(({ row }) => row));
  parts.title.textContent = title;
  parts.confirm.textContent = action;
  parts.cancel.textContent = cancel;

  const allOk = () => fields.every(({ input, request, waiting }) => !waiting && checkText(input.value, request.validate).ok);
  /** @param {Field} field */
  const refresh = ({ input, error, hint, request, waiting }) => {
    const { reason } = waiting ? { reason: '' } : checkText(input.value, request.validate);
    error.textContent = reason;
    error.hidden = !reason;
    // Said to a screen reader as it appears, and the field marked (the stylesheet turns its underline red).
    if (reason) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    hint.textContent = waiting ? request.waiting ?? '' : typeof request.hint === 'function' ? request.hint(input.value) : request.hint ?? '';
    hint.hidden = !hint.textContent;
  };
  for (const field of fields) refresh(field);
  parts.confirm.disabled = !allOk();

  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    /** @param {Record<string, string> | null} answer */
    const settle = (answer) => {
      controller.abort();
      pending.delete(doc);
      if (parts.dialog.open) parts.dialog.close();
      resolve(answer);
      // After whatever the answer re-renders, unless another dialog opened meanwhile.
      queueMicrotask(() => {
        if (doc.querySelector('dialog[open]')) return;
        const target = typeof back === 'function' ? back() : back;
        if (target?.isConnected) target.focus();
      });
    };
    pending.set(doc, settle);
    let typed = false;
    // A value still being worked out: the field waits, then takes it, unless the dialog has moved on.
    for (const field of fields) {
      const { value } = field.request;
      if (typeof value !== 'object' || !value) continue;
      field.waiting = true;
      field.input.disabled = true;
      refresh(field);
      value.catch(() => '').then((text) => {
        if (signal.aborted) return;
        field.waiting = false;
        field.input.disabled = false;
        field.input.value = text;
        refresh(field);
        parts.confirm.disabled = !allOk();
        // The person was waiting for it: the focus moves in, unless they've been typing meanwhile.
        if (!typed) field.input.focus();
      });
    }
    parts.confirm.disabled = !allOk();
    for (const field of fields) {
      field.input.addEventListener('input', () => {
        typed = true;
        refresh(field);
        parts.confirm.disabled = !allOk();
      }, { signal });
    }
    // Enter submits through the action button (the form's only submit button), never while it's disabled.
    parts.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (allOk()) settle(Object.fromEntries(fields.map(({ request, input }) => [request.name, input.value.trim()])));
    }, { signal });
    parts.cancel.addEventListener('click', () => settle(null), { signal });
    parts.dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      settle(null);
    }, { signal });
    parts.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      settle(null);
    }, { signal });
    // Closed any other way (the browser's own close after a second Esc, another script): cancelled, not left unanswered.
    // (The event comes a task after the closing: one from the ask before this, already answered, finds the dialog open again.)
    parts.dialog.addEventListener('close', () => { if (!parts.dialog.open) settle(null); }, { signal });

    parts.dialog.showModal();
    // The first field still to fill in, or the first, its text selected to type over.
    (fields.find(({ input }) => !input.value && !input.disabled) ?? fields[0])?.input.select();
  });
}

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
export async function askText({
  label, value, placeholder, validate, maxLength, multiline, rows, hint, waiting, ...dialog
}) {
  const answer = await askFields({ ...dialog, fields: [{ name: 'input', label, value, placeholder, validate, maxLength, multiline, rows, hint, waiting }] });
  return answer?.input ?? null;
}
