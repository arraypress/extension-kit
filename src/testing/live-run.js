/**
 * A live checker's run: the command line read (`parseLiveOptions`), the
 * sites chosen, where the traffic leaves for the internet printed, then each
 * site visited in a browser with the extension loaded, a few at once (one
 * browser a slot, launched on first use, passing for a person's), each within
 * a time limit (a browser whose page ran out of time is replaced), Ctrl-C
 * closing every browser. What a visit checks, and the report, are the
 * checker's own.
 *
 * @module testing/live-run
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deadline, within } from '../time/time.js';
import { eachLimited } from '../time/pool.js';
import { chromeUserAgent, closeOnSignal, realisticBrowser } from './browser.js';
import { launchExtension } from './e2e.js';
import { exitPoint, parseLiveOptions } from './live.js';

/** @import { BrowserType, Page } from 'playwright' */
/** @import { LaunchedExtension } from './e2e.js' */
/** @import { Exit } from './live.js' */

/**
 * A site a checker visits.
 *
 * @typedef {{name: string, url: string, category: string}} LiveSite
 */

/**
 * A finished run, for the checker's report.
 *
 * @template {LiveSite} S
 * @template R
 * @typedef {object} LiveRun
 * @property {string} dir The report's folder (made empty).
 * @property {string} started When it started (ISO).
 * @property {string} finished When it finished (ISO).
 * @property {Exit | null} exit Where the traffic left.
 * @property {{locale: string, timezone: string, proxy: string}} browser How the browsers looked.
 * @property {{site: S, visit: R}[]} results Each site's visit, in the sites' order.
 */

/**
 * A live checker's usage text.
 *
 * @param {string[]} categories - The categories' ids.
 * @param {number} concurrency - The default and most sites at once.
 * @returns {string} The text.
 */
export const liveUsage = (categories, concurrency) => `Usage: npm run live -- [options] [word …]

  --only <word>        only pages whose address or name contains it (repeatable; bare words too)
  --category <id>      only this category (repeatable): ${categories.join(', ')}
  --concurrency <n>    pages checked at once (default ${concurrency}, at most ${concurrency})
  --proxy <url>        send everything through this proxy (default: HTTPS_PROXY)
  --locale <tag>       browser language (default en-GB)
  --timezone <zone>    browser time zone (default Europe/London)
  --out <dir>          write the report there (default test/live/report)
  --help`;

/** The file that marks a folder as a live report the kit made, so the next run may replace it. */
export const REPORT_MARKER = '.live-report';

/**
 * The folder a run's report goes in, made empty. Only a folder the kit made is ever emptied:
 * the checker's own (`own`), or one carrying {@link REPORT_MARKER} from an earlier run. A new
 * or empty folder is taken (and marked); a folder with anything else in it is refused, so
 * `--out .` or `--out ~/Desktop` can't delete what's there.
 *
 * @param {string} dir - The folder.
 * @param {{own?: boolean}} [options] - `own`: the checker's default folder, replaced without asking.
 * @returns {Promise<string>} `dir`, empty but for the marker.
 * @throws {Error} When the folder holds files and isn't a report folder.
 *
 * @example
 * await reportFolder('/tmp/report'); // made, or emptied if an earlier run made it
 */
export async function reportFolder(dir, { own = false } = {}) {
  const entries = await readdir(dir).catch(() => /** @type {string[]} */ ([]));
  if (entries.length && !own && !entries.includes(REPORT_MARKER)) {
    throw new Error(`${dir} has files in it and isn't a report folder: choose a new or empty folder for --out`);
  }
  if (entries.length) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, REPORT_MARKER), 'A live check\'s report: the next run replaces this folder.\n');
  return dir;
}

/** Stands for a visit that ran out of time. */
const LATE = Symbol('late');

/**
 * Run a live check: read the command line, visit the chosen sites, give back every visit.
 * Prints the usage and exits for `--help` (or an option it doesn't know), and exits when no
 * site matches or `--out` names a folder with other files in it ({@link reportFolder}). A visit
 * that throws, runs out of time or loses its browser is `failed` with why, and the run goes on
 * (the slot gets a new browser).
 *
 * @template {LiveSite} S
 * @template R
 * @param {object} run
 * @param {BrowserType} run.chromium - Playwright's chromium.
 * @param {string} run.build - The extension's live test build (every site granted).
 * @param {string} run.prefix - The browsers' profile prefix.
 * @param {string} run.root - The extension's repository (the report goes in `test/live/report`).
 * @param {S[]} run.sites - Every site.
 * @param {string[]} run.categories - The categories' ids, for the usage.
 * @param {number} run.pageMs - The most a visit may take.
 * @param {(browser: LaunchedExtension, page: Page, site: S) => Promise<R>} run.visit - Check one site, on a fresh page.
 * @param {(site: S, error: string) => R} run.failed - A visit that couldn't finish: `'timed out'`, or the error's message.
 * @param {(result: {site: S, visit: R}) => void} [run.onResult] - Each visit as it finishes (a line of output).
 * @param {{argv?: string[], env?: Record<string, string | undefined>, concurrency?: number, findExit?: typeof exitPoint}} [run.command] - The
 *   arguments and environment (default the process's), the most sites at once (default 4), and how the exit point
 *   is found (default `exitPoint`, which asks a lookup service).
 * @returns {Promise<LiveRun<S, R>>} The run.
 * @example
 * const run = await runLiveCheck({ chromium, build: BUILDS.live, prefix: 'better-colors-live-', root, sites: allSites(),
 *   categories: CATEGORIES.map((c) => c.id), pageMs: 120_000, visit: (browser, page, site) => visit(browser, page, site.url),
 *   failed: (site, error) => ({ url: site.url, error }), onResult: (result) => console.log(pageLine(result)) });
 */
export async function runLiveCheck({ chromium, build, prefix, root, sites, categories, pageMs, visit, failed, onResult = () => {}, command = {} }) {
  const { argv = process.argv.slice(2), env = process.env, concurrency = 4, findExit = exitPoint } = command;
  const usage = liveUsage(categories, concurrency);
  /** @type {import('./live.js').LiveOptions} */
  let options;
  try {
    options = parseLiveOptions(argv, env, { usage, concurrency, maxConcurrency: concurrency });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
  if (options.help) {
    console.log(usage);
    process.exit(0);
  }
  const words = options.only.map((word) => word.toLowerCase());
  const chosen = sites.filter((site) => (!options.categories.length || options.categories.includes(site.category))
    && (!words.length || words.some((word) => site.url.toLowerCase().includes(word) || site.name.toLowerCase().includes(word))));
  if (!chosen.length) {
    console.error('No pages match.');
    process.exit(2);
  }
  /** @type {string} */
  let dir;
  try {
    dir = await reportFolder(options.out ? path.resolve(options.out) : path.join(root, 'test', 'live', 'report'), { own: !options.out });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }

  const browserOptions = realisticBrowser(options.proxy ? { proxy: options.proxy } : {});
  const plain = await chromium.launch({ channel: 'chromium', ...browserOptions });
  /** @type {(LaunchedExtension | null)[]} */
  const browsers = [];
  const closeAll = async () => {
    await Promise.allSettled([plain.close(), ...browsers.map((launched) => launched?.close())]);
  };
  const forget = closeOnSignal(closeAll);
  try {
    const userAgent = await chromeUserAgent(plain);
    const probe = await plain.newContext();
    const exit = await findExit(probe.request);
    await probe.close();
    console.log(exit ? `Exit: ${exit.country} (${exit.ip}${exit.where ? `, ${exit.where}` : ''})${options.proxyLabel ? ` through ${options.proxyLabel}` : ''}` : 'Exit: unknown');
    console.log(`Pages: ${chosen.length}, ${options.concurrency} at a time.\n`);
    const launchOptions = { ...browserOptions, userAgent, locale: options.locale, timezoneId: options.timezone, viewport: { width: 1280, height: 900 } };
    const started = new Date().toISOString();
    /** @type {{site: S, visit: R}[]} */
    const results = [];
    await eachLimited(chosen, options.concurrency, async (site, slot, index) => {
      /** @type {R} */
      let outcome;
      try {
        browsers[slot] ??= await launchExtension(chromium, build, { prefix: `${prefix}${slot}-`, ...launchOptions });
        const launched = /** @type {LaunchedExtension} */ (browsers[slot]);
        await within(launched.context.clearCookies(), 10_000, undefined);
        const page = await launched.context.newPage();
        try {
          const result = await deadline(/** @type {Promise<R | typeof LATE>} */ (visit(launched, page, site)), pageMs, (resolve) => resolve(LATE));
          if (result === LATE) throw new Error('timed out');
          outcome = result;
        } finally {
          await within(page.close(), 15_000, undefined);
        }
      } catch (error) {
        // A visit that failed may have left its browser stuck, or lost it: the slot gets a new one.
        await within(Promise.resolve(browsers[slot]?.close()), 15_000, undefined);
        browsers[slot] = null;
        outcome = failed(site, error instanceof Error ? error.message : String(error));
      }
      results[index] = { site, visit: outcome };
      onResult(results[index]);
    });
    return {
      dir, started, finished: new Date().toISOString(), exit,
      browser: { locale: options.locale, timezone: options.timezone, proxy: options.proxyLabel },
      results: results.filter(Boolean),
    };
  } finally {
    forget();
    await closeAll();
  }
}
