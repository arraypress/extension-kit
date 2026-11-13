/**
 * One request from a service worker that follows nothing, with what `fetch`
 * hides of a redirect read through webRequest: for anything that must see
 * each hop before it's made (a link's redirects shown one by one, a page
 * fetched on a schedule that must never be sent on into the person's own
 * network).
 *
 * What MV3 allows, checked in Chromium 156 (Clean Links' `test/e2e/where.mjs`,
 * Better Alerts' `test/e2e/background.mjs`):
 * - `fetch(url, {redirect: 'manual'})` in the worker answers a redirect with an
 *   `opaqueredirect` response: status 0, no headers, so no `Location`, even
 *   with host access. `redirect: 'follow'` hides the hops, and the request to
 *   the next site is made before anyone can look at where it goes.
 * - webRequest does see the worker's own requests (tab -1, initiator the
 *   extension) when it has host access to them: `onHeadersReceived` gives the
 *   status line and every header, `Location` included, even for a manual
 *   redirect. So each hop is one manual fetch, and its redirect is read there.
 * - `webRequest` adds no install warning, and must be a required permission:
 *   a listener added after Chrome grants an optional webRequest at run time
 *   gets no events until the worker restarts. It sees nothing without host
 *   access, which can stay optional.
 *
 * Requests carry no cookies (`credentials: 'omit'`), no referrer, and skip the cache.
 *
 * @module net/requests
 */

/** How long to wait for webRequest's headers after the response is in (they come first). */
export const HEADERS_WAIT_MS = 2000;

/** The filter for the worker's own requests: outside any tab, as `fetch` makes them. */
export const OWN_REQUESTS = /** @type {chrome.webRequest.RequestFilter} */ (Object.freeze({ urls: ['<all_urls>'], tabId: -1, types: ['xmlhttprequest'] }));

/**
 * What webRequest reports of one of the worker's requests: its response's status and headers, or
 * the error that ended it.
 *
 * @typedef {{statusCode: number, responseHeaders?: {name: string, value?: string}[]} | {error: string}} SeenRequest
 */

/**
 * The parts of `chrome.webRequest` used (fakes in tests).
 *
 * @typedef {object} OwnRequestEvents
 * @property {{addListener(listener: (details: any) => void, filter: chrome.webRequest.RequestFilter, extra?: string[]): void, removeListener(listener: (details: any) => void): void}} onHeadersReceived
 *   Response headers.
 * @property {{addListener(listener: (details: any) => void, filter: chrome.webRequest.RequestFilter): void, removeListener(listener: (details: any) => void): void}} onErrorOccurred
 *   Failed requests.
 */

/**
 * One answer.
 *
 * @typedef {object} OwnAnswer
 * @property {number} status The HTTP status; a redirect's own (301…), read through webRequest; 0
 *   when nothing could be read.
 * @property {{get(name: string): string | null}} headers The response's headers, by lower-case
 *   name; a redirect's `location` among them.
 * @property {Response | null} response The response, to read a body from; null for a redirect.
 * @property {boolean} leavesWeb It redirected to something that isn't a web address, and where
 *   can't be read (Chrome refuses such a redirect, `net::ERR_UNSAFE_REDIRECT`, before its headers show).
 */

/**
 * What a request may set.
 *
 * @typedef {object} OwnRequestOptions
 * @property {string} [method] `'GET'` (the default) or `'HEAD'`.
 * @property {Record<string, string>} [headers] Request headers (`If-None-Match`…).
 * @property {AbortSignal} [signal] Stops it.
 */

/**
 * The worker's own requests.
 *
 * @typedef {object} OwnRequests
 * @property {() => () => void} listen Start listening to webRequest for as long as requests are
 *   being made; the function it returns stops. Not at the worker's top level: the filter can't
 *   name the extension, only “outside any tab”, which is also every website's own service worker,
 *   and with access to many sites each of their requests would wake this worker to be thrown away.
 *   Work that makes requests keeps the worker awake by itself, so nothing is missed.
 * @property {(url: string, options?: OwnRequestOptions) => Promise<OwnAnswer>} request One request,
 *   following nothing. Rejects as `fetch` does (the network, an abort).
 */

/**
 * The key a request is matched by: method and URL without its fragment (webRequest never sees one).
 *
 * @param {string} method - 'HEAD' or 'GET'.
 * @param {string} url - The address.
 * @returns {string} The key.
 */
const requestKey = (method, url) => `${method} ${new URL(url).href.replace(/#.*$/, '')}`;

/**
 * One header from webRequest's list (names are case-insensitive).
 *
 * @param {SeenRequest | undefined} seen - What webRequest saw.
 * @param {string} name - The header's name.
 * @returns {string | null} Its value.
 */
const seenHeader = (seen, name) => (seen && 'responseHeaders' in seen ? seen.responseHeaders : [])
  ?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? null;

/**
 * A wait that gives nothing.
 *
 * @param {number} ms - How long.
 * @returns {Promise<undefined>} Resolves after it.
 */
const pause = (ms) => new Promise((resolve) => { setTimeout(() => resolve(undefined), ms); });

/**
 * The worker's own requests, one at a time and following nothing, a redirect's
 * status and `Location` read through webRequest.
 *
 * @param {object} edges - Chrome's side.
 * @param {OwnRequestEvents} edges.webRequest - `chrome.webRequest`.
 * @param {string} edges.extensionId - `chrome.runtime.id`: only this extension's requests are read.
 * @param {typeof fetch} [edges.fetch] - `fetch`. Default the global one.
 * @param {number} [edges.headersWaitMs] - Default {@link HEADERS_WAIT_MS}.
 * @returns {OwnRequests} `listen` and `request`.
 * @example
 * const own = ownRequests({ webRequest: chrome.webRequest, extensionId: chrome.runtime.id });
 * const stop = own.listen();
 * const { status, headers } = await own.request('https://bit.ly/abc', { method: 'HEAD' });
 * // 301, headers.get('location') === 'https://example.com/'
 * stop();
 */
export function ownRequests({ webRequest, extensionId, fetch: ask = fetch, headersWaitMs = HEADERS_WAIT_MS }) {
  /** Requests waiting for webRequest's report, by {@link requestKey}. @type {Map<string, (seen: SeenRequest) => void>} */
  const waiting = new Map();
  let listeners = 0;

  /**
   * Whether a report is of this extension's own request.
   *
   * @param {{tabId: number, initiator?: string}} details - What Chrome reports.
   * @returns {boolean} It is.
   */
  const own = (details) => details.tabId === -1 && details.initiator === `chrome-extension://${extensionId}`;
  /** @param {{tabId: number, initiator?: string, method: string, url: string, statusCode: number, responseHeaders?: {name: string, value?: string}[]}} details */
  const onHeaders = (details) => {
    if (own(details)) waiting.get(requestKey(details.method, details.url))?.(details);
  };
  /** @param {{tabId: number, initiator?: string, method: string, url: string, error: string}} details */
  const onError = (details) => {
    if (own(details)) waiting.get(requestKey(details.method, details.url))?.({ error: details.error });
  };

  return {
    listen() {
      if (listeners++ === 0) {
        webRequest.onHeadersReceived.addListener(onHeaders, OWN_REQUESTS, ['responseHeaders']);
        webRequest.onErrorOccurred.addListener(onError, OWN_REQUESTS);
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        if (--listeners > 0) return;
        webRequest.onHeadersReceived.removeListener(onHeaders);
        webRequest.onErrorOccurred.removeListener(onError);
      };
    },

    async request(url, { method = 'GET', headers = {}, signal } = {}) {
      const key = requestKey(method, url);
      /** @type {Promise<SeenRequest | undefined>} */
      const seen = new Promise((resolve) => {
        waiting.set(key, resolve);
        signal?.addEventListener('abort', () => resolve(undefined), { once: true });
      });
      try {
        /** @type {Response} */
        let response;
        try {
          response = await ask(url, { method, headers, redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal });
        } catch (error) {
          // Chrome fails even a manual fetch whose redirect leaves the web (Location: mailto:…),
          // reporting only the error: that redirect is still an answer, though where it goes can't be read.
          const details = await Promise.race([seen, pause(200)]);
          if (signal?.aborted || !details || !('error' in details) || details.error !== 'net::ERR_UNSAFE_REDIRECT') throw error;
          return { status: 0, headers: { get: () => null }, response: null, leavesWeb: true };
        }
        if (response.type !== 'opaqueredirect') return { status: response.status, headers: response.headers, response, leavesWeb: false };
        const details = await Promise.race([seen, pause(headersWaitMs)]);
        return {
          status: details && 'statusCode' in details ? details.statusCode : 0,
          headers: { get: (name) => seenHeader(details, name) },
          response: null,
          leavesWeb: false,
        };
      } finally {
        waiting.delete(key);
      }
    },
  };
}
