/**
 * What a live checker (a run over real sites, never in CI) shares: its
 * command line (which sites, how many at once, a proxy, how the browser
 * looks) and where its traffic leaves for the internet, which decides what
 * many sites show (cookie banners, prices, currency).
 *
 * @module testing/live
 */

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
export function parseProxy(address) {
  const url = new URL(address.includes('://') ? address : `http://${address}`);
  if (!url.hostname) throw new Error(`Not a proxy address: ${address}`);
  const server = `${url.protocol}//${url.host}`;
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  return {
    proxy: { server, ...(username && { username }), ...(password && { password }) },
    label: `${url.protocol}//${username ? `${username}${password ? ':•••' : ''}@` : ''}${url.host}`,
  };
}

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
export function parseLiveOptions(argv, env, { usage, concurrency = 3, maxConcurrency = 8, locale = 'en-GB', timezone = 'Europe/London' }) {
  /** @type {LiveOptions} */
  const options = { only: [], categories: [], concurrency, proxy: null, proxyLabel: '', locale, timezone, out: '', help: false };
  let proxy = env.HTTPS_PROXY || env.https_proxy || '';
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals > 0 ? arg.slice(0, equals) : arg;
    const inline = equals > 0 ? arg.slice(equals + 1) : undefined;
    const value = () => {
      const next = inline ?? argv[++at];
      if (next === undefined || next === '') throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case '--only': options.only.push(...value().split(',')); break;
      case '--category': options.categories.push(...value().split(',')); break;
      case '--concurrency': {
        const count = Number(value());
        if (!Number.isInteger(count) || count < 1 || count > maxConcurrency) throw new Error(`--concurrency must be 1 to ${maxConcurrency}`);
        options.concurrency = count;
        break;
      }
      case '--proxy': proxy = value(); break;
      case '--locale': options.locale = value(); break;
      case '--timezone': options.timezone = value(); break;
      case '--out': options.out = value(); break;
      case '--help': case '-h': options.help = true; break;
      default:
        if (flag.startsWith('-')) throw new Error(`Unknown option ${flag}\n\n${usage}`);
        options.only.push(flag);
    }
  }
  if (proxy) ({ proxy: options.proxy, label: options.proxyLabel } = parseProxy(proxy));
  return options;
}

/**
 * The exit point.
 *
 * @typedef {object} Exit
 * @property {string} ip The public address.
 * @property {string} country Its ISO country code ("GB", "TH").
 * @property {string} where Readable: city and organisation, where the service says.
 * @property {string} source The service that answered.
 */

/**
 * Lookup services that need no key, tried in order, each with how to read its answer.
 *
 * @type {readonly { url: string, read: (data: Record<string, unknown>) => { ip: unknown, country: unknown, where: unknown[] } }[]}
 */
const SERVICES = [
  { url: 'https://ipinfo.io/json', read: (data) => ({ ip: data.ip, country: data.country, where: [data.city, data.org] }) },
  { url: 'https://api.country.is/', read: (data) => ({ ip: data.ip, country: data.country, where: [] }) },
  { url: 'https://ipapi.co/json/', read: (data) => ({ ip: data.ip, country: data.country_code, where: [data.city, data.org] }) },
];

/**
 * Where the browser's traffic leaves for the internet: its public IP's
 * country, asked once through the same proxy the browser uses. Sites go by
 * that address, not the browser's language or time zone.
 *
 * @param {APIRequestContext} request - A browser context's `request` (it uses the context's proxy).
 * @returns {Promise<Exit | null>} null when no service answered.
 */
export async function exitPoint(request) {
  for (const { url, read } of SERVICES) {
    try {
      const response = await request.get(url, { timeout: 10000, headers: { accept: 'application/json' } });
      if (!response.ok()) continue;
      const { ip, country, where } = read(await response.json());
      if (typeof country !== 'string' || !country) continue;
      return { ip: String(ip ?? ''), country: country.toUpperCase(), where: where.filter((part) => typeof part === 'string' && part).join(', '), source: new URL(url).host };
    } catch {
      // The next service.
    }
  }
  return null;
}
