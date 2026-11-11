/**
 * A content script's first look at a big page, in slices: the page is cut
 * into blocks of at most `blockChars` characters of text (a long listing's
 * cards, a long article's paragraphs), each handed whole to the caller's
 * work, and the main thread is handed back to the page every `sliceMs`, so
 * a 2,000-item page never freezes. From Better Prices (`content/slices.js`),
 * shared with Topicless.
 *
 * @module content/slices
 */
/** The most text one block holds (characters), by default. */
export declare const BLOCK_CHARS = 4000;
/** How long one slice may run before the page gets the main thread back (ms), by default. Shorter slices cost more layout in all. */
export declare const SLICE_MS = 40;
/**
 * The blocks of a part of the page: itself if small enough, else its
 * children's blocks (its own text nodes as blocks of their own).
 *
 * @param {Node} root - The part.
 * @param {number} [blockChars] - The most text a block holds. Default {@link BLOCK_CHARS}.
 * @returns {Node[]} The blocks, in page order.
 * @example
 * blocksOf(document.body).length; // 1 for a short page, one per card for a long listing
 */
export declare function blocksOf(root: Node, blockChars?: number): Node[];
export type SliceOptions = {
    /**
     * The most text a block holds. Default {@link BLOCK_CHARS}.
     */
    blockChars?: number;
    /**
     * How long a slice may run. Default {@link SLICE_MS}.
     */
    sliceMs?: number;
    /**
     * Hands the main thread back. Default: a macrotask.
     */
    pause?: () => Promise<void>;
    /**
     * The clock. Default `performance.now`.
     */
    now?: () => number;
};
/**
 * @typedef {object} SliceOptions
 * @property {number} [blockChars] The most text a block holds. Default {@link BLOCK_CHARS}.
 * @property {number} [sliceMs] How long a slice may run. Default {@link SLICE_MS}.
 * @property {() => Promise<void>} [pause] Hands the main thread back. Default: a macrotask.
 * @property {() => number} [now] The clock. Default `performance.now`.
 */
/**
 * Work through any list in slices: `work(item, index)` on each, the main
 * thread handed back whenever a slice has run `sliceMs`. For a content
 * script's work that isn't cut by blocks of the page (each element's style
 * read, each text measured).
 *
 * @template T
 * @param {Iterable<T>} items - The items.
 * @param {(item: T, index: number) => void} work - What to do with one.
 * @param {Pick<SliceOptions, 'sliceMs' | 'pause' | 'now'>} [options] - Slice length, how to pause, the clock.
 * @returns {Promise<void>} Once every item is done.
 * @example
 * await eachInSlices(elements, (element) => styles.push(getComputedStyle(element).fontFamily));
 */
export declare function eachInSlices<T>(items: Iterable<T>, work: (item: T, index: number) => void, { sliceMs, pause, now }?: Pick<SliceOptions, 'sliceMs' | 'pause' | 'now'>): Promise<void>;
/**
 * Work through a part of the page in slices: `work(block)` on each block
 * still in the page, the main thread handed back whenever a slice has run
 * `sliceMs`.
 *
 * @param {Node} root - The part (the body).
 * @param {(block: Node) => void} work - What to do with one block.
 * @param {SliceOptions} [options] - Block size, slice length, how to pause.
 * @returns {Promise<void>} Once every block is done.
 * @example
 * await inSlices(document.body, (block) => scanner.scan(block));
 */
export declare function inSlices(root: Node, work: (block: Node) => void, { blockChars, ...options }?: SliceOptions): Promise<void>;
