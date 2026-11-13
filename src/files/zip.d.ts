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
/** ZIP bytes held in memory before they're handed to the Blob: 16 MiB. */
export declare const HELD_BYTES: number;
/** How much of a Blob is read at a time: 4 MiB. A smaller Blob is read whole. */
export declare const SLICE_BYTES: number;
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
export declare function crc32(bytes: Uint8Array, seed?: number): number;
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
export declare function isStoredName(name: string): boolean;
export type Record = {
    /**
     * Two bytes.
     */
    u16: (value: number) => Record;
    /**
     * Four bytes.
     */
    u32: (value: number) => Record;
    /**
     * Eight bytes (a whole number up to 2^53).
     */
    u64: (value: number) => Record;
    /**
     * Bytes as they are.
     */
    raw: (part: Uint8Array) => Record;
    /**
     * The record.
     */
    bytes: Uint8Array<ArrayBuffer>;
};
export type Entry = {
    /**
     * The name, UTF-8.
     */
    name: Uint8Array;
    /**
     * Stored (method 0) rather than deflated (method 8, with a data descriptor).
     */
    stored: boolean;
    /**
     * Sizes and offset written as ZIP64.
     */
    zip64: boolean;
    /**
     * Its time.
     */
    when: {
        time: number;
        day: number;
    };
    /**
     * Where its local header starts.
     */
    offset: number;
    /**
     * Its CRC-32.
     */
    crc: number;
    /**
     * Its size.
     */
    size: number;
    /**
     * Its size in the ZIP.
     */
    packed: number;
};
export type ZipOptions = {
    /**
     * Store every file as it is, deflating none (a ZIP of PNGs whatever
     * their names, or when time matters more than size). Default: by name, see {@link isStoredName}.
     */
    store?: boolean;
    /**
     * Write ZIP64 records for every file and for the ZIP's end, however
     * small. Default: only when needed (a file of about 4 GiB or more, a ZIP that has grown past
     * 4 GiB, more than 65,535 files).
     */
    zip64?: boolean;
    /**
     * ZIP bytes held in memory before they're handed to the Blob.
     * Default {@link HELD_BYTES}, 16 MiB.
     */
    heldBytes?: number;
    /**
     * The files' time in the ZIP (local time, as ZIP keeps it). Default now.
     */
    date?: Date;
};
export type ZipEntryOptions = {
    /**
     * Store this file as it is (true), or go by its name (false) even
     * if the ZIP stores everything.
     */
    store?: boolean;
    /**
     * This file's time.
     */
    date?: Date;
};
export type ZipWriter = {
    /**
     *   Put a file in; resolves once it's written. Files are written in the order they're added,
     *   one at a time (an `add` made before the last has resolved waits for it). The name is used
     *   as it is, `/` between folders; a name already in the ZIP is refused (two files of one name
     *   extract as one), as is `add` after `finish`. A file that can't be read rejects and leaves
     *   the ZIP as it was before it. Bytes given as a `Uint8Array` are kept, not copied, until
     *   they're handed to the Blob: don't write into them again.
     */
    add: (name: string, data: Blob | Uint8Array, options?: ZipEntryOptions) => Promise<void>;
    /**
     * How many files are in.
     */
    count: () => number;
    /**
     * Their size in all, uncompressed.
     */
    bytes: () => number;
    /**
     * Close the ZIP and give it, of type `application/zip` (once).
     */
    finish: () => Promise<Blob>;
};
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
export declare function createZip(options?: ZipOptions): ZipWriter;
