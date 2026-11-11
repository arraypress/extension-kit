/**
 * Windows drawn around a capture in a real page (Playwright's Chromium): the SVGs from
 * `windowChromeSvg` and `macWindowSvg`, with their HTML inside, drawn on a canvas, leave the
 * canvas readable (an SVG image with a `foreignObject` doesn't taint it in Chrome) and paint the
 * theme's colours where the tab strip, the active tab, the toolbar, the title bar and its
 * hairline are, and macOS's traffic lights where both put them.
 *
 * @module tests/frame-chromium
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MAC_TITLE_BAR, THEMES, WINDOW_BARS, letterIcon, macWindowSvg, windowChromeSvg } from '../src/index.js';

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

/** The traffic lights' colours, close to zoom. */
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'].map(rgb);

/**
 * Draw an SVG image on a canvas at twice its size in a page, and read pixels back.
 *
 * @param {Browser} on - The browser.
 * @param {string} svg - The SVG.
 * @param {[number, number][]} points - Where to read (the SVG's px).
 * @returns {Promise<{size: number[], pixels: string[], ink: number[]}>} The image's size, each point's `r,g,b`, and the first and last column (the SVG's px) right of the traffic lights with anything on the bar's colour (read at its top right).
 */
async function drawn(on, svg, points) {
  const page = await on.newPage();
  const result = await page.evaluate(async ({ svg, points }) => {
    const image = new Image();
    image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width * 2;
    canvas.height = image.height * 2;
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // getImageData throws on a tainted canvas.
    const all = context.getImageData(0, 0, canvas.width, canvas.height).data;
    /** @param {number} x @param {number} y */
    const at = (x, y) => [...all.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 3)].join(',');
    const bar = at(canvas.width - 8, 8);
    const columns = [];
    for (let x = 140; x < canvas.width; x++) for (let y = 8; y < canvas.height - 8; y++) if (at(x, y) !== bar) { columns.push(x / 2); break; }
    return { size: [image.width, image.height], pixels: points.map(([x, y]) => at(Math.floor(x * 2), Math.floor(y * 2))), ink: [columns[0] ?? -1, columns.at(-1) ?? -1] };
  }, { svg, points });
  await page.close();
  return result;
}

describe('windowChromeSvg (Chromium)', () => {
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    it(`draws on a canvas, readable afterwards, in the ${theme} theme’s colours, at twice the size`, async () => {
      const svg = windowChromeSvg({ tabs: [{ title: 'Example & <co>', icon: letterIcon('E', '#1a73e8'), active: true }], url: 'example.com/a', theme, w: 900 });
      const { size, pixels } = await drawn(browser, svg, [[600, 4], [200, 20], [890, WINDOW_BARS.strip + 2], [22, 21], [42, 21], [62, 21]]);
      assert.deepEqual(size, [900, WINDOW_BARS.strip + WINDOW_BARS.toolbar]);
      assert.deepEqual(pixels, [rgb(THEMES[theme].frame), rgb(THEMES[theme].activeTab), rgb(THEMES[theme].toolbar), ...LIGHTS]);
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

describe('macWindowSvg (Chromium)', () => {
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    it(`a plain macOS title bar on a canvas, readable afterwards: the ${theme} theme, the traffic lights, the title centred`, async () => {
      const svg = macWindowSvg({ title: 'Lake District trips', theme, w: 600 });
      const { size, pixels, ink } = await drawn(browser, svg, [[14, 14], [34, 14], [54, 14], [500, 4], [500, MAC_TITLE_BAR - 0.5], [80, 14]]);
      assert.deepEqual(size, [600, MAC_TITLE_BAR]);
      assert.deepEqual(pixels.slice(0, 3), LIGHTS);
      assert.equal(pixels[3], rgb(THEMES[theme].titleBar));
      const grey = pixels[3].split(',').map(Number).reduce((sum, value) => sum + value, 0) / 3;
      assert.ok(theme === 'dark' ? grey < 80 : grey > 200, `a ${theme} bar: ${pixels[3]}`);
      assert.equal(pixels[4], rgb(THEMES[theme].contentLine));
      assert.equal(pixels[5], rgb(THEMES[theme].titleBar), 'nothing between the lights and the title');
      // The title's ink: some width of it, around the middle.
      assert.ok(ink[1] - ink[0] >= 80, `the title is drawn: ${ink}`);
      assert.ok(Math.abs((ink[0] + ink[1]) / 2 - 300) <= 3, `centred: ${ink}`);
    });
  }

  it('is well-formed XML with any title, and its theme’s shadow is the store frame’s', async () => {
    const page = await browser.newPage();
    const error = await page.evaluate((svg) => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')?.textContent ?? null, macWindowSvg({ title: 'Q3 & “final” <report>' }));
    assert.equal(error, null);
    await page.close();
    for (const { windowShadow, shadow } of Object.values(THEMES)) assert.ok(shadow.startsWith(`0 ${windowShadow.y}px ${windowShadow.blur}px ${windowShadow.color},`));
  });
});
