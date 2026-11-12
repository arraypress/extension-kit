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
 * @param {number} limit - At most this many at once (at least one: a limit of 0 or less, or one
 *   that isn't a number, runs them one at a time rather than not at all).
 * @param {(item: T, slot: number, index: number) => Promise<void>} work - Deals with one item;
 *   `slot` (0 to limit − 1) is the same for everything one slot does, for per-slot resources
 *   (a browser each).
 * @returns {Promise<void>} Once every item is done.
 * @example
 * await eachLimited(sites, 3, async (site, slot) => check(site, browsers[slot]));
 */
export async function eachLimited(items, limit, work) {
  let next = 0;
  const slots = Math.max(1, Math.floor(limit) || 1);
  await Promise.all(Array.from({ length: Math.min(slots, items.length) }, async (_, slot) => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index], slot, index);
    }
  }));
}
