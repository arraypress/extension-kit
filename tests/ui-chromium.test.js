/**
 * The ⋮ menu, the one-field dialog and the toast in Playwright's Chromium:
 * they're built on a modal `<dialog>`, its backdrop, popovers, the top layer,
 * shadow roots and real focus, none of which jsdom has. The kit's own modules and stylesheet are served to a page
 * and driven with real keys and clicks.
 *
 * @module tests/ui-chromium
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { serve, until } from '../src/testing/index.js';
import { SITE_LIST_MESSAGES, SITE_LIST_WORDS, TOAST_MS } from '../src/index.js';

/** @import { Browser, Page } from 'playwright' */
/** @import { ActionMenu } from '../src/index.js' */
/** @import { TestServer } from '../src/testing/index.js' */

/**
 * What the test page puts on `window`.
 *
 * @typedef {object} PageGlobals
 * @property {typeof import('../src/index.js')} kit The kit's browser half.
 * @property {ActionMenu} menu The page's menu.
 * @property {string[]} ran The items run, in order.
 * @property {string | null} answer What `askText` resolved to; 'pending' until then.
 */

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** A page with a row and its ⋮ button near the top right, and a button at the bottom right. */
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/styles/chrome-ui.css">
<style>#far { position: fixed; right: 4px; bottom: 4px; }</style>
</head><body>
<main class="page"><ul class="list"><li class="row" id="row" tabindex="-1"><span class="label">Research</span></li></ul></main>
<button id="far" type="button">Far</button>
<script type="module">
  import * as kit from '/src/index.js';
  window.kit = kit;
  window.ran = [];
  window.menu = kit.createMenu({ id: 'menu' });
  const items = [
    { label: 'Open', run: () => ran.push('Open') },
    { label: 'Rename', run: () => ran.push('Rename') },
    { label: 'Move up', run: () => ran.push('Move up'), disabled: true },
    'separator',
    { label: 'Delete', run: () => ran.push('Delete') },
  ];
  const more = kit.moreActionsButton('Research', { onClick: (button) => menu.open(items, { anchor: button }) });
  document.getElementById('row').append(more);
  document.getElementById('far').addEventListener('click', (event) => menu.open(items, { anchor: event.currentTarget }));
  window.ready = true;
</script>
</body></html>`;

/** @type {TestServer} */
let site;
/** @type {Browser} */
let browser;

before(async () => {
  site = await serve(async (pathname) => {
    if (pathname === '/') return PAGE;
    const file = path.join(SRC, path.normalize(pathname.replace(/^\/src\//, '')));
    if (!file.startsWith(SRC)) return undefined;
    const body = await readFile(file).catch(() => undefined);
    if (!body) return undefined;
    return { body, type: file.endsWith('.css') ? 'text/css' : 'text/javascript' };
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * A fresh page with the kit loaded.
 *
 * @returns {Promise<Page>} The page, 800 × 600.
 */
async function open() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (error) => { throw error; });
  await page.goto(`${site.origin}/`);
  await page.waitForFunction(() => 'ready' in window);
  return page;
}

/**
 * What has the focus: its text or label.
 *
 * @param {Page} page - The page.
 * @returns {Promise<string>} The focused element's `aria-label`, else its text.
 */
const focused = (page) => page.evaluate(() => {
  const active = document.activeElement;
  return active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? '';
});

/**
 * A fresh page with the row's ⋮ menu open.
 *
 * @returns {Promise<{page: Page, more: import('playwright').Locator}>} The page and the ⋮ button.
 */
async function withMenuOpen() {
  const page = await open();
  const more = page.getByRole('button', { name: /^More actions for/ });
  await more.click();
  return { page, more };
}

describe('menu (Chromium)', () => {
  it('opens over its ⋮ button, as Chrome’s does, with the first item focused', async () => {
    const page = await open();
    const more = page.getByRole('button', { name: 'More actions for “Research”' });
    await more.click();
    const menu = page.getByRole('menu');
    await menu.waitFor();
    const [button, box] = [await more.boundingBox(), await menu.boundingBox()];
    assert.ok(button && box);
    assert.equal(Math.round(box.y), Math.round(button.y), 'top at the button’s top');
    assert.equal(Math.round(box.x + box.width), Math.round(button.x + button.width), 'end at the button’s end');
    assert.equal(await focused(page), 'Open');
    assert.equal(await more.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(), ['Open', 'Rename', 'Move up', 'Delete']);
    await page.close();
  });

  it('moves with ↑/↓ (wrapping, past disabled items), Home and End', async () => {
    const { page } = await withMenuOpen();
    const steps = [];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'ArrowUp']) {
      await page.keyboard.press(key);
      steps.push(await focused(page));
    }
    assert.deepEqual(steps, ['Rename', 'Delete', 'Open', 'Delete', 'Delete', 'Open', 'Delete']);
    await page.close();
  });

  for (const key of ['Escape', 'Tab']) {
    it(`${key === 'Tab' ? 'Tab' : 'Esc'} closes it and gives the focus back to its button`, async () => {
      const { page, more } = await withMenuOpen();
      await page.keyboard.press(key);
      assert.equal(await page.getByRole('menu').isVisible(), false);
      assert.equal(await focused(page), 'More actions for “Research”');
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
      await page.close();
    });
  }

  it('a click outside closes it and does nothing else; a click on an item runs it once closed', async () => {
    const { page, more } = await withMenuOpen();
    await page.mouse.click(20, 580);
    assert.equal(await page.getByRole('menu').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).ran), []);
    await more.click();
    const box = await page.getByRole('menu').boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + 2, box.y + 2); // The menu's own padding: still open.
    assert.equal(await page.getByRole('menu').isVisible(), true);
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    assert.equal(await page.getByRole('menu').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).ran), ['Rename']);
    assert.equal(await focused(page), 'More actions for “Research”');
    await page.close();
  });

  it('closes when the window loses focus', async () => {
    const { page } = await withMenuOpen();
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    assert.equal(await page.getByRole('menu').isVisible(), false);
    await page.close();
  });

  it('stays on screen from a button in the bottom-right corner', async () => {
    const page = await open();
    await page.getByRole('button', { name: 'Far' }).click();
    const box = await page.getByRole('menu').boundingBox();
    assert.ok(box);
    assert.ok(box.x >= 8 && box.x + box.width <= 800 - 8, `inside horizontally: ${box.x}–${box.x + box.width}`);
    assert.ok(box.y >= 8 && box.y + box.height <= 600, `inside vertically: ${box.y}–${box.y + box.height}`);
    await page.close();
  });

  it('opens at a point (a right-click), named, and gives the focus to focusTo when it closes', async () => {
    const page = await open();
    await page.evaluate(() => {
      const row = /** @type {HTMLElement} */ (document.getElementById('row'));
      /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).menu.open([{ label: 'Open', run: () => {} }], { x: 300, y: 200, label: 'Actions for Research', focusTo: row });
    });
    const menuBox = await page.getByRole('menu', { name: 'Actions for Research' }).boundingBox();
    assert.deepEqual(menuBox && [Math.round(menuBox.x), Math.round(menuBox.y)], [300, 200]);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'row');
    await page.close();
  });
});

describe('text dialog (Chromium)', () => {
  /**
   * Open the dialog from the row's button and keep its answer on `window.answer`.
   *
   * @param {Page} page - The page.
   * @param {boolean} [validate] - Ask for a site (with a dot).
   * @param {boolean} [toRow] - Give the focus to the row afterwards (`returnTo`, asked at the end).
   */
  const ask = (page, validate = false, toRow = false) => page.evaluate(({ validate, toRow }) => {
    document.getElementById('far')?.focus();
    /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer = 'pending';
    /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).kit.askText({
      returnTo: toRow ? () => document.getElementById('row') : undefined,
      title: validate ? 'Add site' : 'Rename workspace', label: validate ? 'Site' : 'Name', value: validate ? '' : 'Research',
      action: validate ? 'Add' : 'Save', maxLength: 60,
      validate: validate ? (/** @type {string} */ text) => (text.includes('.') ? null : 'Enter a site, like example.com') : undefined,
    }).then((text) => { /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer = text; });
  }, { validate, toRow });

  const answer = (/** @type {Page} */ page) => page.waitForFunction(() => /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer !== 'pending').then(() => page.evaluate(() => /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer));

  it('is Chrome’s dialog: title, label, the text selected; Enter saves it trimmed and the focus goes back', async () => {
    const page = await open();
    await ask(page);
    const dialog = page.getByRole('dialog', { name: 'Rename workspace' });
    await dialog.waitFor();
    const field = dialog.getByRole('textbox', { name: 'Name' });
    assert.equal(await field.inputValue(), 'Research');
    assert.equal(await field.getAttribute('maxlength'), '60');
    assert.equal(await page.evaluate(() => /** @type {HTMLInputElement} */ (document.activeElement).selectionEnd), 'Research'.length);
    await page.keyboard.type('  Reading  ');
    await page.keyboard.press('Enter');
    assert.equal(await answer(page), 'Reading');
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await focused(page), 'Far');
    await page.close();
  });

  it('Save stays off while blank or invalid, with the reason under the field; Enter does nothing then', async () => {
    const page = await open();
    await ask(page, true);
    const dialog = page.getByRole('dialog', { name: 'Add site' });
    const add = dialog.getByRole('button', { name: 'Add' });
    assert.equal(await add.isDisabled(), true);
    assert.equal(await page.locator('#text-dialog-error').isVisible(), false, 'nothing to say while blank');
    await page.keyboard.type('news');
    assert.equal(await add.isDisabled(), true);
    assert.equal(await page.locator('#text-dialog-error').isVisible(), true);
    assert.equal(await page.locator('#text-dialog-error').innerText(), 'Enter a site, like example.com');
    await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.type('.example');
    assert.equal(await page.locator('#text-dialog-error').isVisible(), false);
    await add.click();
    assert.equal(await answer(page), 'news.example');
    await page.close();
  });

  it('Esc and Cancel cancel (null), the focus goes where returnTo says, and the next ask starts clean', async () => {
    const page = await open();
    await ask(page, true, true);
    await page.keyboard.type('news');
    await page.keyboard.press('Escape');
    assert.equal(await answer(page), null);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'row');
    await ask(page);
    const dialog = page.getByRole('dialog', { name: 'Rename workspace' });
    assert.equal(await page.locator('#text-dialog-error').isVisible(), false);
    assert.equal(await dialog.getByRole('button', { name: 'Save' }).isDisabled(), false);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await answer(page), null);
    assert.equal(await page.locator('dialog#text-dialog').count(), 1, 'one dialog, made once');
    await page.close();
  });

  it('with several fields: each its own reason, Add only once all are fine, the answer by name', async () => {
    const page = await open();
    await page.evaluate(() => {
      /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer = 'pending';
      /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).kit.askFields({
        title: 'Add folder rule', action: 'Add',
        fields: [
          { name: 'from', label: 'Downloads from', value: 'stripe.com' },
          { name: 'folder', label: 'Folder', placeholder: 'Receipts', validate: (text) => (text.includes('..') ? 'Choose a folder inside Downloads' : null) },
        ],
      }).then((answer) => { /** @type {PageGlobals} */ (/** @type {unknown} */ (window)).answer = JSON.stringify(answer); });
    });
    const dialog = page.getByRole('dialog', { name: 'Add folder rule' });
    const add = dialog.getByRole('button', { name: 'Add' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'text-dialog-folder', 'the first empty field');
    assert.equal(await dialog.getByRole('textbox', { name: 'Folder' }).getAttribute('placeholder'), 'Receipts');
    assert.equal(await add.isDisabled(), true, 'Folder is still blank');
    await page.keyboard.type('../Receipts');
    assert.equal(await page.locator('#text-dialog-folder-error').innerText(), 'Choose a folder inside Downloads');
    assert.equal(await page.locator('#text-dialog-from-error').isVisible(), false);
    await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true, 'Enter does nothing while a field is wrong');
    await dialog.getByRole('textbox', { name: 'Folder' }).fill(' Receipts ');
    await page.keyboard.press('Enter');
    assert.deepEqual(JSON.parse(String(await answer(page))), { from: 'stripe.com', folder: 'Receipts' });
    // The next one-field ask has only its own field, under the one-field ids.
    await ask(page);
    assert.equal(await page.locator('#text-dialog input').count(), 1);
    assert.equal(await page.locator('#text-dialog-input').inputValue(), 'Research');
    await page.keyboard.press('Escape');
    assert.equal(await answer(page), null);
    await page.close();
  });

  it('a multi-line field waits, disabled, for a value still being worked out, then takes it, its hint kept up as it’s typed', async () => {
    const page = await open();
    await page.evaluate(() => {
      const globals = /** @type {PageGlobals & {fill: (text: string) => void}} */ (/** @type {unknown} */ (window));
      globals.answer = 'pending';
      const words = new Promise((resolve) => { globals.fill = resolve; });
      globals.kit.askFields({
        title: 'Add topic', action: 'Add',
        fields: [
          { name: 'name', label: 'Topic', value: 'Football' },
          {
            name: 'words', label: 'Words', multiline: true, rows: 4, value: /** @type {Promise<string>} */ (words), waiting: 'Finding words…',
            hint: (text) => `${text.split('\n').filter(Boolean).length} words`,
          },
        ],
      }).then((answer) => { globals.answer = JSON.stringify(answer); });
    });
    const dialog = page.getByRole('dialog', { name: 'Add topic' });
    const words = dialog.getByRole('textbox', { name: 'Words' });
    const add = dialog.getByRole('button', { name: 'Add' });
    assert.equal(await words.evaluate((element) => element.localName), 'textarea');
    assert.equal(await words.getAttribute('rows'), '4');
    assert.equal(await words.isDisabled(), true);
    assert.equal(await add.isDisabled(), true, 'nothing to add until the words come');
    assert.equal(await page.locator('#text-dialog-words-hint').innerText(), 'Finding words…');
    await page.evaluate(() => /** @type {{fill: (text: string) => void}} */ (/** @type {unknown} */ (window)).fill('football\npremier league'));
    await until(() => words.isEnabled(), 'the words');
    assert.equal(await words.inputValue(), 'football\npremier league');
    assert.equal(await page.locator('#text-dialog-words-hint').innerText(), '2 words');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'text-dialog-words', 'the focus moves in');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true, 'Enter is a new line in a multi-line field');
    await page.keyboard.type('fa cup');
    assert.equal(await page.locator('#text-dialog-words-hint').innerText(), '3 words');
    await add.click();
    assert.deepEqual(JSON.parse(String(await answer(page))), { name: 'Football', words: 'football\npremier league\nfa cup' });
    await page.close();
  });

  it('a value that fails leaves the field empty to type into', async () => {
    const page = await open();
    await page.evaluate(() => {
      const globals = /** @type {PageGlobals} */ (/** @type {unknown} */ (window));
      globals.answer = 'pending';
      globals.kit.askText({ title: 'Words', label: 'Words', multiline: true, value: Promise.reject(new Error('no model')), hint: 'One per line' })
        .then((text) => { globals.answer = text; });
    });
    const words = page.getByRole('textbox', { name: 'Words' });
    await until(() => words.isEnabled(), 'the field');
    assert.equal(await words.inputValue(), '');
    assert.equal(await page.locator('#text-dialog-hint').innerText(), 'One per line');
    await page.keyboard.type('spoiler');
    await page.getByRole('button', { name: 'Save' }).click();
    assert.equal(await answer(page), 'spoiler');
    await page.close();
  });
});

/**
 * A fresh page with a content script's controls, their menu open from its ⋮ button: a host with
 * an open shadow root holding the kit's stylesheet and a ⋮ button, a menu and a toast made in that
 * root (`root`), and a page element stacked as high as a page can stack, over the bottom-left
 * corner where the toast shows.
 *
 * @returns {Promise<Page>} The page.
 */
async function withShadowMenuOpen() {
  const page = await open();
  await page.evaluate(addShadowControls);
  await page.locator('controls-host').getByRole('button', { name: 'More actions for “Table”' }).click();
  return page;
}

/** Runs in the page: see {@link withShadowMenuOpen}. */
async function addShadowControls() {
  const { kit } = /** @type {PageGlobals} */ (/** @type {unknown} */ (window));
  const bar = document.createElement('div');
  bar.id = 'page-bar';
  bar.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 100vw; height: 200px; z-index: 2147483647; background: red;';
  const host = document.createElement('controls-host');
  document.body.append(bar, host);
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(await (await fetch('/src/styles/chrome-ui.css')).text());
  root.adoptedStyleSheets = [sheet];
  const menu = kit.createMenu({ root });
  const toast = kit.createToast({ root });
  const more = kit.moreActionsButton('Table');
  more.style.cssText = 'position: fixed; left: 300px; top: 100px;';
  more.addEventListener('click', () => menu.open([
    { label: 'Copy table', run: () => toast.show('Table copied') },
    { label: 'Search', run: () => {} },
  ], { anchor: more }));
  root.append(more);
  Object.assign(window, { shadowMenu: menu, shadowToast: toast });
}

describe('in a shadow root (Chromium)', () => {
  it('the menu goes in the root, moves with the arrow keys and gives the focus back to its button there', async () => {
    const page = await withShadowMenuOpen();
    assert.equal(await page.evaluate(() => /** @type {HTMLDialogElement | null | undefined} */ (document.querySelector('controls-host')?.shadowRoot?.querySelector('dialog.menu'))?.open), true, 'open, in the root');
    assert.equal(await page.evaluate(() => document.querySelectorAll('dialog.menu').length), 1, 'the page’s own menu, and no other');
    const inner = () => page.evaluate(() => document.querySelector('controls-host')?.shadowRoot?.activeElement?.textContent?.trim()
      || document.querySelector('controls-host')?.shadowRoot?.activeElement?.getAttribute('aria-label'));
    assert.equal(await inner(), 'Copy table');
    await page.keyboard.press('ArrowDown');
    assert.equal(await inner(), 'Search');
    await page.keyboard.press('Escape');
    assert.equal(await inner(), 'More actions for “Table”');
    await page.close();
  });

  it('the toast shows in the top layer, over anything the page stacks, from a menu item', async () => {
    const page = await withShadowMenuOpen();
    await page.locator('controls-host').getByRole('menuitem', { name: 'Copy table' }).click();
    const toast = page.locator('controls-host #toast');
    assert.equal(await toast.evaluate((element) => element.matches(':popover-open')), true);
    assert.equal(await toast.innerText(), 'Table copied');
    const box = await toast.boundingBox();
    assert.ok(box);
    assert.equal(Math.round(box.x), 24, 'bottom left, 24px in');
    assert.equal(Math.round(600 - box.y - box.height), 24);
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element === document.querySelector('controls-host') ? 'the controls' : element?.id;
    }, { x: box.x + 10, y: box.y + 10 });
    assert.equal(hit, 'the controls', 'over the page’s own z-index: 2147483647 bar');
    await page.close();
  });
});

describe('toast (Chromium)', () => {
  /**
   * A fresh page with the toast made, on a fake clock.
   *
   * @param {{undoLabel?: string, duration?: number, undoDuration?: number}} [options] - The toast's options (no `doc` or `root`).
   * @returns {Promise<Page>} The page; `window.toast` is the toast, `window.undone` counts Undo runs.
   */
  const withToast = async (options = {}) => {
    const page = await open();
    // Paused, so time moves only when a test moves it.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.evaluate((given) => {
      const { kit } = /** @type {PageGlobals} */ (/** @type {unknown} */ (window));
      Object.assign(window, { toast: kit.createToast(given), undone: 0 });
    }, options);
    return page;
  };
  /** @param {Page} page */
  const showing = (page) => page.locator('#toast').evaluate((element) => element.matches(':popover-open'));
  /** @param {Page} page @param {string} text @param {boolean} [undo] */
  const show = (page, text, undo = false) => page.evaluate(({ text, undo }) => {
    const win = /** @type {any} */ (window);
    win.toast.show(text, undo ? () => { win.undone++; } : null);
  }, { text, undo });

  it('is a polite live region from the start, a closed manual popover until shown', async () => {
    const page = await withToast();
    assert.equal(await page.locator('#toast').evaluate((element) => element.outerHTML),
      '<div id="toast" class="toast" role="status" aria-live="polite" popover="manual"><span id="toast-text"></span><button id="toast-undo" type="button" hidden="">Undo</button></div>');
    assert.equal(await page.evaluate(() => document.body.lastElementChild?.id), 'toast');
    assert.equal(await page.locator('#toast').isVisible(), false);
    await page.close();
  });

  it('a page’s own toast markup, shown and hidden with `hidden`, still shows bottom left', async () => {
    const page = await open();
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="own" hidden>Imported</div>'));
    assert.equal(await page.locator('#own').isVisible(), false);
    await page.locator('#own').evaluate((element) => { /** @type {HTMLElement} */ (element).hidden = false; });
    const box = await page.locator('#own').boundingBox();
    assert.ok(box);
    assert.deepEqual([Math.round(box.x), Math.round(600 - box.y - box.height)], [24, 24]);
    await page.close();
  });

  it('shows the message with Undo; Undo hides it and runs once', async () => {
    const page = await withToast();
    await show(page, 'Deleted “Research”', true);
    assert.equal(await page.locator('#toast-text').innerText(), 'Deleted “Research”');
    assert.equal(await showing(page), true);
    await page.locator('#toast-undo').click();
    assert.equal(await showing(page), false);
    await page.locator('#toast-undo').evaluate((button) => /** @type {HTMLButtonElement} */ (button).click());
    assert.equal(await page.evaluate(() => /** @type {any} */ (window).undone), 1);
    await page.close();
  });

  it('goes after chrome://bookmarks’s ten seconds; a new message restarts the wait and drops the old Undo', async () => {
    const page = await withToast();
    await show(page, 'Deleted “Research”', true);
    await page.clock.runFor(TOAST_MS - 1000);
    await show(page, 'Copied');
    assert.equal(await page.locator('#toast-undo').isVisible(), false);
    await page.clock.runFor(TOAST_MS - 1);
    assert.equal(await showing(page), true);
    await page.clock.runFor(1);
    assert.equal(await showing(page), false);
    await page.locator('#toast-undo').evaluate((button) => /** @type {HTMLButtonElement} */ (button).click());
    assert.equal(await page.evaluate(() => /** @type {any} */ (window).undone), 0);
    await page.close();
  });

  it('takes its own Undo text and times, with and without Undo; hide() takes it down at once', async () => {
    const page = await withToast({ undoLabel: 'Rückgängig', duration: 4000, undoDuration: 8000 });
    assert.equal(await page.locator('#toast-undo').textContent(), 'Rückgängig');
    await show(page, 'Gespeichert');
    await page.clock.runFor(4000);
    assert.equal(await showing(page), false);
    await show(page, 'Gelöscht', true);
    await page.clock.runFor(4000);
    assert.equal(await showing(page), true);
    await page.clock.runFor(4000);
    assert.equal(await showing(page), false);
    await show(page, 'Gespeichert');
    await page.evaluate(() => /** @type {any} */ (window).toast.hide());
    assert.equal(await showing(page), false);
    await page.close();
  });
});

describe('site list with an Add button (Chromium)', () => {
  /**
   * A fresh page with a Memory Saver–style site list: an Add button, the dialog, ⋮ menus.
   *
   * @param {Record<string, string>} [messages] - The page's messages (`$1` for the site), for
   *   `t`; without them, the kit's English.
   * @returns {Promise<Page>} The page; `window.sites` is the list as stored.
   */
  const withSiteList = async (messages) => {
    const page = await open();
    await page.evaluate((messages) => {
      const { kit } = /** @type {PageGlobals} */ (/** @type {unknown} */ (window));
      const t = messages && ((/** @type {string} */ key, /** @type {string | string[]} */ subs = '') => messages[key]?.replace('$1', [subs].flat()[0] ?? '') ?? key);
      document.body.insertAdjacentHTML('beforeend', '<ul class="list" id="sites"></ul><p id="none">No sites added</p><button id="add-site" type="button">Add</button>');
      const win = /** @type {any} */ (window);
      win.sites = ['github.com'];
      const list = kit.createSiteList({
        list: /** @type {HTMLElement} */ (document.getElementById('sites')),
        empty: /** @type {HTMLElement} */ (document.getElementById('none')),
        addButton: /** @type {HTMLElement} */ (document.getElementById('add-site')),
        parse: kit.siteHost,
        add: (site) => list.render(win.sites = kit.withSite(win.sites, site)),
        remove: (site) => list.render(win.sites = kit.withoutSite(win.sites, site)),
        replace: (site, edited) => list.render(win.sites = kit.withSiteReplaced(win.sites, site, edited)),
        t,
      });
      list.render(win.sites);
    }, messages);
    return page;
  };
  /** @param {Page} page */
  const stored = (page) => page.evaluate(() => /** @type {any} */ (window).sites);

  it('Add asks in the dialog, refusing what isn’t a site, and adds it as kept', async () => {
    const page = await withSiteList();
    assert.equal(await page.locator('#none').isVisible(), false);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add site' });
    await page.keyboard.type('not a site');
    assert.equal(await page.locator('#text-dialog-error').innerText(), 'Enter a site, like example.com');
    assert.equal(await dialog.getByRole('button', { name: 'Add' }).isDisabled(), true);
    await dialog.getByRole('textbox', { name: 'Site' }).fill('https://www.Example.com/shop');
    await page.keyboard.press('Enter');
    await until(async () => (await stored(page)).length === 2, 'the site added');
    assert.deepEqual(await stored(page), ['github.com', 'example.com']);
    assert.deepEqual(await page.locator('#sites .label').allInnerTexts(), ['github.com', 'example.com']);
    await page.close();
  });

  it('each row’s ⋮ menu edits its site in the dialog, or removes it', async () => {
    const page = await withSiteList();
    await page.getByRole('button', { name: 'More actions for “github.com”' }).click();
    assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(), ['Edit', 'Remove']);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const field = page.getByRole('dialog', { name: 'Edit site' }).getByRole('textbox', { name: 'Site' });
    assert.equal(await field.inputValue(), 'github.com');
    await field.fill('docs.github.com');
    await page.getByRole('button', { name: 'Save' }).click();
    await until(async () => (await stored(page))[0] === 'docs.github.com', 'the site edited');
    await page.getByRole('button', { name: 'More actions for “docs.github.com”' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    assert.deepEqual(await stored(page), []);
    assert.equal(await page.locator('#none').isVisible(), true);
    await page.close();
  });

  it('given the page’s t, its words are the page’s messages under the standard keys', async () => {
    /** @type {Record<string, string>} */
    const german = {
      optionsAdd: 'Hinzufügen', optionsAddSite: 'Website hinzufügen', optionsEditSite: 'Website bearbeiten',
      optionsEdit: 'Bearbeiten', optionsRemove: 'Entfernen', optionsSave: 'Speichern', optionsCancel: 'Abbrechen',
      optionsSiteLabel: 'Website', optionsSiteInvalid: 'Gib eine Website ein, z. B. example.com',
      optionsMoreActions: 'Weitere Aktionen für $1',
    };
    const page = await withSiteList(german);
    await page.getByRole('button', { name: 'Weitere Aktionen für github.com' }).click();
    assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(), ['Bearbeiten', 'Entfernen']);
    await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
    const dialog = page.getByRole('dialog', { name: 'Website bearbeiten' });
    await dialog.getByRole('textbox', { name: 'Website' }).fill('not a site');
    assert.equal(await page.locator('#text-dialog-error').innerText(), 'Gib eine Website ein, z. B. example.com');
    assert.deepEqual(await dialog.getByRole('button').allInnerTexts(), ['Abbrechen', 'Speichern']);
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    assert.equal(await page.getByRole('dialog', { name: 'Website hinzufügen' }).getByRole('button', { name: 'Hinzufügen' }).count(), 1);
    await page.close();
  });

  it('the standard keys name every word', () => {
    assert.deepEqual(Object.keys(SITE_LIST_MESSAGES).sort(), Object.keys(SITE_LIST_WORDS).sort());
  });
});
