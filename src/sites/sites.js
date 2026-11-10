/**
 * Sites, as people type them into a settings list ("example.com",
 * "https://www.Example.com/shop") and as pages report them (`location.href`):
 * the origin an extension asks Chrome for access to, the host a per-site
 * on/off list keeps, whether a page is on a listed site (subdomains
 * included), and the match patterns for both. Pure.
 *
 * A site is a web host: http or https, with a dot in its name (or
 * `localhost`). Text without a scheme is read as https.
 *
 * @module sites/sites
 */

/** The longest host name DNS allows, and so the longest site a list takes. */
export const MAX_HOST_LENGTH = 253;

/** A scheme at the start of what was typed; `localhost:8080` is a host and port, not one. */
const SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;

/**
 * What was typed (or stored, or a page's address) as a web URL.
 *
 * @param {unknown} input - Anything.
 * @returns {URL | null} The URL, or null when it isn't a web site's.
 */
function webUrl(input) {
  // Only text: a stray number would otherwise read as an IP address (3 → "0.0.0.3").
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(SCHEME.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
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
