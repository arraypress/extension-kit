/**
 * How long a page's main thread is held, for performance checks: a heartbeat in the page. From
 * Topicless' and Better Screenshots' e2e helpers.
 *
 * @module testing/heartbeat
 */

/** @import { Page } from 'playwright' */

/**
 * Start a heartbeat in a page: a timer that fires again and again, costing nothing between
 * beats; the longest gap between two is the longest the main thread was held (the Long Tasks
 * API misses an extension's isolated world's work, and a `MessageChannel` heartbeat counts as
 * task time itself). Gaps while the tab is hidden (another tab in front) don't count: Chrome
 * throttles a hidden tab's timers.
 *
 * @param {Page} page - The page.
 * @returns {Promise<() => Promise<number>>} Stops it and gives the longest gap (ms).
 * @example
 * const stop = await heartbeat(page);
 * await doTheWork();
 * const held = await stop(); // e.g. 17
 */
export async function heartbeat(page) {
  await page.evaluate(() => {
    const beat = { longest: 0, running: true };
    Object.assign(window, { extensionKitBeat: beat });
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      // A hidden tab's timers are throttled by Chrome: those gaps aren't the page being held.
      if (!document.hidden) beat.longest = Math.max(beat.longest, now - last);
      last = now;
      if (beat.running) setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });
  return () => page.evaluate(() => {
    const beat = /** @type {{longest: number, running: boolean}} */ (/** @type {any} */ (window).extensionKitBeat);
    beat.running = false;
    return beat.longest;
  });
}
