import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  CHECK_MS, checkRunner, chromeUserAgent, closeOnSignal, eachLimited, messageLookup, readMessages, realisticBrowser, runChecks, serve, testCertificate, until,
  nodeAttribute, nodeText, pierceNodes,
} from '../src/testing/index.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** @import { Reply } from '../src/testing/server.js' */

describe('serve', () => {
  it('over HTTPS with a throwaway certificate: what Chromium reaches with --ignore-certificate-errors, as a mapped HSTS site', async () => {
    const site = await serve({ '/': '<title>Secure</title>' }, { tls: testCertificate() });
    const browser = await chromium.launch({ channel: 'chromium', args: ['--ignore-certificate-errors', '--host-resolver-rules=MAP www.youtube.com 127.0.0.1'] });
    try {
      assert.match(site.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
      const page = await browser.newPage();
      await page.goto(`https://www.youtube.com:${site.port}/`);
      assert.equal(await page.title(), 'Secure');
    } finally {
      await browser.close();
      await site.close();
    }
  });

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

/**
 * The runner's printed lines and its exit calls, both held back from the test's own output.
 *
 * @param {import('node:test').TestContext} t - The test.
 * @returns {{lines: string[], exit: import('node:test').Mock<(code?: number) => never>}} What it printed, and `process.exit`'s calls.
 */
function captured(t) {
  const lines = /** @type {string[]} */ ([]);
  t.mock.method(console, 'log', (/** @type {string} */ line) => lines.push(line));
  const exit = t.mock.method(process, 'exit', /** @type {(code?: number) => never} */ (() => undefined));
  return { lines, exit };
}

describe('checkRunner', () => {
  it('counts a failure found outside a check, and finish exits with 1 listing it', async (t) => {
    const { lines, exit } = captured(t);
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

describe('runChecks', () => {
  it('fails an error outside any check, always runs the clean-ups in order, then finishes', async (t) => {
    const { lines, exit } = captured(t);
    const runner = checkRunner();
    /** @type {string[]} */
    const cleaned = [];
    await runChecks(runner, async () => {
      await runner.check('passes', () => {});
      throw new Error('the browser went away');
    }, [async () => cleaned.push('browser'), async () => { throw new Error('already closed'); }, async () => cleaned.push('server')]);
    assert.deepEqual(cleaned, ['browser', 'server'], 'a failing clean-up doesn’t stop the rest');
    assert.match(lines[1], /^ {2}✗ unexpected: Error: the browser went away/);
    assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
  });
});

describe('messageLookup', () => {
  it('reads the real messages, a locale over en, filling named placeholders as Chrome does', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kit-messages-'));
    try {
      for (const [locale, messages] of Object.entries({
        en: { optionsColor: { message: 'Color' }, optionsMoreActions: { message: 'More actions for $SITE$', placeholders: { site: { content: '$1' } } } },
        en_GB: { optionsColor: { message: 'Colour' } },
      })) {
        await mkdir(path.join(dir, '_locales', locale), { recursive: true });
        await writeFile(path.join(dir, '_locales', locale, 'messages.json'), JSON.stringify(messages));
      }
      const t = messageLookup(dir);
      assert.equal(t('optionsColor'), 'Color');
      assert.equal(t('optionsMoreActions', ['example.com']), 'More actions for example.com');
      assert.equal(t('optionsMissing'), '');
      const gb = messageLookup(dir, 'en_GB');
      assert.equal(gb('optionsColor'), 'Colour');
      assert.equal(gb('optionsMoreActions', 'bbc.co.uk'), 'More actions for bbc.co.uk');
      assert.deepEqual(Object.keys(readMessages(dir, 'en_GB')), ['optionsColor']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkRunner’s time limit', () => {
  it('fails a check that hangs once its time is up, and goes on to the next', async (t) => {
    const lines = /** @type {string[]} */ ([]);
    t.mock.method(console, 'log', (/** @type {string} */ line) => lines.push(line));
    t.mock.method(process, 'exit', /** @type {(code?: number) => never} */ (() => undefined));
    const { check } = checkRunner({ timeout: 50 });
    assert.equal(await check('hangs', () => new Promise(() => {})), false);
    assert.equal(await check('a slow one given longer', () => new Promise((resolve) => setTimeout(resolve, 80)), { timeout: 500 }), true);
    assert.deepEqual(lines, ['  ✗ hangs\n    Timed out after 0.05 s', '  ✓ a slow one given longer']);
  });

  it('defaults to a minute a check', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'log', () => {});
    const result = checkRunner().check('hangs', () => new Promise(() => {}));
    await Promise.resolve();
    t.mock.timers.tick(CHECK_MS - 1);
    let settled = false;
    result.then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    assert.equal(await result, false);
    assert.equal(CHECK_MS, 60_000);
  });
});

describe('eachLimited', () => {
  it('works through every item, at most `limit` at once, each slot keeping its number', async () => {
    let running = 0;
    let most = 0;
    /** @type {[number, number, number][]} */
    const done = [];
    await eachLimited([10, 20, 30, 40, 50, 60, 70], 3, async (item, slot, index) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, item % 30));
      done.push([item, slot, index]);
      running--;
    });
    assert.equal(most, 3);
    assert.deepEqual(done.map(([item]) => item).sort((a, b) => a - b), [10, 20, 30, 40, 50, 60, 70]);
    assert.ok(done.every(([item, slot, index]) => slot >= 0 && slot < 3 && item === (index + 1) * 10));
    await eachLimited([], 3, async () => { throw new Error('never called'); });
  });
});

describe('a realistic browser', () => {
  it('realisticBrowser adds the switches to the options it’s given, keeping theirs', () => {
    assert.deepEqual(realisticBrowser({ args: ['--lang=de'], ignoreDefaultArgs: ['--mute-audio'], locale: 'de-DE' }), {
      args: ['--lang=de', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
      locale: 'de-DE',
    });
    /** @type {{proxy: {server: string}} | {}} */
    const proxied = Math.random() < 2 ? { proxy: { server: 'http://127.0.0.1:8080' } } : {};
    assert.deepEqual(realisticBrowser(proxied).args, ['--disable-blink-features=AutomationControlled']);
    assert.deepEqual(realisticBrowser().ignoreDefaultArgs, ['--enable-automation']);
  });

  it('launched with it, Chromium says it’s neither automated nor headless', async () => {
    const browser = await chromium.launch(realisticBrowser());
    try {
      const userAgent = await chromeUserAgent(browser);
      assert.match(userAgent, /\bChrome\/\d/);
      assert.doesNotMatch(userAgent, /Headless/);
      const page = await browser.newPage({ userAgent });
      assert.deepEqual(await page.evaluate(() => [navigator.webdriver, navigator.userAgent.includes('Headless')]), [false, false]);
    } finally {
      await browser.close();
    }
    const plain = await chromium.launch();
    try {
      assert.equal(await (await plain.newPage()).evaluate(() => navigator.webdriver), true, 'Playwright’s default, for contrast');
    } finally {
      await plain.close();
    }
  });

  it('closeOnSignal closes everything on Ctrl-C or a kill, then exits; its result takes the handlers off', async (t) => {
    const exit = t.mock.method(process, 'exit', /** @type {(code?: number) => never} */ (() => undefined));
    let closed = 0;
    const stop = closeOnSignal(async () => { closed++; });
    process.emit('SIGTERM', 'SIGTERM');
    await until(() => exit.mock.callCount(), 'the exit');
    assert.equal(closed, 1);
    assert.deepEqual(exit.mock.calls[0].arguments, [143]);
    stop();
    const before = process.listenerCount('SIGINT');
    const again = closeOnSignal(() => new Promise(() => {}), 30);
    assert.equal(process.listenerCount('SIGINT'), before + 1);
    process.emit('SIGINT', 'SIGINT');
    await until(() => exit.mock.callCount() === 2, 'the exit after a close that hangs');
    assert.deepEqual(exit.mock.calls[1].arguments, [130]);
    again();
    assert.equal(process.listenerCount('SIGINT'), before);
  });
});

describe('pierceNodes, nodeAttribute, nodeText', () => {
  it('every node in tree order, shadow roots before children, frames’ documents after; attributes and text read', async () => {
    const text = (/** @type {string} */ value) => ({ nodeId: 0, backendNodeId: 0, nodeType: 3, nodeName: '#text', nodeValue: value });
    const root = {
      nodeId: 1, backendNodeId: 1, nodeType: 9, nodeName: '#document', children: [{
        nodeId: 2, backendNodeId: 2, nodeType: 1, nodeName: 'MY-LAYER', attributes: ['id', 'class', 'class', 'box'],
        shadowRoots: [{ nodeId: 3, backendNodeId: 3, nodeType: 11, nodeName: '#document-fragment', children: [{ nodeId: 4, backendNodeId: 4, nodeType: 1, nodeName: 'DIV', children: [text('in '), text('shadow')] }] }],
        children: [{ nodeId: 5, backendNodeId: 5, nodeType: 1, nodeName: 'IFRAME', contentDocument: { nodeId: 6, backendNodeId: 6, nodeType: 9, nodeName: '#document' } }],
      }],
    };
    /** @type {unknown[]} */
    const sent = [];
    const cdp = /** @type {any} */ ({ send: async (/** @type {string} */ method, /** @type {unknown} */ params) => { sent.push([method, params]); return { root }; } });
    const nodes = await pierceNodes(cdp);
    assert.deepEqual(sent, [['DOM.getDocument', { depth: -1, pierce: true }]]);
    assert.deepEqual(nodes.map((node) => node.nodeName), ['#document', 'MY-LAYER', '#document-fragment', 'DIV', '#text', '#text', 'IFRAME', '#document']);
    assert.equal(nodeAttribute(nodes[1], 'class'), 'box', 'a name, not a value that looks like one');
    assert.equal(nodeAttribute(nodes[1], 'title'), '');
    assert.equal(nodeText(nodes[3]), 'in shadow');
  });
});
