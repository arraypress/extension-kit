/**
 * A browser that passes for a person's: for live checks against real sites,
 * many of which turn away a browser that says it's automated (a
 * "HeadlessChrome" user agent, `navigator.webdriver`), or show it something
 * else. And closing every browser a run started when it's stopped (Ctrl-C,
 * a kill), so nothing is left running.
 *
 * @module testing/browser
 */
import type { Browser } from 'playwright';
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
export declare function realisticBrowser<O extends {
    args?: string[];
    ignoreDefaultArgs?: boolean | string[];
} & Record<string, unknown>>(options?: O): Omit<O, 'args' | 'ignoreDefaultArgs'> & {
    args: string[];
    ignoreDefaultArgs: string[];
};
/**
 * The browser's user agent as ordinary Chrome's: "HeadlessChrome" (what
 * headless mode sends) made "Chrome", the version kept.
 *
 * @param {Browser} browser - A launched Chromium.
 * @returns {Promise<string>} The user agent to give its contexts (`userAgent`).
 */
export declare function chromeUserAgent(browser: Browser): Promise<string>;
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
export declare function closeOnSignal(close: () => Promise<unknown>, ms?: number): () => void;
