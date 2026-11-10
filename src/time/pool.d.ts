/**
 * Working through a list a few at a time: files fetched by an extension page,
 * or a live check of many sites, each in one of a few browsers. Runs
 * anywhere (worker, page, Node).
 *
 * @module time/pool
 */
/**
 * Run `work` on every item, at most `limit` at once, each slot taking the
 * next item as it finishes one. Errors are `work`'s to handle: one that
 * throws stops its slot, and the returned promise rejects once the others
 * are done.
 *
 * @template T
 * @param {readonly T[]} items - The items.
 * @param {number} limit - At most this many at once.
 * @param {(item: T, slot: number, index: number) => Promise<void>} work - Deals with one item;
 *   `slot` (0 to limit − 1) is the same for everything one slot does, for per-slot resources
 *   (a browser each).
 * @returns {Promise<void>} Once every item is done.
 * @example
 * await eachLimited(sites, 3, async (site, slot) => check(site, browsers[slot]));
 */
export declare function eachLimited<T>(items: readonly T[], limit: number, work: (item: T, slot: number, index: number) => Promise<void>): Promise<void>;
