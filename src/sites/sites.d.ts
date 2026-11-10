/**
 * Sites, as people type them into a settings list ("example.com",
 * "https://www.Example.com/shop") and as pages report them (`location.href`):
 * the origin an extension asks Chrome for access to, the host a per-site
 * on/off list keeps, whether a page is on a listed site (subdomains
 * included), the match patterns for both, and a list with a site added,
 * taken out or edited. Pure.
 *
 * A site is a web host: http or https, with a dot in its name (or
 * `localhost`). Text without a scheme is read as https.
 *
 * @module sites/sites
 */
/** The longest host name DNS allows, and so the longest site a list takes. */
export declare const MAX_HOST_LENGTH = 253;
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
export declare function siteOrigin(input: unknown): string | null;
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
export declare function siteHost(input: unknown): string | null;
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
export declare function onSite(host: string | null, sites: readonly string[]): boolean;
/**
 * The match patterns for a listed host and its subdomains: to leave it out
 * of a registered content script (`excludeMatches`).
 *
 * @param {string} host - From {@link siteHost}.
 * @returns {string[]} Two match patterns.
 * @example
 * hostPatterns('example.com'); // ['*://example.com/*', '*://*.example.com/*']
 */
export declare function hostPatterns(host: string): string[];
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
export declare function originPattern(url: string): string;
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
export declare function siteLabel(site: string): string;
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
export declare function withSite(sites: readonly string[], site: string): string[];
/**
 * A site list without `site`.
 *
 * @param {readonly string[]} sites - The list.
 * @param {string} site - The site to take out.
 * @returns {string[]} A new list.
 */
export declare function withoutSite(sites: readonly string[], site: string): string[];
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
export declare function withSiteReplaced(sites: readonly string[], site: string, edited: string): string[];
