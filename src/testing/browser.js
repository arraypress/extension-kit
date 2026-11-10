/**
 * A browser that passes for a person's: for live checks against real sites,
 * many of which turn away a browser that says it's automated (a
 * "HeadlessChrome" user agent, `navigator.webdriver`), or show it something
 * else. And closing every browser a run started when it's stopped (Ctrl-C,
 * a kill), so nothing is left running.
 *
 * @module testing/browser
 */

import { within } from './time.js';

/** @import { Browser } from 'playwright' */

/** The switch that hides `navigator.webdriver` and Blink's other automation tells. */
const NOT_AUTOMATED = '--disable-blink-features=AutomationControlled';

/**
 * Launch options (for `chromium.launch`, `launchExtension` or
 * `extensionProfile`) for a browser that doesn't announce it's automated:
 * Blink's automation tells off, and without Playwright's
 * `--enable-automation` (the "controlled by automated test software" bar).
 * Pair it with {@link chromeUserAgent} for the user agent.
 *
 * @template {{args?: string[], ignoreDefaultArgs?: boolean | string[]} & Record<string, unknown>} O
 * @param {O} [options] - Other launch options (`proxy`, `userAgent`, `locale`, …), kept.
 * @returns {Omit<O, 'args' | 'ignoreDefaultArgs'> & {args: string[], ignoreDefaultArgs: string[]}} The
 *   options, with the switches added.
 * @example
 * const plain = await chromium.launch(realisticBrowser({ proxy }));
 * const launched = await launchExtension(chromium, build, realisticBrowser({ userAgent: await chromeUserAgent(plain) }));
 */
export function realisticBrowser(options) {
  const { args = [], ignoreDefaultArgs, ...rest } = options ?? /** @type {O} */ ({});
  const ignored = Array.isArray(ignoreDefaultArgs) ? ignoreDefaultArgs : [];
  return { ...rest, args: [...args, NOT_AUTOMATED], ignoreDefaultArgs: [...ignored, '--enable-automation'] };
}

/**
 * The browser's user agent as ordinary Chrome's: "HeadlessChrome" (what
 * headless mode sends) made "Chrome", the version kept.
 *
 * @param {Browser} browser - A launched Chromium.
 * @returns {Promise<string>} The user agent to give its contexts (`userAgent`).
 */
export async function chromeUserAgent(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return (await page.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  } finally {
    await context.close();
  }
}

/** The signals a run is stopped with, and their exit codes (128 + the signal's number). */
const SIGNALS = /** @type {const} */ ([['SIGINT', 130], ['SIGTERM', 143]]);

/**
 * On Ctrl-C or a kill, run `close` (given `ms` at most) and exit, so the
 * browsers a run started don't outlive it.
 *
 * @param {() => Promise<unknown>} close - Closes everything (`Promise.allSettled` of each close, say).
 * @param {number} [ms] - How long `close` may take. Default 10 s.
 * @returns {() => void} Takes the handlers off again (call it once the run has closed everything itself).
 * @example
 * const stop = closeOnSignal(() => Promise.allSettled([plain.close(), launched.close()]));
 * try { … } finally { stop(); await plain.close(); await launched.close(); }
 */
export function closeOnSignal(close, ms = 10_000) {
  /** @type {[string, () => void][]} */
  const handlers = SIGNALS.map(([signal, code]) => [signal, () => {
    within(Promise.resolve().then(close), ms, undefined).finally(() => process.exit(code));
  }]);
  for (const [signal, handler] of handlers) process.once(signal, handler);
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}
