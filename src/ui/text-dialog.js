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

import { focusedElement } from '../dom/focus.js';

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
export function checkText(text, validate = () => null) {
  if (!text.trim()) return { ok: false, reason: '' };
  const reason = validate(text);
  return { ok: reason === null, reason: reason ?? '' };
}

/**
 * The dialog's parts.
 *
 * @typedef {object} Parts
 * @property {HTMLDialogElement} dialog The `<dialog>`.
 * @property {HTMLFormElement} form Its form.
 * @property {HTMLElement} title The title.
 * @property {HTMLLabelElement} label The field's label.
 * @property {HTMLInputElement} input The field.
 * @property {HTMLElement} error The reason under the field.
 * @property {HTMLButtonElement} cancel The cancel button.
 * @property {HTMLButtonElement} confirm The action button.
 */

/** Each page's dialog, made on first use. @type {WeakMap<Document, Parts>} */
const made = new WeakMap();

/**
 * The page's dialog, made the first time.
 *
 * @param {Document} doc - The page.
 * @returns {Parts} Its parts.
 */
function partsFor(doc) {
  const existing = made.get(doc);
  if (existing) return existing;
  /**
   * @template {keyof HTMLElementTagNameMap} K
   * @param {K} tag
   * @param {Record<string, string>} [attributes]
   * @returns {HTMLElementTagNameMap[K]}
   */
  const el = (tag, attributes = {}) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  const dialog = el('dialog', { id: 'text-dialog', class: 'dialog', 'aria-labelledby': 'text-dialog-title' });
  const form = el('form', { novalidate: '' });
  const title = el('h2', { id: 'text-dialog-title', class: 'dialog-title' });
  const body = el('div', { class: 'dialog-body' });
  const field = el('div', { class: 'field' });
  const label = el('label', { id: 'text-dialog-label', for: 'text-dialog-input' });
  const input = el('input', { id: 'text-dialog-input', type: 'text', autocomplete: 'off', 'aria-describedby': 'text-dialog-error' });
  const error = el('span', { id: 'text-dialog-error', class: 'hint error' });
  error.hidden = true;
  const buttons = el('div', { class: 'dialog-buttons' });
  const cancel = el('button', { type: 'button', class: 'cancel' });
  const confirm = el('button', { id: 'text-dialog-confirm', type: 'submit', class: 'action' });
  field.append(label, input, error);
  body.append(field);
  buttons.append(cancel, confirm);
  form.append(title, body, buttons);
  dialog.append(form);
  doc.body.append(dialog);
  const parts = { dialog, form, title, label, input, error, cancel, confirm };
  made.set(doc, parts);
  return parts;
}

/** The open dialog's settle function, per page. @type {WeakMap<Document, (text: string | null) => void>} */
const pending = new WeakMap();

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
export function askText({
  title, label, value = '', action = 'Save', cancel = 'Cancel', validate, maxLength, returnTo, doc = document,
}) {
  const parts = partsFor(doc);
  pending.get(doc)?.(null);
  const active = focusedElement(doc);
  const back = returnTo === undefined ? (active instanceof /** @type {Window & typeof globalThis} */ (doc.defaultView).HTMLElement ? active : null) : returnTo;

  parts.title.textContent = title;
  parts.label.textContent = label;
  parts.confirm.textContent = action;
  parts.cancel.textContent = cancel;
  parts.input.value = value;
  if (maxLength === undefined) parts.input.removeAttribute('maxlength');
  else parts.input.maxLength = maxLength;

  const refresh = () => {
    const { ok, reason } = checkText(parts.input.value, validate);
    parts.error.textContent = reason;
    parts.error.hidden = !reason;
    parts.confirm.disabled = !ok;
  };
  refresh();

  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    /** @param {string | null} text */
    const settle = (text) => {
      controller.abort();
      pending.delete(doc);
      if (parts.dialog.open) parts.dialog.close();
      resolve(text);
      // After whatever the answer re-renders, unless another dialog opened meanwhile.
      queueMicrotask(() => {
        if (doc.querySelector('dialog[open]')) return;
        const target = typeof back === 'function' ? back() : back;
        if (target?.isConnected) target.focus();
      });
    };
    pending.set(doc, settle);
    parts.input.addEventListener('input', refresh, { signal });
    // Enter submits through the action button (the form's only submit button), never while it's disabled.
    parts.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (checkText(parts.input.value, validate).ok) settle(parts.input.value.trim());
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

    parts.dialog.showModal();
    parts.input.select();
  });
}
