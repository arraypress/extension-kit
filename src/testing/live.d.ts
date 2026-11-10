/**
 * What a live checker (a run over real sites, never in CI) shares: its
 * command line (which sites, how many at once, a proxy, how the browser
 * looks) and where its traffic leaves for the internet, which decides what
 * many sites show (cookie banners, prices, currency).
 *
 * @module testing/live
 */
import type { APIRequestContext } from 'playwright';
export type Proxy = {
    /**
     * e.g. "http://uk.example.net:8080" or "socks5://127.0.0.1:1080".
     */
    server: string;
    /**
     * From the address, if it has one.
     */
    username?: string;
    /**
     * From the address, if it has one.
     */
    password?: string;
};
export type LiveOptions = {
    /**
     * Only sites whose address or name contains one of these (any case).
     */
    only: string[];
    /**
     * Only these categories (by id).
     */
    categories: string[];
    /**
     * Sites checked at once.
     */
    concurrency: number;
    /**
     * The proxy every request goes through.
     */
    proxy: Proxy | null;
    /**
     * The proxy's address without its password, for the output.
     */
    proxyLabel: string;
    /**
     * The browser's language (navigator.language, Accept-Language).
     */
    locale: string;
    /**
     * The browser's time zone.
     */
    timezone: string;
    /**
     * Where the report goes ('' for the checker's default).
     */
    out: string;
    /**
     * Show the usage and stop.
     */
    help: boolean;
};
/** @import { APIRequestContext } from 'playwright' */
/**
 * A proxy, as Playwright takes it.
 *
 * @typedef {object} Proxy
 * @property {string} server e.g. "http://uk.example.net:8080" or "socks5://127.0.0.1:1080".
 * @property {string} [username] From the address, if it has one.
 * @property {string} [password] From the address, if it has one.
 */
/**
 * A live checker's options.
 *
 * @typedef {object} LiveOptions
 * @property {string[]} only Only sites whose address or name contains one of these (any case).
 * @property {string[]} categories Only these categories (by id).
 * @property {number} concurrency Sites checked at once.
 * @property {Proxy | null} proxy The proxy every request goes through.
 * @property {string} proxyLabel The proxy's address without its password, for the output.
 * @property {string} locale The browser's language (navigator.language, Accept-Language).
 * @property {string} timezone The browser's time zone.
 * @property {string} out Where the report goes ('' for the checker's default).
 * @property {boolean} help Show the usage and stop.
 */
/**
 * Read a proxy address.
 *
 * @param {string} address - e.g. "http://user:pass@host:3128".
 * @returns {{ proxy: Proxy, label: string }} For Playwright, and for the output (no password).
 * @throws {Error} When it isn't an address.
 * @example
 * parseProxy('http://me:secret@uk.example:8080').label; // 'http://me:•••@uk.example:8080'
 */
export declare function parseProxy(address: string): {
    proxy: Proxy;
    label: string;
};
/**
 * Read a live checker's command line: `--only <word>` (repeatable, or bare
 * words), `--category <id>` (repeatable), `--concurrency <n>`, `--proxy <url>`
 * (default `HTTPS_PROXY`), `--locale <tag>`, `--timezone <zone>`, `--out <dir>`,
 * `--help`. A value may follow an `=` ("--only=amazon"); commas list several.
 *
 * @param {readonly string[]} argv - The arguments after the script.
 * @param {Readonly<Record<string, string | undefined>>} env - The environment (HTTPS_PROXY, https_proxy).
 * @param {{ usage: string, concurrency?: number, maxConcurrency?: number, locale?: string, timezone?: string }} defaults - The
 *   usage text (shown with an unknown option), and the defaults: 3 at once (at most 8), en-GB, Europe/London.
 * @returns {LiveOptions} The options.
 * @throws {Error} On an unknown option or a bad value.
 * @example
 * parseLiveOptions(['--category', 'shops', 'amazon'], {}, { usage }).only; // ['amazon']
 */
export declare function parseLiveOptions(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, { usage, concurrency, maxConcurrency, locale, timezone }: {
    usage: string;
    concurrency?: number;
    maxConcurrency?: number;
    locale?: string;
    timezone?: string;
}): LiveOptions;
export type Exit = {
    /**
     * The public address.
     */
    ip: string;
    /**
     * Its ISO country code ("GB", "TH").
     */
    country: string;
    /**
     * Readable: city and organisation, where the service says.
     */
    where: string;
    /**
     * The service that answered.
     */
    source: string;
};
/**
 * Where the browser's traffic leaves for the internet: its public IP's
 * country, asked once through the same proxy the browser uses. Sites go by
 * that address, not the browser's language or time zone.
 *
 * @param {APIRequestContext} request - A browser context's `request` (it uses the context's proxy).
 * @returns {Promise<Exit | null>} null when no service answered.
 */
export declare function exitPoint(request: APIRequestContext): Promise<Exit | null>;
