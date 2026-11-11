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
import { exitPoint } from './live.js';
import type { BrowserType, Page } from 'playwright';
import type { LaunchedExtension } from './e2e.js';
import type { Exit } from './live.js';
export type LiveSite = {
    name: string;
    url: string;
    category: string;
};
export type LiveRun<S extends LiveSite, R> = {
    /**
     * The report's folder (made empty).
     */
    dir: string;
    /**
     * When it started (ISO).
     */
    started: string;
    /**
     * When it finished (ISO).
     */
    finished: string;
    /**
     * Where the traffic left.
     */
    exit: Exit | null;
    /**
     * How the browsers looked.
     */
    browser: {
        locale: string;
        timezone: string;
        proxy: string;
    };
    /**
     * Each site's visit, in the sites' order.
     */
    results: {
        site: S;
        visit: R;
    }[];
};
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
export declare const liveUsage: (categories: string[], concurrency: number) => string;
/**
 * Run a live check: read the command line, visit the chosen sites, give back every visit.
 * Prints the usage and exits for `--help` (or an option it doesn't know), and exits when no
 * site matches.
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
 * @param {(site: S, error: string) => R} run.failed - A visit that couldn't finish (`'timed out'`).
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
export declare function runLiveCheck<S extends LiveSite, R>({ chromium, build, prefix, root, sites, categories, pageMs, visit, failed, onResult, command }: {
    chromium: BrowserType;
    build: string;
    prefix: string;
    root: string;
    sites: S[];
    categories: string[];
    pageMs: number;
    visit: (browser: LaunchedExtension, page: Page, site: S) => Promise<R>;
    failed: (site: S, error: string) => R;
    onResult?: (result: {
        site: S;
        visit: R;
    }) => void;
    command?: {
        argv?: string[];
        env?: Record<string, string | undefined>;
        concurrency?: number;
        findExit?: typeof exitPoint;
    };
}): Promise<LiveRun<S, R>>;
