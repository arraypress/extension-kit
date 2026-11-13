/**
 * Files: the ZIP writer read back by other people's readers (fflate's `unzipSync`, the system's
 * `unzip` and, on a Mac, `ditto`, which opens archives as Archive Utility does), its headers
 * read byte by byte, and `saveFiles` against a fake `chrome.downloads` and a jsdom page.
 *
 * The one check too slow for every run, a file past 4 GiB switching to ZIP64 by itself, runs
 * with `KIT_BIG_ZIP=1` (over a minute).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import { HELD_BYTES, KEEP_URL_MS, SLICE_BYTES, crc32, createZip, isStoredName, saveFiles } from '../src/index.js';

/** @import { TestContext } from 'node:test' */
/** @import { ZipWriter } from '../src/index.js' */

const encoder = new TextEncoder();

/**
 * Text as bytes.
 *
 * @param {string} text - The text.
 * @returns {Uint8Array<ArrayBuffer>} UTF-8.
 */
const utf8 = (text) => encoder.encode(text);

/**
 * Bytes that don't compress and aren't all alike, the same every run.
 *
 * @param {number} length - How many.
 * @param {number} [seed] - Where the sequence starts.
 * @returns {Uint8Array<ArrayBuffer>} The bytes.
 */
function noise(length, seed = 1) {
  const bytes = new Uint8Array(length);
  let state = seed;
  for (let at = 0; at < length; at++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[at] = state >>> 24;
  }
  return bytes;
}

/**
 * A finished ZIP's bytes.
 *
 * @param {ZipWriter} zip - The ZIP.
 * @returns {Promise<Uint8Array<ArrayBuffer>>} Its bytes.
 */
const bytesOf = async (zip) => new Uint8Array(await (await zip.finish()).arrayBuffer());

/**
 * One file of a ZIP as its central directory and its local header each describe it.
 *
 * @typedef {object} Listed
 * @property {string} name Its name.
 * @property {number} method 0 stored, 8 deflated (central directory).
 * @property {number} flags General-purpose bits (central directory).
 * @property {number} time DOS time.
 * @property {number} day DOS date.
 * @property {number} crc CRC-32 (central directory).
 * @property {number} packed Size in the ZIP.
 * @property {number} size Size.
 * @property {number} offset Where its local header is.
 * @property {{signature: number, version: number, flags: number, method: number, crc: number, packed: number, size: number, name: string, extra: number}} local The local header's own fields.
 */

/**
 * Read a plain (not ZIP64) ZIP's central directory and each file's local header.
 *
 * @param {Uint8Array<ArrayBuffer>} zip - The ZIP, with no comment.
 * @returns {Listed[]} Its files, in the directory's order.
 */
function listed(zip) {
  const view = new DataView(zip.buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054B50, 'ends with the end record');
  const count = view.getUint16(end + 10, true);
  assert.equal(view.getUint16(end + 8, true), count);
  let at = view.getUint32(end + 16, true);
  assert.equal(at + view.getUint32(end + 12, true), end, 'the directory runs up to the end record');
  /** @type {Listed[]} */
  const files = [];
  for (let n = 0; n < count; n++) {
    assert.equal(view.getUint32(at, true), 0x02014B50);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const localName = view.getUint16(offset + 26, true);
    files.push({
      name: decoder.decode(zip.subarray(at + 46, at + 46 + nameLength)),
      flags: view.getUint16(at + 8, true), method: view.getUint16(at + 10, true),
      time: view.getUint16(at + 12, true), day: view.getUint16(at + 14, true),
      crc: view.getUint32(at + 16, true), packed: view.getUint32(at + 20, true), size: view.getUint32(at + 24, true),
      offset,
      local: {
        signature: view.getUint32(offset, true), version: view.getUint16(offset + 4, true),
        flags: view.getUint16(offset + 6, true), method: view.getUint16(offset + 8, true),
        crc: view.getUint32(offset + 14, true), packed: view.getUint32(offset + 18, true), size: view.getUint32(offset + 22, true),
        name: decoder.decode(zip.subarray(offset + 30, offset + 30 + localName)), extra: view.getUint16(offset + 28, true),
      },
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  assert.equal(at, end);
  return files;
}

/**
 * Write a ZIP to a folder of its own, removed after the test.
 *
 * @param {TestContext} t - The test.
 * @param {Uint8Array} zip - The ZIP.
 * @returns {Promise<{dir: string, file: string}>} The folder and the ZIP in it.
 */
async function onDisk(t, zip) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kit-zip-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'made.zip');
  await writeFile(file, zip);
  return { dir, file };
}

/**
 * Whether a command is on this computer.
 *
 * @param {string} command - The command.
 * @returns {boolean} False when it can't be started.
 */
const has = (command) => !spawnSync(command, ['-h'], { stdio: 'ignore' }).error;

/**
 * Check a ZIP with the system's `unzip -t`, which reads every file and its CRC.
 *
 * @param {TestContext} t - The test, for a note when `unzip` is missing.
 * @param {string} file - The ZIP.
 * @returns {boolean} False when there was no `unzip` to ask.
 */
function unzipTests(t, file) {
  if (!has('unzip')) {
    t.diagnostic('NOT CHECKED: no `unzip` command on this computer, so the system reader was not asked');
    return false;
  }
  const run = spawnSync('unzip', ['-t', file], { encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /No errors detected/);
  return true;
}

/**
 * Every file under a folder with its bytes, names in the composed form the tests write them in
 * (macOS's file system gives them back decomposed).
 *
 * @param {string} dir - The folder.
 * @returns {Promise<Record<string, Uint8Array>>} Path (forward slashes) to bytes.
 */
async function folder(dir) {
  /** @type {Record<string, Uint8Array>} */
  const files = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, file).split(path.sep).join('/').normalize('NFC')] = new Uint8Array(await readFile(file));
  }
  return files;
}

/**
 * What a reader gave back, comparable with what went in.
 *
 * @param {Record<string, Uint8Array>} files - Name to bytes.
 * @returns {[string, string][]} Name and bytes (as base64), in the reader's order.
 */
const comparable = (files) => Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')]);

/**
 * Extract a ZIP with a command, and read what it wrote.
 *
 * @param {string} command - `unzip` or `ditto`.
 * @param {string[]} args - Its arguments, up to the folder to extract into.
 * @param {string} out - That folder.
 * @returns {Promise<[string, string][]>} Each file's name and bytes, sorted.
 */
async function extracted(command, args, out) {
  const run = spawnSync(command, [...args, out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return comparable(await folder(out)).sort();
}

/** A few files of every kind: stored and deflated, bytes and Blobs, folders, an empty one. */
const SAMPLE = /** @type {[string, Uint8Array<ArrayBuffer> | Blob][]} */ ([
  ['Zürich — 東京.png', noise(3000)],
  ['notes/Read me.txt', utf8('Hello, ZIP. '.repeat(400))],
  ['data/table.csv', new Blob(['a,b,c\n'.repeat(900)])],
  ['empty.txt', new Uint8Array(0)],
  ['clips/Lake.MP4', new Blob([noise(5000, 7)])],
]);

/**
 * The sample's files as a reader should give them back.
 *
 * @returns {Promise<[string, string][]>} Name and bytes, in the order added.
 */
const sampleExpected = async () => Promise.all(SAMPLE.map(async ([name, data]) => /** @type {[string, string]} */ (
  [name, Buffer.from(data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data).toString('base64')])));

/**
 * A ZIP of the sample.
 *
 * @param {Parameters<typeof createZip>[0]} [options] - The ZIP's options.
 * @returns {Promise<Uint8Array<ArrayBuffer>>} Its bytes.
 */
async function sampleZip(options) {
  const zip = createZip(options);
  for (const [name, data] of SAMPLE) await zip.add(name, data);
  return bytesOf(zip);
}

describe('crc32', () => {
  it('gives the known values', () => {
    assert.equal(crc32(utf8('123456789')), 0xCBF43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
    assert.equal(crc32(utf8('The quick brown fox jumps over the lazy dog')), 0x414FA339);
  });

  it('agrees with zlib at every length around its eight-byte steps, and is never negative', () => {
    const bytes = noise(70);
    for (let length = 0; length <= bytes.length; length++) {
      assert.equal(crc32(bytes.subarray(0, length)), zlib.crc32(bytes.subarray(0, length)), `length ${length}`);
    }
    assert.equal(crc32(noise(100_003, 9)), zlib.crc32(noise(100_003, 9)));
  });

  it('carries on from a seed: parts in turn give the whole’s CRC', () => {
    const bytes = noise(10_000, 3);
    const whole = crc32(bytes);
    for (const cut of [0, 1, 7, 8, 9, 4999, 10_000]) {
      assert.equal(crc32(bytes.subarray(cut), crc32(bytes.subarray(0, cut))), whole, `cut at ${cut}`);
    }
    assert.notEqual(crc32(bytes.subarray(5), 123), crc32(bytes.subarray(5)));
  });
});

describe('isStoredName', () => {
  it('stores what is compressed already, whatever its case or folder, and deflates the rest', () => {
    for (const name of ['a.jpg', 'a.JPEG', 'x/y/Lake.png', 'a.webp', 'a.avif', 'a.mp4', 'a.webm', 'a.pdf', 'a.zip', 'a.docx', 'a.woff2', 'a.woff', 'a.mp3']) {
      assert.equal(isStoredName(name), true, name);
    }
    for (const name of ['a.svg', 'a.csv', 'a.txt', 'a.json', 'a.html', 'a.bmp', 'a.wav', 'png', 'a.png.txt', 'jpg/readme']) {
      assert.equal(isStoredName(name), false, name);
    }
  });
});

describe('createZip', () => {
  it('reads back with fflate: every name (UTF-8), every byte, in the order added', async () => {
    const read = unzipSync(await sampleZip());
    assert.deepEqual(comparable(read), await sampleExpected());
    assert.ok('Zürich — 東京.png' in read);
  });

  it('opens with the system’s unzip and, on a Mac, as Archive Utility opens it', async (t) => {
    const { dir, file } = await onDisk(t, await sampleZip());
    const expected = (await sampleExpected()).sort();
    if (unzipTests(t, file)) {
      // The UTF-8 name is what Info-ZIP's unzip refuses in a ZIP that says it was made on MS-DOS.
      assert.deepEqual(await extracted('unzip', ['-q', file, '-d'], path.join(dir, 'unzip')), expected);
      // Readable by its owner, as a ZIP made on Unix must say for each file.
      assert.equal((await stat(path.join(dir, 'unzip/notes/Read me.txt'))).mode & 0o777, 0o644 & ~process.umask());
    }
    if (!has('ditto')) return t.diagnostic('NOT CHECKED: no `ditto` (macOS only), so Archive Utility’s reader was not asked');
    assert.deepEqual(await extracted('ditto', ['-x', '-k', file], path.join(dir, 'ditto')), expected);
  });

  it('stores compressed formats with a complete local header, and deflates the rest with a data descriptor', async () => {
    const zip = await sampleZip();
    const files = listed(zip);
    assert.deepEqual(files.map((file) => [file.name, file.method]), [
      ['Zürich — 東京.png', 0], ['notes/Read me.txt', 8], ['data/table.csv', 8], ['empty.txt', 0], ['clips/Lake.MP4', 0],
    ]);
    const view = new DataView(zip.buffer);
    for (const file of files) {
      const { local } = file;
      assert.equal(local.signature, 0x04034B50, file.name);
      assert.equal(local.name, file.name);
      assert.equal(local.method, file.method);
      assert.equal(local.flags, file.flags);
      assert.equal(local.version, 20);
      assert.equal(local.extra, 0);
      // Bit 11 says the name is UTF-8: without it “Zürich” extracts as mojibake.
      assert.equal(file.flags & 0x0800, 0x0800, file.name);
      if (file.method === 0) {
        // No descriptor, and everything a reader going forwards needs is before the data.
        assert.equal(file.flags & 0x0008, 0, file.name);
        assert.deepEqual([local.crc, local.packed, local.size], [file.crc, file.size, file.size], file.name);
        assert.equal(file.packed, file.size);
        assert.equal(file.crc, crc32(zip.subarray(file.offset + 30 + utf8(file.name).length).subarray(0, file.size)));
      } else {
        assert.equal(file.flags & 0x0008, 0x0008, file.name);
        assert.deepEqual([local.crc, local.packed, local.size], [0, 0, 0], file.name);
        assert.ok(file.packed < file.size / 10, `${file.name} is deflated to ${file.packed} of ${file.size}`);
        const descriptor = file.offset + 30 + utf8(file.name).length + file.packed;
        assert.deepEqual([0, 4, 8, 12].map((at) => view.getUint32(descriptor + at, true)), [0x08074B50, file.crc, file.packed, file.size]);
      }
    }
    // A plain ZIP: no ZIP64 locator before the end record.
    assert.notEqual(view.getUint32(zip.length - 22 - 20, true), 0x07064B50);
  });

  it('reads forwards too, from the local headers alone (a stream into bsdtar)', async (t) => {
    if (!has('bsdtar')) return t.skip('no `bsdtar` on this computer');
    const { dir, file } = await onDisk(t, await sampleZip());
    const run = spawnSync('bsdtar', ['-xf', '-', '-C', dir], { input: await readFile(file), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    await rm(file);
    assert.deepEqual(comparable(await folder(dir)).sort(), (await sampleExpected()).sort());
  });

  it('`store` keeps every file as it is, and one file’s own `store` wins either way', async () => {
    const text = utf8('again '.repeat(500));
    const all = createZip({ store: true });
    await all.add('a.txt', text);
    await all.add('b.txt', text, { store: false });
    const some = createZip();
    await some.add('a.txt', text, { store: true });
    await some.add('b.png', text, { store: false });
    await some.add('c.txt', text);
    for (const [zip, methods] of /** @type {[ZipWriter, number[]][]} */ ([[all, [0, 8]], [some, [0, 8, 8]]])) {
      const bytes = await bytesOf(zip);
      assert.deepEqual(listed(bytes).map((file) => file.method), methods);
      assert.deepEqual(Object.values(unzipSync(bytes)).map((file) => Buffer.from(file).toString()), methods.map(() => 'again '.repeat(500)));
    }
  });

  it('writes each file’s time as ZIP keeps it: local time, the ZIP’s date or the file’s own', async () => {
    const zip = createZip({ date: new Date(2026, 10, 13, 22, 41, 37) });
    await zip.add('a.txt', utf8('a'));
    await zip.add('b.png', utf8('b'), { date: new Date(1999, 0, 2, 3, 4, 6) });
    await zip.add('old.txt', utf8('c'), { date: new Date(1969, 6, 20) });
    await zip.add('far.txt', utf8('d'), { date: new Date(2200, 0, 1) });
    const dos = (/** @type {number[]} */ [y, mo, d, h, mi, s]) => [((y - 1980) << 9) | (mo << 5) | d, (h << 11) | (mi << 5) | (s >> 1)];
    assert.deepEqual(listed(await bytesOf(zip)).map((file) => [file.day, file.time]), [
      dos([2026, 11, 13, 22, 41, 37]), dos([1999, 1, 2, 3, 4, 6]), dos([1980, 1, 1, 0, 0, 0]), dos([2107, 12, 31, 23, 59, 58]),
    ]);
  });

  it('counts its files and their bytes, and gives a Blob of type application/zip', async () => {
    const zip = createZip();
    assert.deepEqual([zip.count(), zip.bytes()], [0, 0]);
    await zip.add('a.txt', utf8('12345'));
    await zip.add('b.png', new Blob([noise(100)]));
    assert.deepEqual([zip.count(), zip.bytes()], [2, 105]);
    const blob = await zip.finish();
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, 'application/zip');
    assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))), ['a.txt', 'b.png']);
  });

  it('an empty ZIP is still a ZIP', async () => {
    const bytes = await bytesOf(createZip());
    assert.equal(bytes.length, 22);
    assert.deepEqual(unzipSync(bytes), {});
    assert.deepEqual(listed(bytes), []);
  });

  it('reads a Blob bigger than a slice in slices, never whole, stored (twice) and deflated (once)', async (t) => {
    const bytes = noise(2 * SLICE_BYTES + 12_345, 5);
    const stored = new Blob([bytes]);
    const deflated = new Blob([bytes]);
    const small = new Blob([noise(1000)]);
    /** @type {Map<Blob, number[]>} */
    const slices = new Map([[stored, []], [deflated, []], [small, []]]);
    for (const [blob, sizes] of slices) {
      const slice = blob.slice.bind(blob);
      t.mock.method(blob, 'slice', (/** @type {number} */ from, /** @type {number} */ to) => {
        const part = slice(from, to);
        sizes.push(part.size);
        return part;
      });
    }
    const wholeReads = [stored, deflated].map((blob) => t.mock.method(blob, 'arrayBuffer'));
    const zip = createZip();
    await zip.add('big.mp4', stored);
    await zip.add('big.bin', deflated);
    await zip.add('small.png', small);
    const read = unzipSync(await bytesOf(zip));
    assert.ok(Buffer.from(read['big.mp4']).equals(bytes));
    assert.ok(Buffer.from(read['big.bin']).equals(bytes));
    const once = [SLICE_BYTES, SLICE_BYTES, 12_345];
    assert.deepEqual(slices.get(stored), [...once, ...once]);
    assert.deepEqual(slices.get(deflated), once);
    assert.deepEqual(wholeReads.map((mock) => mock.mock.callCount()), [0, 0]);
    // A Blob within one slice is read in one go.
    assert.deepEqual(slices.get(small), []);
    assert.equal(SLICE_BYTES, 4 * 1024 ** 2);
  });

  it('hands what it holds to the Blob every `heldBytes`, and the ZIP is the same either way', async (t) => {
    /** @type {number[]} */
    let folds = [];
    const RealBlob = globalThis.Blob;
    t.mock.property(globalThis, 'Blob', class extends RealBlob {
      /**
       * @param {BlobPart[]} [parts] - The parts.
       * @param {BlobPropertyBag} [options] - Its type.
       */
      constructor(parts, options) {
        super(parts, options);
        // A fold: the ZIP so far with more put after it.
        if (parts?.[0] instanceof RealBlob) folds.push(this.size);
      }
    });
    const files = /** @type {[string, Uint8Array<ArrayBuffer>][]} */ ([1, 2, 3, 4, 5, 6].map((n) => [`${n}.png`, noise(600, n)]));
    /**
     * @param {number} [heldBytes] - The option.
     * @returns {Promise<Uint8Array<ArrayBuffer>>} The ZIP.
     */
    const made = async (heldBytes) => {
      folds = [];
      const zip = createZip({ heldBytes, date: new Date(2026, 0, 1) });
      for (const [name, data] of files) await zip.add(name, data);
      return bytesOf(zip);
    };
    const whole = await made();
    assert.deepEqual(folds, [whole.length], 'by default (16 MiB) a small ZIP is handed over once, at the end');
    const folded = await made(1000);
    // Each file is 30 + 5 + 600 bytes: every second one passes 1000 held.
    assert.deepEqual(folds, [1270, 2540, 3810, whole.length]);
    assert.deepEqual(folded, whole);
    assert.deepEqual(Object.keys(unzipSync(folded)), files.map(([name]) => name));
    assert.equal(HELD_BYTES, 16 * 1024 ** 2);
  });

  it('`zip64` writes ZIP64 records for a small ZIP, which fflate and the system’s unzip read', async (t) => {
    const zip = await sampleZip({ zip64: true });
    const plain = await sampleZip();
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    // The end record sends readers to ZIP64's: its counts, size and offset all say "see there".
    assert.deepEqual([view.getUint16(end + 8, true), view.getUint16(end + 10, true), view.getUint32(end + 12, true), view.getUint32(end + 16, true)],
      [0xFFFF, 0xFFFF, 0xFFFFFFFF, 0xFFFFFFFF]);
    assert.equal(view.getUint32(end - 20, true), 0x07064B50, 'the locator is before the end record');
    const record = Number(view.getBigUint64(end - 20 + 8, true));
    assert.equal(record, end - 20 - 56);
    assert.equal(view.getUint32(record, true), 0x06064B50);
    assert.equal(view.getBigUint64(record + 32, true), 5n, 'five files');
    const directory = Number(view.getBigUint64(record + 48, true));
    assert.equal(directory + Number(view.getBigUint64(record + 40, true)), record, 'the directory runs up to the ZIP64 record');
    // The first file: version 4.5, sizes marked, and the real ones in the 0x0001 extra field.
    assert.deepEqual([view.getUint16(4, true), view.getUint32(18, true), view.getUint32(22, true), view.getUint16(28, true)], [45, 0xFFFFFFFF, 0xFFFFFFFF, 20]);
    const extra = 30 + utf8(SAMPLE[0][0]).length;
    assert.deepEqual([view.getUint16(extra, true), view.getUint16(extra + 2, true), view.getBigUint64(extra + 4, true), view.getBigUint64(extra + 12, true)], [1, 16, 3000n, 3000n]);
    assert.equal(view.getUint32(directory, true), 0x02014B50);
    assert.deepEqual([view.getUint32(directory + 20, true), view.getUint32(directory + 24, true), view.getUint32(directory + 42, true)], [0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF]);
    // Per file: 20 bytes in the local header, 28 in the directory, 8 more in each of the two data descriptors; then the two end records.
    assert.equal(zip.length, plain.length + 5 * (20 + 28) + 2 * 8 + 56 + 20);
    assert.deepEqual(comparable(unzipSync(zip)), await sampleExpected());
    const { dir, file } = await onDisk(t, zip);
    if (!unzipTests(t, file)) return;
    assert.deepEqual(await extracted('unzip', ['-q', file, '-d'], path.join(dir, 'out')), (await sampleExpected()).sort());
  });

  it('switches to ZIP64 by itself past 65,535 files', async () => {
    const zip = createZip();
    const nothing = new Uint8Array(0);
    for (let n = 0; n < 65_535; n++) await zip.add(`f${n}`, nothing);
    const at65535 = await zip.finish();
    assert.equal(new DataView(await at65535.slice(-42, -38).arrayBuffer()).getUint32(0, true) === 0x07064B50, false, '65,535 files still fit a plain ZIP');

    const more = createZip();
    for (let n = 0; n < 65_536; n++) await more.add(`f${n}`, nothing);
    const bytes = await bytesOf(more);
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(bytes.length - 42, true), 0x07064B50);
    assert.equal(view.getUint16(bytes.length - 22 + 10, true), 0xFFFF);
    // The files themselves stay plain: only the count needed ZIP64.
    assert.equal(view.getUint16(4, true), 20);
    const names = Object.keys(unzipSync(bytes));
    assert.equal(names.length, 65_536);
    assert.deepEqual([names[0], names.at(-1)], ['f0', 'f65535']);
  });

  it('switches to ZIP64 by itself for a file past 4 GiB (unzip reads all of it back)', {
    skip: process.env.KIT_BIG_ZIP ? false : 'slow (over a minute): run with KIT_BIG_ZIP=1',
  }, async (t) => {
    // Node's own Blob can't be sliced past 4 GiB (it aborts), so: a Blob of that size whose slices are real Blobs of zeros.
    const size = 4 * 1024 ** 3 + 64 * 1024 ** 2 + 5;
    const zeros = new Blob([new Uint8Array(SLICE_BYTES)]);
    class Zeros extends Blob {
      /** @returns {number} Past 4 GiB. */
      get size() { return size; }

      /**
       * @param {number} [from] - Start.
       * @param {number} [to] - End.
       * @returns {Blob} That many zeros.
       */
      slice(from = 0, to = size) { return zeros.slice(0, Math.min(to, size) - from); }
    }
    const zip = createZip();
    await zip.add('before.txt', utf8('before'));
    await zip.add('zeros.bin', new Zeros());
    await zip.add('after.txt', utf8('after'));
    assert.equal(zip.bytes(), size + 11);
    const bytes = await bytesOf(zip);
    const view = new DataView(bytes.buffer);
    // Only the big file is ZIP64; the end record is plain (three files, a small ZIP).
    const big = 30 + 10 + 8 + 16;
    assert.deepEqual([view.getUint16(4, true), view.getUint16(big + 4, true)], [20, 45]);
    assert.notEqual(view.getUint32(bytes.length - 42, true), 0x07064B50);
    const { file } = await onDisk(t, bytes);
    if (!unzipTests(t, file)) return;
    const list = spawnSync('unzip', ['-l', file], { encoding: 'utf8' }).stdout;
    assert.match(list, new RegExp(`^\\s*${size}\\s.*zeros\\.bin$`, 'm'));
  });

  it('refuses a name it already has, and the ZIP goes on without the second', async () => {
    const zip = createZip();
    await zip.add('Lake.jpg', utf8('first'));
    await assert.rejects(zip.add('Lake.jpg', utf8('second')), { name: 'Error', message: 'The ZIP already has a file named “Lake.jpg”' });
    // Another case is another name (ZIP's names are exact).
    await zip.add('lake.jpg', utf8('third'));
    assert.equal(zip.count(), 2);
    assert.deepEqual(comparable(unzipSync(await bytesOf(zip))), [['Lake.jpg', btoa('first')], ['lake.jpg', btoa('third')]]);
  });

  it('refuses a duplicate even while the first is still being written', async () => {
    const zip = createZip();
    const first = zip.add('a.txt', new Blob(['first']));
    await assert.rejects(zip.add('a.txt', utf8('second')), /already has a file named “a.txt”/);
    await first;
    assert.deepEqual(comparable(unzipSync(await bytesOf(zip))), [['a.txt', btoa('first')]]);
  });

  it('refuses a file after finish, and a second finish', async () => {
    const zip = createZip();
    await zip.add('a.txt', utf8('a'));
    const blob = await zip.finish();
    await assert.rejects(zip.add('b.txt', utf8('b')), { name: 'Error', message: 'The ZIP is finished: “b.txt” can\'t be added' });
    await assert.rejects(zip.finish(), { message: 'The ZIP is finished already' });
    assert.equal(zip.count(), 1);
    assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))), ['a.txt']);
  });

  it('refuses what a ZIP can’t hold: no name, a name past 65,535 bytes, data that isn’t bytes', async () => {
    const zip = createZip();
    await assert.rejects(zip.add('', utf8('a')), /names are 1 to 65,535 bytes/);
    await assert.rejects(zip.add('é'.repeat(32_768), utf8('a')), /names are 1 to 65,535 bytes/);
    await assert.rejects(zip.add('a.txt', /** @type {any} */ ('text')), { name: 'TypeError', message: '“a.txt” is neither a Blob nor a Uint8Array' });
    await zip.add('é'.repeat(32_767), utf8('fits'));
    await zip.add('a.txt', utf8('the name is free again'));
    assert.deepEqual(Object.keys(unzipSync(await bytesOf(zip))), ['é'.repeat(32_767), 'a.txt']);
  });

  it('writes files in the order added even when the adds aren’t awaited one by one', async () => {
    const zip = createZip();
    // The big Blob takes several reads; the small ones after it would overtake it if nothing made them wait.
    const big = noise(SLICE_BYTES + 10, 2);
    await Promise.all([zip.add('1 big.bin', new Blob([big])), zip.add('2.txt', utf8('two')), zip.add('3.png', new Blob(['three']))]);
    const read = unzipSync(await bytesOf(zip));
    assert.deepEqual(Object.keys(read), ['1 big.bin', '2.txt', '3.png']);
    assert.ok(Buffer.from(read['1 big.bin']).equals(big));
    assert.equal(Buffer.from(read['2.txt']).toString(), 'two');
  });

  it('finish waits for adds still being written', async () => {
    const zip = createZip();
    const big = noise(SLICE_BYTES + 10, 4);
    const adding = zip.add('big.bin', new Blob([big]));
    const blob = await zip.finish();
    await adding;
    assert.ok(Buffer.from(unzipSync(new Uint8Array(await blob.arrayBuffer()))['big.bin']).equals(big));
  });

  it('a file that can’t be read leaves the ZIP as it was before it, stored or deflated', async () => {
    for (const name of ['gone.mp4', 'gone.bin']) {
      const zip = createZip({ heldBytes: 1000, date: new Date(2026, 0, 1) });
      await zip.add('before.txt', utf8('before'));
      // A file deleted while it's read: the first slices come, a later one doesn't (Chrome's NotReadableError).
      const gone = new Blob([noise(3 * SLICE_BYTES, 6)]);
      const slice = gone.slice.bind(gone);
      let reads = 0;
      gone.slice = (from, to) => {
        reads += 1;
        // Fail once some of it is in the ZIP: a stored file's second read of its second pass (the first pass is three reads, for its CRC).
        if (reads !== (name === 'gone.mp4' ? 5 : 2)) return slice(from, to);
        const part = slice(from, to);
        part.arrayBuffer = () => Promise.reject(new DOMException('The file could not be read', 'NotReadableError'));
        return part;
      };
      await assert.rejects(zip.add(name, gone), { name: 'NotReadableError' });
      assert.deepEqual([zip.count(), zip.bytes()], [1, 6], name);
      await zip.add('after.txt', utf8('after'));
      // The name is free again once the file is back.
      await zip.add(name, utf8('back'));
      const bytes = await bytesOf(zip);
      assert.deepEqual(comparable(unzipSync(bytes)), [['before.txt', btoa('before')], ['after.txt', btoa('after')], [name, btoa('back')]]);
      // Nothing of the failed file is left between the others.
      const same = createZip({ date: new Date(2026, 0, 1) });
      await same.add('before.txt', utf8('before'));
      await same.add('after.txt', utf8('after'));
      await same.add(name, utf8('back'));
      assert.deepEqual(bytes, await bytesOf(same), name);
    }
  });

  it('a stored file that got shorter between its two readings is refused, not written with the wrong CRC', async () => {
    const zip = createZip();
    const file = new Blob([noise(SLICE_BYTES + 100, 8)]);
    const slice = file.slice.bind(file);
    let reads = 0;
    // Two reads for the CRC; in the pass that writes, the last part comes back short.
    file.slice = (from, to) => (++reads === 4 ? slice(from, file.size - 150) : slice(from, to));
    await assert.rejects(zip.add('clip.mp4', file), { message: '“clip.mp4” changed while it was being read' });
    await zip.add('after.txt', utf8('after'));
    assert.deepEqual(comparable(unzipSync(await bytesOf(zip))), [['after.txt', btoa('after')]]);
  });

  it('is in the runtime half, vendored with it', () => {
    assert.ok(RUNTIME_ENTRIES.includes('files'));
  });
});

describe('saveFiles', () => {
  const files = [
    { name: 'Capture 1.png', blob: new Blob(['one'], { type: 'image/png' }) },
    { name: 'Trips/Capture 2.png', blob: new Blob(['two!'], { type: 'image/png' }) },
  ];

  /**
   * What a blob address gives, while it's kept.
   *
   * @param {string} url - The address.
   * @returns {Promise<string | undefined>} Its text; undefined once it's let go.
   */
  const textAt = async (url) => resolveObjectURL(url)?.text();

  it('saves through chrome.downloads when it’s granted: each file in turn, by name, never over another', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    /** @type {(chrome.downloads.DownloadOptions & {held: string | undefined})[]} */
    const asked = [];
    let running = 0;
    const downloads = {
      /**
       * @param {chrome.downloads.DownloadOptions} options - What to download.
       * @returns {Promise<number>} The download's id.
       */
      async download(options) {
        assert.equal(running, 0, 'one download is started before the next is asked for');
        running += 1;
        const held = await textAt(options.url);
        running -= 1;
        asked.push({ ...options, held });
        return asked.length;
      },
    };
    const { window } = new JSDOM('');
    const clicks = t.mock.method(window.HTMLAnchorElement.prototype, 'click', () => {});
    await saveFiles(files, downloads, window.document);
    assert.deepEqual(asked.map(({ filename, conflictAction, held }) => [filename, conflictAction, held]), [
      ['Capture 1.png', 'uniquify', 'one'], ['Trips/Capture 2.png', 'uniquify', 'two!'],
    ]);
    assert.equal(clicks.mock.callCount(), 0, 'no link is clicked as well');

    // The addresses are kept while Chrome saves, and let go after KEEP_URL_MS.
    assert.equal(KEEP_URL_MS, 60_000);
    t.mock.timers.tick(KEEP_URL_MS - 1);
    assert.deepEqual(await Promise.all(asked.map(({ url }) => textAt(url))), ['one', 'two!']);
    t.mock.timers.tick(1);
    assert.deepEqual(await Promise.all(asked.map(({ url }) => textAt(url))), [undefined, undefined]);
  });

  it('without it, clicks a link with `download` set for each file (jsdom), and lets the addresses go later', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { window } = new JSDOM('<!doctype html><p>Editor</p>');
    /** @type {{tag: string, download: string, href: string, held: string | undefined, connected: boolean}[]} */
    const clicked = [];
    /** @type {Promise<void>[]} */
    const reads = [];
    // The click is where Chrome takes over; jsdom has no downloads, so what was clicked is recorded.
    t.mock.method(window.HTMLAnchorElement.prototype, 'click', /** @this {HTMLAnchorElement} */ function click() {
      const entry = { tag: this.localName, download: this.download, href: this.href, held: /** @type {string | undefined} */ (undefined), connected: this.isConnected };
      clicked.push(entry);
      reads.push(textAt(this.href).then((text) => { entry.held = text; }));
    });
    await saveFiles(files, undefined, window.document);
    await Promise.all(reads);
    assert.deepEqual(clicked.map(({ tag, download, held, connected }) => [tag, download, held, connected]), [
      ['a', 'Capture 1.png', 'one', false], ['a', 'Trips/Capture 2.png', 'two!', false],
    ]);
    assert.ok(clicked.every(({ href }) => href.startsWith('blob:')));
    assert.equal(window.document.querySelector('a'), null, 'the page is left as it was');
    t.mock.timers.tick(KEEP_URL_MS);
    assert.deepEqual(await Promise.all(clicked.map(({ href }) => textAt(href))), [undefined, undefined]);
  });

  it('uses the page’s own document by default, and needs none in a worker with downloads', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    assert.equal('document' in globalThis, false, 'this test runs where a worker does: no document');
    /** @type {string[]} */
    const names = [];
    await saveFiles(files, { download: async ({ filename }) => names.push(filename ?? '') });
    assert.deepEqual(names, ['Capture 1.png', 'Trips/Capture 2.png']);

    const { window } = new JSDOM('');
    const clicks = t.mock.method(window.HTMLAnchorElement.prototype, 'click', () => {});
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
    t.after(() => Reflect.deleteProperty(globalThis, 'document'));
    await saveFiles(files.slice(0, 1), undefined);
    assert.equal(clicks.mock.callCount(), 1);
    t.mock.timers.tick(KEEP_URL_MS);
  });
});
