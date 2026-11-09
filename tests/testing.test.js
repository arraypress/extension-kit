import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRunner, serve, until } from '../src/testing/index.js';

/** @import { Reply } from '../src/testing/server.js' */

describe('serve', () => {
  it('answers each path from a table as UTF-8 HTML, ignoring the query, and anything else with a 404', async () => {
    const site = await serve({ '/': '<p>café</p>' });
    try {
      assert.match(site.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      const page = await fetch(`${site.origin}/?x=1`);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(await page.text(), '<p>café</p>');
      const missing = await fetch(`${site.origin}/constructor`);
      assert.equal(missing.status, 404);
    } finally {
      await site.close();
    }
  });

  it('reads a Map as it is when asked, and takes a reply’s own type, status and headers', async () => {
    /** @type {Map<string, Reply>} */
    const routes = new Map([['/data', { body: '{}', type: 'application/json', headers: { 'x-test': 'yes' } }]]);
    const site = await serve(routes);
    try {
      const data = await fetch(`${site.origin}/data`);
      assert.equal(data.headers.get('content-type'), 'application/json');
      assert.equal(data.headers.get('x-test'), 'yes');
      routes.set('/data', { body: 'gone', status: 410 });
      assert.equal((await fetch(`${site.origin}/data`)).status, 410);
    } finally {
      await site.close();
    }
  });

  it('asks a function for each path, and listens on a fixed port when given one', async () => {
    const first = await serve(() => undefined);
    const { port } = first;
    await first.close();
    const site = await serve(async (pathname) => (pathname === '/echo' ? pathname : undefined), { port });
    try {
      assert.equal(site.port, port);
      assert.equal(await (await fetch(`${site.origin}/echo`)).text(), '/echo');
      assert.equal((await fetch(`${site.origin}/other`)).status, 404);
    } finally {
      await site.close();
    }
  });
});

describe('until', () => {
  it('resolves to the first truthy value, typed without the falsy ones', async () => {
    let calls = 0;
    /** @type {string} */
    const text = await until(() => ++calls > 2 && 'ready', 'the text');
    assert.equal(text, 'ready');
    assert.equal(calls, 3);
  });

  it('gives up with what it waited for', async () => {
    await assert.rejects(until(() => 0, 'nothing', 60), /Timed out waiting for nothing/);
  });
});

describe('checkRunner', () => {
  it('counts a failure found outside a check, and finish exits with 1 listing it', async (t) => {
    const lines = /** @type {string[]} */ ([]);
    t.mock.method(console, 'log', (/** @type {string} */ line) => lines.push(line));
    const exit = t.mock.method(process, 'exit', /** @type {(code?: number) => never} */ (() => undefined));
    const { check, fail, finish } = checkRunner();
    assert.equal(await check('passes', () => {}), true);
    fail('page error: boom');
    finish();
    assert.deepEqual(lines, ['  ✓ passes', '  ✗ page error: boom', '\n1 passed, 1 failed', '  - page error: boom']);
    assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
  });

  it('exits nothing when every check passed', (t) => {
    t.mock.method(console, 'log', () => {});
    const exit = t.mock.method(process, 'exit', /** @type {(code?: number) => never} */ (() => undefined));
    checkRunner().finish();
    assert.equal(exit.mock.callCount(), 0);
  });
});

