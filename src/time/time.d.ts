/**
 * Time limits for work that may never finish: a Chrome call a service worker
 * shouldn't wait on forever, or, in tests that drive a real browser, a page
 * that stops responding. Runs anywhere (worker, page, Node).
 *
 * @module time/time
 */
/**
 * Settle `promise` within `ms`, or settle the way `late` says. The timer is
 * cleared as soon as either happens, so a finished run isn't kept waiting
 * for it. The work itself isn't stopped.
 *
 * @template T
 * @param {Promise<T>} promise - The work.
 * @param {number} ms - The limit.
 * @param {(resolve: (value: T) => void, reject: (error: Error) => void) => void} late - Runs when the
 *   limit passes first.
 * @returns {Promise<T>} The work's outcome, or `late`'s.
 */
export declare function deadline<T>(promise: Promise<T>, ms: number, late: (resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T>;
/**
 * A promise's value within a time limit, or `fallback` when it's late or
 * fails: for a step to give up on and go past (a Chrome call that never
 * answers, a renderer that stopped responding, a close that never returns).
 * The work itself isn't stopped; the timer is cleared once it settles.
 *
 * @template T
 * @param {Promise<T>} promise - The work.
 * @param {number} ms - The limit.
 * @param {T} fallback - What to give if it's late or fails.
 * @returns {Promise<T>} Its value, or the fallback. Never rejects.
 * @example
 * const list = await within(handled(worker, page), 8000, []);
 * await within(page.close(), 15000, undefined);
 */
export declare function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T>;
