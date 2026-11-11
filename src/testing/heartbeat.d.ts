/**
 * How long a page's main thread is held, for performance checks: a heartbeat in the page. From
 * Topicless' and Better Screenshots' e2e helpers.
 *
 * @module testing/heartbeat
 */
import type { Page } from 'playwright';
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
export declare function heartbeat(page: Page): Promise<() => Promise<number>>;
