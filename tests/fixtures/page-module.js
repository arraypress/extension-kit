/**
 * A module `callInPage` imports in tests, as a content script's would be.
 *
 * @module tests/fixtures/page-module
 */

/** @type {unknown[]} */
export const calls = [];

/**
 * Remember the call and answer with its arguments.
 *
 * @param {...unknown} args - Anything.
 * @returns {Promise<{echo: unknown[], calls: number}>} The arguments and how many calls so far.
 */
export async function echo(...args) {
  calls.push(args);
  return { echo: args, calls: calls.length };
}
