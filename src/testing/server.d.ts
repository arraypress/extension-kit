/**
 * A local web server for end-to-end test pages: a site for the content
 * script to run on, answering each path from a table (or a function), on
 * 127.0.0.1 so a test build's host permission can cover it; over HTTPS too,
 * with a throwaway certificate.
 *
 * @module testing/server
 */
import type { IncomingMessage, Server } from 'node:http';
export type Reply = string | Uint8Array | {
    body: string | Uint8Array;
    type?: string;
    status?: number;
    headers?: Record<string, string>;
};
export type Routes = Readonly<Record<string, Reply>> | ReadonlyMap<string, Reply> | ((pathname: string, request: IncomingMessage) => Reply | undefined | Promise<Reply | undefined>);
export type TestServer = {
    /**
     * Node's server.
     */
    server: Server;
    /**
     * The port it listens on.
     */
    port: number;
    /**
     * `http://127.0.0.1:<port>`.
     */
    origin: string;
    /**
     * Drop open connections and stop listening.
     */
    close: () => Promise<void>;
};
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
export declare function testCertificate(): {
    key: string;
    cert: string;
};
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
export declare function serve(routes: Routes, { port, tls }?: {
    port?: number;
    tls?: {
        key: string;
        cert: string;
    };
}): Promise<TestServer>;
