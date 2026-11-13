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
export declare const HEADERS_WAIT_MS = 2000;
/** The filter for the worker's own requests: outside any tab, as `fetch` makes them. */
export declare const OWN_REQUESTS: chrome.webRequest.RequestFilter;
export type SeenRequest = {
    statusCode: number;
    responseHeaders?: {
        name: string;
        value?: string;
    }[];
} | {
    error: string;
};
export type OwnRequestEvents = {
    /**
     *   Response headers.
     */
    onHeadersReceived: {
        addListener(listener: (details: any) => void, filter: chrome.webRequest.RequestFilter, extra?: string[]): void;
        removeListener(listener: (details: any) => void): void;
    };
    /**
     *   Failed requests.
     */
    onErrorOccurred: {
        addListener(listener: (details: any) => void, filter: chrome.webRequest.RequestFilter): void;
        removeListener(listener: (details: any) => void): void;
    };
};
export type OwnAnswer = {
    /**
     * The HTTP status; a redirect's own (301…), read through webRequest; 0
     * when nothing could be read.
     */
    status: number;
    /**
     * The response's headers, by lower-case
     * name; a redirect's `location` among them.
     */
    headers: {
        get(name: string): string | null;
    };
    /**
     * The response, to read a body from; null for a redirect.
     */
    response: Response | null;
    /**
     * It redirected to something that isn't a web address, and where
     * can't be read (Chrome refuses such a redirect, `net::ERR_UNSAFE_REDIRECT`, before its headers show).
     */
    leavesWeb: boolean;
};
export type OwnRequestOptions = {
    /**
     * `'GET'` (the default) or `'HEAD'`.
     */
    method?: string;
    /**
     * Request headers (`If-None-Match`…).
     */
    headers?: Record<string, string>;
    /**
     * Stops it.
     */
    signal?: AbortSignal;
};
export type OwnRequests = {
    /**
     * Start listening to webRequest for as long as requests are
     * being made; the function it returns stops. Not at the worker's top level: the filter can't
     * name the extension, only “outside any tab”, which is also every website's own service worker,
     * and with access to many sites each of their requests would wake this worker to be thrown away.
     * Work that makes requests keeps the worker awake by itself, so nothing is missed.
     */
    listen: () => () => void;
    /**
     * One request,
     * following nothing. Rejects as `fetch` does (the network, an abort).
     */
    request: (url: string, options?: OwnRequestOptions) => Promise<OwnAnswer>;
};
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
export declare function ownRequests({ webRequest, extensionId, fetch: ask, headersWaitMs }: {
    webRequest: OwnRequestEvents;
    extensionId: string;
    fetch?: typeof fetch;
    headersWaitMs?: number;
}): OwnRequests;
