/**
 * A local web server for end-to-end test pages: a site for the content
 * script to run on, answering each path from a table (or a function), on
 * 127.0.0.1 so a test build's host permission can cover it.
 *
 * @module testing/server
 */

import { createServer } from 'node:http';

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
 * Serve `routes` on 127.0.0.1.
 *
 * @param {Routes} routes - Path → page, or a function of the path.
 * @param {{port?: number}} [options] - `port`: a fixed port (default: any free one).
 * @returns {Promise<TestServer>} The listening server.
 * @example
 * const site = await serve({'/': '<!doctype html><textarea></textarea>'});
 * await page.goto(`${site.origin}/`);
 * await site.close();
 */
export async function serve(routes, { port = 0 } = {}) {
  const server = createServer(async (request, response) => {
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
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    server,
    port: address.port,
    origin: `http://127.0.0.1:${address.port}`,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
