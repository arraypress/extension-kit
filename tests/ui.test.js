/**
 * The page components' pure parts (where a menu goes, whether a text can be
 * used) and what runs in jsdom: the ⋮ button. The menu, the dialog and the
 * toast need a real `<dialog>` and popovers, so they're tested in Chromium
 * (ui-chromium.test.js).
 *
 * @module tests/ui
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { MENU_EDGE, checkText, isInside, menuPosition, moreActionsButton } from '../src/index.js';

const viewport = { width: 800, height: 600 };
const size = { width: 160, height: 120 };
/** A 32px ⋮ button with its top-left at (x, y). @param {number} x @param {number} y */
const button = (x, y) => ({ left: x, top: y, right: x + 32, bottom: y + 32 });

describe('menuPosition', () => {
  it('over its button, as Chrome’s: top at the button’s top, end at the button’s end', () => {
    assert.deepEqual(menuPosition(size, viewport, { anchor: button(500, 100) }), { left: 532 - 160, top: 100 });
  });

  it('moved up to end at the button’s bottom when it would leave the window below', () => {
    assert.deepEqual(menuPosition(size, viewport, { anchor: button(500, 520) }), { left: 372, top: 552 - 120 });
  });

  it('moved in from the left edge, and never above the top edge', () => {
    assert.deepEqual(menuPosition(size, { width: 800, height: 100 }, { anchor: button(10, 30) }), { left: MENU_EDGE, top: MENU_EDGE });
  });

  it('below its button (placement "below"), or above it when there’s no room', () => {
    assert.deepEqual(menuPosition(size, viewport, { anchor: button(500, 100), placement: 'below' }), { left: 372, top: 136 });
    assert.deepEqual(menuPosition(size, viewport, { anchor: button(500, 500), placement: 'below' }), { left: 372, top: 500 - 120 - 4 });
  });

  it('at a point (a right-click): its top-left there, flipped up and kept in at the edges', () => {
    assert.deepEqual(menuPosition(size, viewport, { x: 200, y: 150 }), { left: 200, top: 150 });
    assert.deepEqual(menuPosition(size, viewport, { x: 790, y: 590 }), { left: 800 - 160 - MENU_EDGE, top: 590 - 120 });
  });

  it('on a right-to-left page: its start at the button’s left edge, and leftwards from a point', () => {
    assert.deepEqual(menuPosition(size, viewport, { anchor: button(500, 100), rtl: true }), { left: 500, top: 100 });
    assert.deepEqual(menuPosition(size, viewport, { x: 400, y: 150, rtl: true }), { left: 240, top: 150 });
    assert.deepEqual(menuPosition(size, viewport, { x: 50, y: 150, rtl: true }), { left: MENU_EDGE, top: 150 });
  });

  it('isInside counts the edges as inside', () => {
    const box = { left: 10, top: 10, right: 20, bottom: 20 };
    assert.ok(isInside(box, 10, 20));
    assert.ok(!isInside(box, 9, 15));
    assert.ok(!isInside(box, 15, 21));
  });
});

describe('checkText', () => {
  it('blank text can’t be used, and has nothing to say', () => {
    assert.deepEqual(checkText('   '), { ok: false, reason: '' });
  });

  it('a non-blank text is fine by default, or as the validator says', () => {
    const site = (/** @type {string} */ text) => (text.includes('.') ? null : 'Enter a site, like example.com');
    assert.deepEqual(checkText('Research'), { ok: true, reason: '' });
    assert.deepEqual(checkText('news', site), { ok: false, reason: 'Enter a site, like example.com' });
    assert.deepEqual(checkText('news.example', site), { ok: true, reason: '' });
  });
});

describe('moreActionsButton', () => {
  it('is Chrome’s ⋮ icon button, labelled “More actions for …”, opening its menu', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    /** @type {HTMLButtonElement[]} */
    const clicked = [];
    const more = moreActionsButton('Research', { doc, onClick: (target) => clicked.push(target) });
    assert.equal(more.outerHTML,
      '<button type="button" class="icon-button" aria-label="More actions for “Research”" aria-haspopup="menu"><span class="icon icon-more-vert" aria-hidden="true"></span></button>');
    more.click();
    assert.deepEqual(clicked, [more]);
  });

  it('takes a translated label, more classes, a tooltip, and can stay out of the tab order', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const more = moreActionsButton('Research', { doc, label: 'Weitere Aktionen für Research', className: 'row-menu', tooltip: true, focusable: false });
    assert.equal(more.className, 'icon-button row-menu');
    assert.equal(more.getAttribute('aria-label'), 'Weitere Aktionen für Research');
    assert.equal(more.title, 'Weitere Aktionen für Research');
    assert.equal(more.tabIndex, -1);
  });
});
