/**
 * The worker's own requests (`net/requests.js`), with Chrome's two edges faked: the extension's
 * fetch (an `opaqueredirect` for a redirect, as Chrome gives) and webRequest's report of the same
 * request. The extensions' e2e checks run the real thing in Chromium.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OWN_REQUESTS, ownRequests } from '../src/index.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

/** What Chrome's fetch gives a manual redirect: no status, no headers. */
const opaqueRedirect = () => /** @type {Response} */ (/** @type {unknown} */ ({ type: 'opaqueredirect', status: 0, headers: new Headers(), body: null }));

/** `chrome.webRequest`'s two events, remembering who listens. */
function fakeWebRequest() {
  /** @type {Map<string, {listener: (details: any) => void, filter: unknown, extra: unknown}>} */
  const listening = new Map();
  /** @param {string} name */
  const event = (name) => ({
    /** @param {(details: any) => void} listener @param {unknown} filter @param {unknown} [extra] */
    addListener(listener, filter, extra) { listening.set(name, { listener, filter, extra }); },
    /** @param {(details: any) => void} listener */
    removeListener(listener) { if (listening.get(name)?.listener === listener) listening.delete(name); },
  });
  return {
    listening,
    onHeadersReceived: event('headers'),
    onErrorOccurred: event('error'),
    /** @param {string} name @param {object} details */
    fire: (name, details) => listening.get(name)?.listener(details),
  };
}

/** @param {object} more */
const seen = (more) => ({
  method: 'GET', url: 'https://bit.ly/abc', tabId: -1, initiator: `chrome-extension://${ID}`, statusCode: 301,
  responseHeaders: [{ name: 'Location', value: 'https://example.com/a' }], ...more,
});

describe('ownRequests', () => {
  it('asks once, following nothing, with no cookies, referrer or cache, and the headers given', async () => {
    /** @type {[string, RequestInit][]} */
    const asked = [];
    const webRequest = fakeWebRequest();
    const own = ownRequests({
      webRequest, extensionId: ID,
      fetch: /** @type {typeof fetch} */ (async (url, init) => { asked.push([String(url), init ?? {}]); return new Response('hello', { status: 200, headers: { etag: '"a"' } }); }),
    });
    const answer = await own.request('https://example.com/a#frag', { headers: { 'If-None-Match': '"a"' } });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('etag'), '"a"');
    assert.equal(await answer.response?.text(), 'hello');
    assert.equal(answer.leavesWeb, false);
    assert.equal(asked.length, 1);
    assert.equal(asked[0][0], 'https://example.com/a#frag');
    const { signal, ...init } = asked[0][1];
    assert.equal(signal, undefined);
    assert.deepEqual(init, { method: 'GET', headers: { 'If-None-Match': '"a"' }, redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  });

  it('a redirect’s status and Location come from webRequest’s report of the same request, and no one else’s', async () => {
    const webRequest = fakeWebRequest();
    const own = ownRequests({
      webRequest, extensionId: ID,
      fetch: /** @type {typeof fetch} */ (async () => {
        webRequest.fire('headers', seen({ initiator: 'chrome-extension://someone-else', statusCode: 302 }));
        webRequest.fire('headers', seen({ tabId: 3, statusCode: 307 }));
        webRequest.fire('headers', seen({ method: 'HEAD', statusCode: 308 }));
        webRequest.fire('headers', seen({}));
        return opaqueRedirect();
      }),
    });
    const stop = own.listen();
    const answer = await own.request('https://bit.ly/abc#x');
    stop();
    assert.equal(answer.status, 301);
    assert.equal(answer.headers.get('location'), 'https://example.com/a');
    assert.equal(answer.headers.get('LOCATION'), 'https://example.com/a');
    assert.equal(answer.response, null);
  });

  it('a redirect webRequest never reported reads as status 0', async () => {
    const own = ownRequests({ webRequest: fakeWebRequest(), extensionId: ID, fetch: /** @type {typeof fetch} */ (async () => opaqueRedirect()), headersWaitMs: 10 });
    const answer = await own.request('https://bit.ly/abc', { method: 'HEAD' });
    assert.equal(answer.status, 0);
    assert.equal(answer.headers.get('location'), null);
  });

  it('a redirect off the web (Chrome fails the fetch) is an answer that leaves the web; any other failure is thrown', async () => {
    const webRequest = fakeWebRequest();
    const own = ownRequests({
      webRequest, extensionId: ID,
      fetch: /** @type {typeof fetch} */ (async (url) => {
        if (String(url).includes('mail')) webRequest.fire('error', { method: 'GET', url: String(url), tabId: -1, initiator: `chrome-extension://${ID}`, error: 'net::ERR_UNSAFE_REDIRECT' });
        throw new TypeError('Failed to fetch');
      }),
    });
    const stop = own.listen();
    assert.equal((await own.request('https://a.example/mail')).leavesWeb, true);
    await assert.rejects(own.request('https://a.example/down'), /Failed to fetch/);
    stop();
  });

  it('listens to the worker’s own requests only while someone has asked it to', () => {
    const webRequest = fakeWebRequest();
    const own = ownRequests({ webRequest, extensionId: ID });
    assert.equal(webRequest.listening.size, 0);
    const first = own.listen();
    const second = own.listen();
    assert.deepEqual(webRequest.listening.get('headers')?.filter, OWN_REQUESTS);
    assert.deepEqual(webRequest.listening.get('headers')?.extra, ['responseHeaders']);
    assert.deepEqual(OWN_REQUESTS, { urls: ['<all_urls>'], tabId: -1, types: ['xmlhttprequest'] });
    first();
    first();
    assert.equal(webRequest.listening.size, 2);
    second();
    assert.equal(webRequest.listening.size, 0);
  });
});
