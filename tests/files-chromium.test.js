/**
 * The ZIP writer and `saveFiles` in Playwright's Chromium, where they run for real: Chrome's own
 * `CompressionStream`, Blobs read in slices from Chrome's blob store, and a link's download that
 * Chrome saves under the name given. The saved ZIP is read back in Node by fflate.
 *
 * @module tests/files-chromium
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright';
import { serve } from '../src/testing/index.js';
import { kitSource } from './fixtures/kit-source.js';
import { SLICE_BYTES, crc32 } from '../src/index.js';

/** @import { Browser } from 'playwright' */
/** @import { TestServer } from '../src/testing/index.js' */

/** A page with the kit's files modules on `window.files`. */
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Files</title></head><body>
<script type="module">
  import { createZip } from '/src/files/zip.js';
  import { saveFiles } from '/src/files/save.js';
  window.files = { createZip, saveFiles };
</script>
</body></html>`;

/** @type {Browser} */
let browser;
/** @type {TestServer} */
let site;

before(async () => {
  site = await serve(async (pathname) => (pathname === '/' ? PAGE : kitSource(pathname)));
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
});

describe('createZip and saveFiles in Chrome', () => {
  it('zips Blobs bigger than a slice and text, and a link’s download saves the ZIP under its name', async () => {
    const page = await browser.newPage();
    await page.goto(`${site.origin}/`);
    await page.waitForFunction(() => 'files' in window);
    const saving = page.waitForEvent('download');
    const made = await page.evaluate(async (bigBytes) => {
      const { createZip, saveFiles } = /** @type {{files: Pick<typeof import('../src/index.js'), 'createZip' | 'saveFiles'>}} */ (/** @type {unknown} */ (window)).files;
      // Bytes that don't compress, the same every run: i * 31 + (i >> 8), in two Blobs of one content.
      const big = new Uint8Array(bigBytes);
      for (let at = 0; at < big.length; at++) big[at] = at * 31 + (at >> 8) + (at >> 16);
      const zip = createZip({ heldBytes: 1024 ** 2 });
      await zip.add('clips/Zürich — 東京.mp4', new Blob([big]));
      await zip.add('notes.txt', new Blob(['Hello from Chrome. '.repeat(2000)]));
      await zip.add('big.bin', new Blob([big.subarray(0, 1000), big.subarray(1000)]));
      await zip.add('small.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
      const blob = await zip.finish();
      await saveFiles([{ name: 'Made in Chrome.zip', blob }], undefined);
      return { count: zip.count(), bytes: zip.bytes(), size: blob.size, type: blob.type };
    }, 2 * SLICE_BYTES + 4321);
    const download = await saving;
    assert.equal(download.suggestedFilename(), 'Made in Chrome.zip');
    const saved = new Uint8Array(await readFile(await download.path()));
    assert.deepEqual(made, { count: 4, bytes: 2 * (2 * SLICE_BYTES + 4321) + 38_000 + 41, size: saved.length, type: 'application/zip' });

    const read = unzipSync(saved);
    assert.deepEqual(Object.keys(read), ['clips/Zürich — 東京.mp4', 'notes.txt', 'big.bin', 'small.svg']);
    const big = new Uint8Array(2 * SLICE_BYTES + 4321);
    for (let at = 0; at < big.length; at++) big[at] = at * 31 + (at >> 8) + (at >> 16);
    assert.equal(crc32(read['clips/Zürich — 東京.mp4']), crc32(big));
    assert.ok(Buffer.from(read['big.bin']).equals(big));
    assert.equal(Buffer.from(read['notes.txt']).toString(), 'Hello from Chrome. '.repeat(2000));
    assert.equal(Buffer.from(read['small.svg']).toString(), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    // The MP4 is in as it is (method 0, no data descriptor); Chrome's deflate made the rest smaller.
    const view = new DataView(saved.buffer);
    assert.deepEqual([view.getUint16(8, true), view.getUint16(6, true) & 8, view.getUint32(18, true)], [0, 0, big.length]);
    assert.ok(saved.length > big.length && saved.length < 2 * big.length, `${saved.length} bytes`);
    await page.close();
  });
});
