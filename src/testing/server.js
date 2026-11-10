/**
 * A local web server for end-to-end test pages: a site for the content
 * script to run on, answering each path from a table (or a function), on
 * 127.0.0.1 so a test build's host permission can cover it; over HTTPS too,
 * with a throwaway certificate.
 *
 * @module testing/server
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** @import { IncomingMessage, Server } from 'node:http' */

/**
 * What a path answers: a body (sent as UTF-8 HTML), or a body with its own
 * type, status and headers.
 *
 * @typedef {string | Uint8Array | {body: string | Uint8Array, type?: string, status?: number, headers?: Record<string, string>}} Reply
 */

/**
 * The site: path (without the query) → reply, as an object or a `Map` (which
 * a test may change as it goes), or a function of the path; no reply is a 404.
 *
 * @typedef {Readonly<Record<string, Reply>> | ReadonlyMap<string, Reply>
 *   | ((pathname: string, request: IncomingMessage) => Reply | undefined | Promise<Reply | undefined>)} Routes
 */

/**
 * A running test site.
 *
 * @typedef {object} TestServer
 * @property {Server} server Node's server.
 * @property {number} port The port it listens on.
 * @property {string} origin `http://127.0.0.1:<port>`.
 * @property {() => Promise<void>} close Drop open connections and stop listening.
 */

const HTML = 'text/html; charset=utf-8';

/**
 * The reply for a path.
 *
 * @param {Routes} routes - The site.
 * @param {string} pathname - The request's path.
 * @param {IncomingMessage} request - The request.
 * @returns {Promise<Reply | undefined>} What to send; `undefined` for a 404.
 */
async function replyFor(routes, pathname, request) {
  if (typeof routes === 'function') return routes(pathname, request);
  if (routes instanceof Map) return routes.get(pathname);
  const table = /** @type {Readonly<Record<string, Reply>>} */ (routes);
  return Object.hasOwn(table, pathname) ? table[pathname] : undefined;
}

/**
 * A self-signed certificate for 127.0.0.1 and localhost, made by `openssl`, valid for a day: for
 * {@link serve}'s `tls`, with Chromium started with `--ignore-certificate-errors` (a site whose
 * name Chrome only reaches over HTTPS, as every HSTS-preloaded one, mapped to the test server with
 * `--host-resolver-rules`).
 *
 * @returns {{key: string, cert: string}} The key and certificate, PEM.
 * @example
 * const site = await serve(routes, { tls: testCertificate() });
 */
export function testCertificate() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-tls-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
    return { key: readFileSync(path.join(dir, 'key.pem'), 'utf8'), cert: readFileSync(path.join(dir, 'cert.pem'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Serve `routes` on 127.0.0.1.
 *
 * @param {Routes} routes - Path → page, or a function of the path.
 * @param {{port?: number, tls?: {key: string, cert: string}}} [options] - `port`: a fixed port (default: any
 *   free one); `tls`: serve HTTPS with this key and certificate ({@link testCertificate}).
 * @returns {Promise<TestServer>} The listening server.
 * @example
 * const site = await serve({'/': '<!doctype html><textarea></textarea>'});
 * await page.goto(`${site.origin}/`);
 * await site.close();
 */
export async function serve(routes, { port = 0, tls } = {}) {
  /** @type {import('node:http').RequestListener} */
  const handle = async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
    const reply = await replyFor(routes, pathname, request);
    if (reply === undefined) {
      response.writeHead(404, { 'Content-Type': HTML });
      response.end('');
      return;
    }
    const { body, type = HTML, status = 200, headers = {} } = typeof reply === 'string' || reply instanceof Uint8Array ? { body: reply } : reply;
    response.writeHead(status, { 'Content-Type': type, ...headers });
    response.end(body);
  };
  const server = tls ? createSecureServer(tls, handle) : createServer(handle);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    server,
    port: address.port,
    origin: `${tls ? 'https' : 'http'}://127.0.0.1:${address.port}`,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
