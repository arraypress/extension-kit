/**
 * Chrome's window drawn around a capture in a real page (Playwright's Chromium): the SVG from
 * `windowChromeSvg`, with its HTML inside, drawn on a canvas, leaves the canvas readable (an SVG
 * image with a `foreignObject` doesn't taint it in Chrome) and paints the theme's colours where
 * the tab strip, the active tab and the toolbar are.
 *
 * @module tests/frame-chromium
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { THEMES, WINDOW_BARS, letterIcon, windowChromeSvg } from '../src/index.js';

/** @import { Browser } from 'playwright' */

/** @type {Browser} */
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

/**
 * A colour as `r,g,b` from `#rrggbb`.
 *
 * @param {string} hex - The colour.
 * @returns {string} Its channels.
 */
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(',');

describe('windowChromeSvg (Chromium)', () => {
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    it(`draws on a canvas, readable afterwards, in the ${theme} theme’s colours, at twice the size`, async () => {
      const page = await browser.newPage();
      const svg = windowChromeSvg({ tabs: [{ title: 'Example & <co>', icon: letterIcon('E', '#1a73e8'), active: true }], url: 'example.com/a', theme, w: 900 });
      const pixels = await page.evaluate(async ({ svg, height, stripHeight }) => {
        const image = new Image();
        image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1800;
        canvas.height = height * 2;
        const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        context.drawImage(image, 0, 0, 1800, height * 2);
        /** @param {number} x @param {number} y */
        const at = (x, y) => [...context.getImageData(x * 2, y * 2, 1, 1).data].slice(0, 3).join(',');
        return { strip: at(600, 4), tab: at(200, 20), toolbar: at(890, stripHeight + 2), size: [image.width, image.height] };
      }, { svg, height: WINDOW_BARS.strip + WINDOW_BARS.toolbar, stripHeight: WINDOW_BARS.strip });
      assert.deepEqual(pixels.size, [900, WINDOW_BARS.strip + WINDOW_BARS.toolbar]);
      assert.equal(pixels.strip, rgb(THEMES[theme].frame));
      assert.equal(pixels.tab, rgb(THEMES[theme].activeTab));
      assert.equal(pixels.toolbar, rgb(THEMES[theme].toolbar));
      await page.close();
    });
  }

  it('is well-formed XML (an SVG image is parsed as XML)', async () => {
    const page = await browser.newPage();
    const svg = windowChromeSvg({ tabs: [{ title: 'A & B', icon: letterIcon('A', '#000'), active: true }, { title: 'Other', icon: letterIcon('O', '#f00') }], url: 'a.com', ext: [letterIcon('X', '#0a0')] });
    const error = await page.evaluate((svg) => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')?.textContent ?? null, svg);
    assert.equal(error, null);
    await page.close();
  });
});
