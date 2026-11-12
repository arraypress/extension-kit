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
export const BLOCK_CHARS = 4000;

/** How long one slice may run before the page gets the main thread back (ms), by default. Shorter slices cost more layout in all. */
export const SLICE_MS = 40;

/** Elements whose text is never the page's content: not cut into, nor handed over as blocks. */
const NOT_CONTENT = new Set(['script', 'style', 'noscript', 'template']);

/**
 * The blocks of a part of the page, one at a time as they're asked for: the cutting (each
 * level's text measured) is spread over the slices with the work, not done whole before the
 * first. A level's children are listed when it's reached, so what the work adds beside a block
 * isn't handed back to it.
 *
 * @param {Node} node - The part.
 * @param {number} blockChars - The most text a block holds.
 * @returns {Generator<Node, void, void>} The blocks, in page order.
 */
function* cut(node, blockChars) {
  if (node.nodeType !== 1 || (node.textContent ?? '').length <= blockChars || !node.firstChild) {
    yield node;
    return;
  }
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 1 && NOT_CONTENT.has(/** @type {Element} */ (child).localName)) continue;
    yield* cut(child, blockChars);
  }
}

/**
 * The blocks of a part of the page: itself if small enough, else its
 * children's blocks (its own text nodes as blocks of their own). Scripts,
 * styles and templates inside a part that's cut are left out: their text
 * isn't the page's.
 *
 * @param {Node} root - The part.
 * @param {number} [blockChars] - The most text a block holds. Default {@link BLOCK_CHARS}.
 * @returns {Node[]} The blocks, in page order.
 * @example
 * blocksOf(document.body).length; // 1 for a short page, one per card for a long listing
 */
export function blocksOf(root, blockChars = BLOCK_CHARS) {
  return [...cut(root, blockChars)];
}

/**
 * Hand the main thread back to the page: a macrotask later.
 *
 * @returns {Promise<void>}
 */
const nextTask = () => new Promise((resolve) => { setTimeout(resolve, 0); });

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
export async function eachInSlices(items, work, { sliceMs = SLICE_MS, pause = nextTask, now = () => performance.now() } = {}) {
  let started = now();
  let index = 0;
  for (const item of items) {
    work(item, index++);
    if (now() - started > sliceMs) {
      await pause();
      started = now();
    }
  }
}

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
export function inSlices(root, work, { blockChars = BLOCK_CHARS, ...options } = {}) {
  // A block the work before took out of the page is skipped.
  return eachInSlices(cut(root, blockChars), (block) => { if (block.isConnected) work(block); }, options);
}
