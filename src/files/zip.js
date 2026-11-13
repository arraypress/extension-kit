/**
 * A ZIP written a file at a time, with nothing but the platform: each file's
 * bytes go into the ZIP as they're added and from there into a Blob (which
 * Chrome keeps outside the page's memory, on disk once large), so a page
 * never holds the files and the ZIP together. Files already compressed
 * (images, audio, video, PDFs, archives) are stored as they are; the rest
 * (SVG, CSV, plain text) is deflated by `CompressionStream('deflate-raw')`
 * (Chrome 103, Node 20.12). ZIP64 is written when a file, the ZIP or the
 * number of files passes what a plain ZIP can say. Runs anywhere (page,
 * worker, Node).
 *
 * How each entry is written, and why:
 *
 * - **Stored** entries are read twice: once for the CRC-32, then the local
 *   header is written with the real CRC and sizes, then the bytes. No data
 *   descriptor: a stored entry whose header says "sizes follow the data"
 *   can't be read forwards (nothing marks where its data ends), and readers
 *   that go by the local headers refuse it or stop there. A Blob is read in
 *   slices both times, so a 2 GB video never sits in memory whole.
 * - **Deflated** entries are read once and followed by a data descriptor
 *   (general-purpose bit 3), as every streaming ZIP writer does: the
 *   compressed size is known only afterwards, and a deflate stream marks its
 *   own end, so every reader copes.
 *
 * @module files/zip
 */

/** Formats that are compressed already: deflating them again only costs time. */
const STORED = /\.(?:jpe?g|png|gif|webp|avif|heic|jxl|mp3|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mov|mkv|webm|ogv|pdf|zip|gz|tgz|7z|rar|xz|bz2|zst|br|docx|xlsx|pptx|epub|odt|ods|odp|crx|woff2?)$/i;

/** ZIP bytes held in memory before they're handed to the Blob: 16 MiB. */
export const HELD_BYTES = 16 * 1024 ** 2;

/** How much of a Blob is read at a time: 4 MiB. A smaller Blob is read whole. */
export const SLICE_BYTES = 4 * 1024 ** 2;

/** The most a plain ZIP's 32-bit sizes and offsets say; at or past it, ZIP64. */
const MAX_32 = 0xFFFFFFFF;

/**
 * A file this size or more is written as ZIP64: 16 MiB short of 4 GiB, since a deflated file's
 * header is written before its compressed size is known, and deflate can make incompressible
 * bytes slightly bigger (zlib's bound: about 0.03%, 1.3 MiB here).
 */
const ZIP64_FILE_BYTES = MAX_32 - HELD_BYTES;

/**
 * "Made on Unix", the high byte of a central entry's "version made by". Info-ZIP's `unzip` (the
 * one on macOS and Linux) takes the names of a ZIP made on MS-DOS, what a 0 here says, for an
 * old code page and converts them, UTF-8 bit or not: “Zürich.png” then fails to extract
 * (“Illegal byte sequence” on macOS). A Unix ZIP's names it leaves alone.
 */
const MADE_ON_UNIX = 3 << 8;

/** A Unix ZIP's files need a mode, or they extract as unreadable: a regular file, rw-r--r--, in the external attributes' high half. */
const FILE_MODE = 0o100644 * 2 ** 16;

/** The most files a plain ZIP counts. */
const MAX_16 = 0xFFFF;

/** CRC-32's tables for eight bytes at a time (slicing-by-8): table `t` at `t * 256`. */
const CRC_TABLES = crcTables();

/**
 * Make CRC-32's tables (polynomial 0xEDB88320, as ZIP, PNG and gzip use).
 *
 * @returns {Uint32Array} Eight tables of 256.
 */
function crcTables() {
  const tables = new Uint32Array(8 * 256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tables[n] = c;
  }
  for (let n = 0; n < 256; n++) {
    for (let t = 1; t < 8; t++) {
      const before = tables[(t - 1) * 256 + n];
      tables[t * 256 + n] = tables[before & 255] ^ (before >>> 8);
    }
  }
  return tables;
}

/**
 * The CRC-32 of some bytes (ZIP's, PNG's and gzip's), or of more bytes after others: give the
 * CRC so far as `seed` and the result is the CRC of both together.
 *
 * @param {Uint8Array} bytes - The bytes.
 * @param {number} [seed] - The CRC of what came before. Default 0 (nothing).
 * @returns {number} The CRC, 0 to 0xFFFFFFFF.
 * @example
 * crc32(new TextEncoder().encode('123456789')); // 0xCBF43926
 * crc32(rest, crc32(start)); // the CRC of start followed by rest
 */
export function crc32(bytes, seed = 0) {
  const T = CRC_TABLES;
  let c = ~seed;
  let at = 0;
  for (const end = bytes.length - 7; at < end; at += 8) {
    c ^= bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
    c = T[1792 + (c & 255)] ^ T[1536 + ((c >>> 8) & 255)] ^ T[1280 + ((c >>> 16) & 255)] ^ T[1024 + (c >>> 24)]
      ^ T[768 + bytes[at + 4]] ^ T[512 + bytes[at + 5]] ^ T[256 + bytes[at + 6]] ^ T[bytes[at + 7]];
  }
  for (; at < bytes.length; at++) c = T[(c ^ bytes[at]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

/**
 * Whether a file of this name is stored in a ZIP as it is, going by its extension: formats that
 * are compressed already (JPEG, PNG, WebP, MP4, PDF, ZIP, Office documents, WOFF…). Anything else
 * (SVG, CSV, JSON, text, BMP, WAV) is deflated.
 *
 * @param {string} name - The file's name or path.
 * @returns {boolean} True for a compressed format.
 * @example
 * isStoredName('Lake.JPG'); // true
 * isStoredName('icons/logo.svg'); // false
 */
export function isStoredName(name) {
  return STORED.test(name);
}

/**
 * A date as ZIP writes it: MS-DOS date and time, local time, two-second steps, 1980 to 2107
 * (a date outside them, or one that isn't a date, is the nearest end or 1980).
 *
 * @param {Date} date - The date.
 * @returns {{time: number, day: number}} The two 16-bit fields.
 */
function dosTime(date) {
  const year = date.getFullYear();
  if (!(year >= 1980)) return { time: 0, day: (1 << 5) | 1 };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, day: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Bytes being laid out, little-endian as ZIP's are.
 *
 * @typedef {object} Record
 * @property {(value: number) => Record} u16 Two bytes.
 * @property {(value: number) => Record} u32 Four bytes.
 * @property {(value: number) => Record} u64 Eight bytes (a whole number up to 2^53).
 * @property {(part: Uint8Array) => Record} raw Bytes as they are.
 * @property {Uint8Array<ArrayBuffer>} bytes The record.
 */

/**
 * Start a record of a known length.
 *
 * @param {number} length - Its length in bytes.
 * @returns {Record} The record, each call writing after the last.
 */
function record(length) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  let at = 0;
  /** @type {Record} */
  const self = {
    u16(value) { view.setUint16(at, value, true); at += 2; return self; },
    u32(value) { view.setUint32(at, value, true); at += 4; return self; },
    u64(value) { return self.u32(value % 2 ** 32).u32(Math.floor(value / 2 ** 32)); },
    raw(part) { bytes.set(part, at); at += part.length; return self; },
    bytes,
  };
  return self;
}

/**
 * One file in the ZIP, as its headers describe it.
 *
 * @typedef {object} Entry
 * @property {Uint8Array} name The name, UTF-8.
 * @property {boolean} stored Stored (method 0) rather than deflated (method 8, with a data descriptor).
 * @property {boolean} zip64 Sizes and offset written as ZIP64.
 * @property {{time: number, day: number}} when Its time.
 * @property {number} offset Where its local header starts.
 * @property {number} crc Its CRC-32.
 * @property {number} size Its size.
 * @property {number} packed Its size in the ZIP.
 */

/**
 * The fields a local header and a central one share, from "version needed" to the name's length:
 * 26 bytes.
 *
 * @param {Entry} entry - The file.
 * @param {boolean} known - Whether to write the CRC and sizes (a deflated file's local header can't: they follow its data).
 * @param {number} extra - The extra field's length.
 * @returns {Uint8Array<ArrayBuffer>} The fields.
 */
function commonFields(entry, known, extra) {
  const size = (/** @type {number} */ value) => (entry.zip64 ? MAX_32 : known ? value : 0);
  return record(26)
    .u16(entry.zip64 ? 45 : 20)
    // Bit 11: the name is UTF-8. Bit 3: CRC and sizes follow the data.
    .u16(0x0800 | (entry.stored ? 0 : 0x0008))
    .u16(entry.stored ? 0 : 8)
    .u16(entry.when.time).u16(entry.when.day)
    .u32(known ? entry.crc : 0)
    .u32(size(entry.packed)).u32(size(entry.size))
    .u16(entry.name.length).u16(extra)
    .bytes;
}

/**
 * A file's local header. A ZIP64 one carries both sizes in its extra field (zeros when they
 * follow the data), which is also what tells a reader the data descriptor's sizes are 8 bytes.
 *
 * @param {Entry} entry - The file; a stored one's CRC and sizes known.
 * @returns {Uint8Array<ArrayBuffer>} The header.
 */
function localHeader(entry) {
  const extra = entry.zip64 ? 20 : 0;
  const header = record(30 + entry.name.length + extra).u32(0x04034B50)
    .raw(commonFields(entry, entry.stored, extra)).raw(entry.name);
  if (entry.zip64) header.u16(1).u16(16).u64(entry.stored ? entry.size : 0).u64(entry.stored ? entry.packed : 0);
  return header.bytes;
}

/**
 * What follows a deflated file's data: its CRC and sizes.
 *
 * @param {Entry} entry - The file, written.
 * @returns {Uint8Array<ArrayBuffer>} The data descriptor.
 */
function dataDescriptor(entry) {
  const descriptor = record(entry.zip64 ? 24 : 16).u32(0x08074B50).u32(entry.crc);
  if (entry.zip64) return descriptor.u64(entry.packed).u64(entry.size).bytes;
  return descriptor.u32(entry.packed).u32(entry.size).bytes;
}

/**
 * A file's entry in the central directory. A ZIP64 one marks both sizes and the offset as "in
 * the extra field" and writes all three there, in the order the format gives.
 *
 * @param {Entry} entry - The file, written.
 * @returns {Uint8Array<ArrayBuffer>} The entry.
 */
function centralHeader(entry) {
  const extra = entry.zip64 ? 28 : 0;
  const header = record(46 + entry.name.length + extra).u32(0x02014B50).u16(MADE_ON_UNIX | (entry.zip64 ? 45 : 20))
    .raw(commonFields(entry, true, extra))
    // No comment, disk 0, no internal attributes.
    .u16(0).u16(0).u16(0).u32(FILE_MODE)
    .u32(entry.zip64 ? MAX_32 : entry.offset)
    .raw(entry.name);
  if (entry.zip64) header.u16(1).u16(24).u64(entry.size).u64(entry.packed).u64(entry.offset);
  return header.bytes;
}

/**
 * The ZIP's last records: the end of the central directory, after ZIP64's own end record and
 * its locator when the plain one can't say it all (its fields then all say "see ZIP64's").
 *
 * @param {number} count - How many files.
 * @param {number} offset - Where the central directory starts.
 * @param {number} size - Its length.
 * @param {boolean} zip64 - Whether to write ZIP64's records.
 * @returns {Uint8Array<ArrayBuffer>} The records.
 */
function endRecords(count, offset, size, zip64) {
  const end = record(zip64 ? 56 + 20 + 22 : 22);
  if (zip64) {
    end.u32(0x06064B50).u64(44).u16(45).u16(45).u32(0).u32(0).u64(count).u64(count).u64(size).u64(offset);
    end.u32(0x07064B50).u32(0).u64(offset + size).u32(1);
  }
  return end.u32(0x06054B50).u16(0).u16(0)
    .u16(zip64 ? MAX_16 : count).u16(zip64 ? MAX_16 : count)
    .u32(zip64 ? MAX_32 : size).u32(zip64 ? MAX_32 : offset)
    .u16(0).bytes;
}

/**
 * A file's bytes a part at a time: a Blob's read in slices of {@link SLICE_BYTES} (so it is
 * never in memory whole), bytes already in memory as they are.
 *
 * @param {Blob | Uint8Array<ArrayBuffer>} data - The file.
 * @returns {AsyncGenerator<Uint8Array<ArrayBuffer>, void, void>} Its parts, in order.
 */
async function* partsOf(data) {
  if (!(data instanceof Blob)) {
    yield data;
    return;
  }
  for (let at = 0; at < data.size; at += SLICE_BYTES) {
    yield new Uint8Array(await data.slice(at, at + SLICE_BYTES).arrayBuffer());
  }
}

/**
 * How a ZIP is written.
 *
 * @typedef {object} ZipOptions
 * @property {boolean} [store] Store every file as it is, deflating none (a ZIP of PNGs whatever
 *   their names, or when time matters more than size). Default: by name, see {@link isStoredName}.
 * @property {boolean} [zip64] Write ZIP64 records for every file and for the ZIP's end, however
 *   small. Default: only when needed (a file of about 4 GiB or more, a ZIP that has grown past
 *   4 GiB, more than 65,535 files).
 * @property {number} [heldBytes] ZIP bytes held in memory before they're handed to the Blob.
 *   Default {@link HELD_BYTES}, 16 MiB.
 * @property {Date} [date] The files' time in the ZIP (local time, as ZIP keeps it). Default now.
 */

/**
 * How one file is written, where it differs from the ZIP's own options.
 *
 * @typedef {object} ZipEntryOptions
 * @property {boolean} [store] Store this file as it is (true), or go by its name (false) even
 *   if the ZIP stores everything.
 * @property {Date} [date] This file's time.
 */

/**
 * A ZIP being written.
 *
 * @typedef {object} ZipWriter
 * @property {(name: string, data: Blob | Uint8Array, options?: ZipEntryOptions) => Promise<void>} add
 *   Put a file in; resolves once it's written. Files are written in the order they're added,
 *   one at a time (an `add` made before the last has resolved waits for it). The name is used
 *   as it is, `/` between folders; a name already in the ZIP is refused (two files of one name
 *   extract as one), as is `add` after `finish`. A file that can't be read rejects and leaves
 *   the ZIP as it was before it. Bytes given as a `Uint8Array` are kept, not copied, until
 *   they're handed to the Blob: don't write into them again.
 * @property {() => number} count How many files are in.
 * @property {() => number} bytes Their size in all, uncompressed.
 * @property {() => Promise<Blob>} finish Close the ZIP and give it, of type `application/zip` (once).
 */

/**
 * Start a ZIP.
 *
 * @param {ZipOptions} [options] - How to write it.
 * @returns {ZipWriter} The ZIP.
 * @example
 * const zip = createZip();
 * await zip.add('Lake.jpg', blob); // stored
 * await zip.add('notes/Read me.txt', new TextEncoder().encode('Hello')); // deflated
 * const blob = await zip.finish();
 */
export function createZip(options = {}) {
  const { store = false, zip64 = false, heldBytes: limit = HELD_BYTES, date = new Date() } = options;
  const type = 'application/zip';
  const encoder = new TextEncoder();
  let blob = new Blob([], { type });
  /** @type {Uint8Array<ArrayBuffer>[]} */
  let held = [];
  let heldBytes = 0;
  /** The ZIP's length so far: where the next record goes. */
  let offset = 0;
  /** @type {Uint8Array<ArrayBuffer>[]} */
  const central = [];
  let centralBytes = 0;
  /** @type {Set<string>} */
  const names = new Set();
  let bytes = 0;
  let finished = false;
  /** @type {Promise<unknown>} */
  let last = Promise.resolve();

  /** Hand what's held to the Blob. */
  const hand = () => {
    if (!held.length) return;
    blob = new Blob([blob, ...held], { type });
    held = [];
    heldBytes = 0;
  };

  /**
   * Write bytes at the ZIP's end.
   *
   * @param {Uint8Array<ArrayBuffer>} chunk - The bytes.
   */
  const write = (chunk) => {
    held.push(chunk);
    heldBytes += chunk.length;
    offset += chunk.length;
    if (heldBytes >= limit) hand();
  };

  /**
   * Write a stored file: its CRC first, so the header before its bytes is complete.
   *
   * @param {Entry} entry - The file's entry, to fill in.
   * @param {Blob | Uint8Array<ArrayBuffer>} data - The file.
   */
  const writeStored = async (entry, data) => {
    for await (const part of partsOf(data)) entry.crc = crc32(part, entry.crc);
    write(localHeader(entry));
    let written = 0;
    for await (const part of partsOf(data)) {
      write(part);
      written += part.length;
    }
    if (written !== entry.size) throw new Error(`“${new TextDecoder().decode(entry.name)}” changed while it was being read`);
  };

  /**
   * Write a deflated file: header, the compressor's output as it comes, then CRC and sizes.
   *
   * @param {Entry} entry - The file's entry, to fill in.
   * @param {Blob | Uint8Array<ArrayBuffer>} data - The file.
   */
  const writeDeflated = async (entry, data) => {
    write(localHeader(entry));
    const { readable, writable } = new CompressionStream('deflate-raw');
    const writer = writable.getWriter();
    const reading = (async () => {
      const reader = readable.getReader();
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        entry.packed += read.value.length;
        write(/** @type {Uint8Array<ArrayBuffer>} */ (read.value));
      }
    })();
    // The reason is thrown below, by whichever side failed first.
    reading.catch(() => {});
    try {
      for await (const part of partsOf(data)) {
        entry.crc = crc32(part, entry.crc);
        await writer.write(part);
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      await reading.catch(() => {});
      throw error;
    }
    await reading;
    if (!entry.zip64 && entry.packed >= MAX_32) throw new Error('A deflated file passed 4 GiB without ZIP64');
    write(dataDescriptor(entry));
  };

  /**
   * Write one file, or leave the ZIP as it was.
   *
   * @param {Uint8Array} name - Its name, UTF-8.
   * @param {Blob | Uint8Array<ArrayBuffer>} data - The file.
   * @param {boolean} stored - Stored rather than deflated.
   * @param {Date} when - Its time.
   */
  const writeEntry = async (name, data, stored, when) => {
    const size = data instanceof Blob ? data.size : data.length;
    const start = offset;
    /** @type {Entry} */
    const entry = {
      // Nothing to deflate in an empty file, and no descriptor needed after it.
      name, stored: stored || size === 0, when: dosTime(when), offset: start, crc: 0, size, packed: stored ? size : 0,
      zip64: zip64 || size >= ZIP64_FILE_BYTES || start >= MAX_32,
    };
    // A small Blob is read once; a big one in slices, twice when it's stored.
    const source = data instanceof Blob && size <= SLICE_BYTES ? new Uint8Array(await data.arrayBuffer()) : data;
    try {
      await (entry.stored ? writeStored(entry, source) : writeDeflated(entry, source));
    } catch (error) {
      // What was written of it goes: the ZIP is still a ZIP of the files before.
      hand();
      blob = blob.slice(0, start, type);
      offset = start;
      throw error;
    }
    const header = centralHeader(entry);
    central.push(header);
    centralBytes += header.length;
    bytes += size;
  };

  return {
    async add(name, data, entryOptions = {}) {
      if (finished) throw new Error(`The ZIP is finished: “${name}” can't be added`);
      if (names.has(name)) throw new Error(`The ZIP already has a file named “${name}”`);
      const encoded = encoder.encode(name);
      if (!encoded.length || encoded.length > MAX_16) throw new Error(`A ZIP's file names are 1 to 65,535 bytes: “${name.slice(0, 80)}”`);
      if (!(data instanceof Blob) && !(data instanceof Uint8Array)) throw new TypeError(`“${name}” is neither a Blob nor a Uint8Array`);
      names.add(name);
      const stored = entryOptions.store ?? (store || isStoredName(name));
      const written = last.then(() => writeEntry(encoded, /** @type {Blob | Uint8Array<ArrayBuffer>} */ (data), stored, entryOptions.date ?? date));
      last = written.catch(() => { names.delete(name); });
      await written;
    },
    count: () => central.length,
    bytes: () => bytes,
    async finish() {
      if (finished) throw new Error('The ZIP is finished already');
      finished = true;
      await last;
      const start = offset;
      const count = central.length;
      for (const header of central) write(header);
      write(endRecords(count, start, centralBytes, zip64 || count > MAX_16 || start >= MAX_32 || centralBytes >= MAX_32));
      hand();
      return blob;
    },
  };
}
