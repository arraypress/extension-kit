/**
 * Sites, as people type them into a settings list ("example.com",
 * "https://www.Example.com/shop") and as pages report them (`location.href`):
 * the origin an extension asks Chrome for access to, the host a per-site
 * on/off list keeps, whether a page is on a listed site (subdomains
 * included), the match patterns for both, and a list with a site added,
 * taken out or edited; and whether an address is a web page's, and whether
 * it is on this computer or its own network rather than the internet. Pure.
 *
 * A site is a web host: http or https, with a dot in its name (or
 * `localhost`). Text without a scheme is read as https. Only a real host
 * name is a site: a `*` typed inside one would make a match pattern Chrome
 * refuses (`*://*.*.example.com/*`), and with it the whole
 * `registerContentScripts` call, so the extension would stop following its
 * settings (checked in Chromium 156: "Invalid host wildcard").
 *
 * @module sites/sites
 */

/** The longest host name DNS allows, and so the longest site a list takes. */
export const MAX_HOST_LENGTH = 253;

/** A scheme at the start of what was typed; `localhost:8080` is a host and port, not one. */
const SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;

/** A match pattern's wildcards at the start of what was typed: `*://` for any scheme, `*.` for subdomains. A listed site covers its subdomains anyway. */
const PATTERN_START = /^(?:\*:\/\/)?((?:[a-z][a-z\d+.-]*:\/\/)?)\*\./i;

/**
 * A host name as the URL parser gives it (lower case, punycode), and nothing else it lets through:
 * labels of letters, digits, `-` and `_`, none empty, a dot at the end allowed. `*`, commas and
 * empty labels pass the parser, and a `*` goes on to make a match pattern Chrome refuses.
 */
const HOST_NAME = /^[a-z\d_](?:[a-z\d_-]*[a-z\d_])?(?:\.[a-z\d_](?:[a-z\d_-]*[a-z\d_])?)*\.?$/;

/**
 * What was typed (or stored, or a page's address) as a web URL. A match pattern's wildcards at
 * the start (`*.example.com`, `*://*.example.com/*`) are dropped: the site is `example.com`.
 *
 * @param {unknown} input - Anything.
 * @returns {URL | null} The URL, or null when it isn't a web site's.
 */
function webUrl(input) {
  // Only text: a stray number would otherwise read as an IP address (3 → "0.0.0.3").
  const text = typeof input === 'string' ? input.trim().replace(PATTERN_START, '$1').replace(/^\*:\/\//, '') : '';
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(SCHEME.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!HOST_NAME.test(url.hostname)) return null;
    return url.hostname.includes('.') || url.hostname === 'localhost' ? url : null;
  } catch {
    return null;
  }
}

/**
 * The origin of a site: what Chrome grants access to, so `www.` and the
 * scheme are kept (https unless typed otherwise); the port and path aren't.
 *
 * @param {unknown} input - What was typed or stored, or a page's address.
 * @returns {string | null} The origin, or null when it isn't a web site.
 * @example
 * siteOrigin('example.com');              // 'https://example.com'
 * siteOrigin('http://localhost:3000/x');  // 'http://localhost'
 * siteOrigin('chrome://settings');        // null
 */
export function siteOrigin(input) {
  const url = webUrl(input);
  return url && `${url.protocol}//${url.hostname}`;
}

/**
 * The host a per-site list keeps: no scheme, port, path, leading `www.` or
 * trailing dot, lower case. A list of hosts covers each one's subdomains
 * ({@link onSite}, {@link hostPatterns}).
 *
 * @param {unknown} input - What was typed or stored, or a page's address.
 * @returns {string | null} The host, or null when it isn't a web site.
 * @example
 * siteHost(' https://www.GitHub.com/a ');  // 'github.com'
 * siteHost('news.bbc.co.uk');              // 'news.bbc.co.uk'
 * siteHost('*.example.com');               // 'example.com': a list covers subdomains anyway
 * siteHost('not a site');                  // null
 */
export function siteHost(input) {
  const url = webUrl(input);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  return (host.includes('.') || host === 'localhost') && host.length <= MAX_HOST_LENGTH ? host : null;
}

/**
 * Whether a host is one of the listed sites, or a subdomain of one
 * ("docs.github.com" is on "github.com"; "notgithub.com" isn't).
 *
 * @param {string | null} host - From {@link siteHost} (null for a page that isn't a web site).
 * @param {readonly string[]} sites - Hosts from {@link siteHost}.
 * @returns {boolean} True when it's on one of them.
 * @example
 * onSite(siteHost(location.href), settings.neverSites);
 */
export function onSite(host, sites) {
  return host !== null && sites.some((site) => host === site || host.endsWith(`.${site}`));
}

/**
 * The match patterns for a listed host and its subdomains: to leave it out
 * of a registered content script (`excludeMatches`).
 *
 * @param {string} host - From {@link siteHost}.
 * @returns {string[]} Two match patterns.
 * @example
 * hostPatterns('example.com'); // ['*://example.com/*', '*://*.example.com/*']
 */
export function hostPatterns(host) {
  return [`*://${host}/*`, `*://*.${host}/*`];
}

/**
 * The host permission pattern for a site: its scheme and host, every path
 * and port.
 *
 * @param {string} url - An origin from {@link siteOrigin}, or any web address.
 * @returns {string} The pattern.
 * @example
 * originPattern('https://example.com');      // 'https://example.com/*'
 * originPattern('https://bit.ly:8443/abc');  // 'https://bit.ly/*'
 */
export function originPattern(url) {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
}

/**
 * An origin as a settings list shows it: without `https://` (an http one
 * keeps its scheme, so it reads as different).
 *
 * @param {string} site - An origin from {@link siteOrigin}, or a host.
 * @returns {string} What to show.
 * @example
 * siteLabel('https://example.com'); // 'example.com'
 * siteLabel('http://example.com');  // 'http://example.com'
 */
export function siteLabel(site) {
  return site.replace(/^https:\/\//, '');
}

/**
 * A site list with `site` added: at the end, once (a site added again moves
 * there).
 *
 * @param {readonly string[]} sites - The list.
 * @param {string} site - The site to add.
 * @returns {string[]} A new list.
 * @example
 * withSite(['a.com', 'b.com'], 'a.com'); // ['b.com', 'a.com']
 */
export function withSite(sites, site) {
  return [...withoutSite(sites, site), site];
}

/**
 * A site list without `site`.
 *
 * @param {readonly string[]} sites - The list.
 * @param {string} site - The site to take out.
 * @returns {string[]} A new list.
 */
export function withoutSite(sites, site) {
  return sites.filter((s) => s !== site);
}

/**
 * A site list with `site` edited to `edited`, in its place, once (an edit
 * to a site already listed merges the two).
 *
 * @param {readonly string[]} sites - The list.
 * @param {string} site - The site as it was.
 * @param {string} edited - What it was edited to.
 * @returns {string[]} A new list.
 * @example
 * withSiteReplaced(['a.com', 'b.com'], 'a.com', 'b.com'); // ['b.com']
 */
export function withSiteReplaced(sites, site, edited) {
  return [...new Set(sites.map((s) => (s === site ? edited : s)))];
}

/**
 * Whether an address is a web page (http or https), the only kind an
 * extension can ask Chrome for access to, or fetch.
 *
 * @param {string} url - Any address, valid or not.
 * @returns {boolean} True for http(s).
 * @example
 * isWebUrl('https://example.com/'); // true
 * isWebUrl('mailto:a@example.com'); // false
 */
export function isWebUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Whether a host is this computer or on its own network rather than the internet: `localhost`
 * and names under it, `.local`, `.lan`, `.internal` and `.home.arpa` names, a name without a dot, and the addresses
 * kept for loopback, private networks and link-local use (IPv4 0/8, 10/8, 100.64/10, 127/8,
 * 169.254/16, 172.16/12, 192.168/16; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4 ones
 * written as IPv6). Told from the address alone: a public name that resolves to a private
 * address can't be seen from here.
 *
 * For anything that follows a link on a person's behalf (a redirect check, a link checker): a hop
 * from a site on the internet to a local address is where to stop, since a request there can
 * change something on a router, a printer or a development server.
 *
 * @param {string} url - A web address (`new URL` writes "0x7f.1" and "2130706433" as 127.0.0.1).
 * @returns {boolean} True for a local address; false for the internet, or what isn't an address.
 * @example
 * isLocalUrl('http://192.168.1.1/admin'); // true
 * isLocalUrl('https://example.com/'); // false
 */
export function isLocalUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  if (!host) return false;
  if (host.startsWith('[')) {
    const address = host.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (mapped) {
      const [high, low] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
      return isLocalUrl(`http://${high >> 8}.${high & 255}.${low >> 8}.${low & 255}/`);
    }
    return address === '::' || address === '::1' || /^f[cd][0-9a-f]{2}:/.test(address) || /^fe[89ab][0-9a-f]:/.test(address);
  }
  const ipv4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return host === 'localhost' || !host.includes('.') || /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(host);
}
