/**
 * The ⋮ menu and the one-field dialog in Playwright's Chromium: they're built
 * on a modal `<dialog>`, its backdrop, the top layer and real focus, none of
 * which jsdom has. The kit's own modules and stylesheet are served to a page
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
import { serve } from '../src/testing/index.js';

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
});
