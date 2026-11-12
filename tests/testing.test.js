import { fakeChromeStorage } from '../src/testing/fake-storage.js';
import { fakeLanguageModel } from '../src/testing/fake-model.js';
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

  it('exits nothing when every check passed', async (t) => {
    const { exit } = captured(t);
    const { check, finish } = checkRunner();
    await check('passes', () => {});
    finish();
    assert.equal(exit.mock.callCount(), 0);
  });

  it('a run with no checks at all hasn’t passed: finish exits with 1', (t) => {
    const { lines, exit } = captured(t);
    checkRunner().finish();
    assert.deepEqual(lines, ['\n0 passed, 0 failed', '  No checks ran.']);
    assert.deepEqual(exit.mock.calls.map((call) => call.arguments), [[1]]);
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

  it('fills messages as Chromium does: any case, bare $1, $$, a stray $; and refuses an undefined placeholder', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kit-messages-'));
    /** @param {Record<string, unknown>} messages */
    const write = (messages) => writeFile(path.join(dir, '_locales', 'en', 'messages.json'), JSON.stringify(messages));
    try {
      await mkdir(path.join(dir, '_locales', 'en'), { recursive: true });
      await write({
        a: { message: 'Hi $NAME$, $1 costs $$5 ($2)', placeholders: { name: { content: '$1' } } },
        Mixed: { message: 'mixed $Who$', placeholders: { WHO: { content: '<$2|$1>' } } },
        dollar: { message: '100$ and $ alone and $$$1' },
        nested: { message: '$A$', placeholders: { a: { content: '$1 and $$ and $A$' } } },
      });
      const t = messageLookup(dir);
      // Each line is what Playwright's Chromium answered for the same messages.
      assert.equal(t('a', ['Sam', 'two']), 'Hi Sam, Sam costs $5 (two)');
      assert.equal(t('a', 'Sam'), 'Hi Sam, Sam costs $5 ()');
      assert.equal(t('a'), 'Hi ,  costs $5 ()');
      assert.equal(t('A', ['Sam']), 'Hi Sam, Sam costs $5 ()');
      assert.equal(t('a', [1, 2]), 'Hi 1, 1 costs $5 (2)');
      assert.equal(t('MIXED', ['Sam', 'two']), 'mixed <two|Sam>');
      assert.equal(t('dollar', ['x']), '100and alone and $$1');
      assert.equal(t('nested', ['Sam']), 'Sam and $ and ');
      assert.equal(t('a', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']), undefined);
      await write({ b: { message: 'Hello $WHO$' } });
      assert.throws(() => messageLookup(dir), /“b” uses \$WHO\$ but has no such placeholder/);
      await write({ ten: { message: '$1$2' } });
      assert.throws(() => messageLookup(dir), /“ten” uses \$1\$/);
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

describe('fakeChromeStorage, as Chrome behaves (each line read from real Chromium)', () => {
  it('sync counts an item’s bytes as Chrome does: UTF-8, `<` as six, the limit at 8,192', async () => {
    const { sync } = fakeChromeStorage();
    await assert.rejects(sync.set({ rules: '漢'.repeat(4000) }), /kQuotaBytesPerItem quota exceeded/);
    await sync.set({ rules: '漢'.repeat(2700) });
    await assert.rejects(sync.set({ h: '<'.repeat(1400) }), /kQuotaBytesPerItem quota exceeded/);
    await sync.set({ h: '<'.repeat(1300) });
    assert.equal(await sync.getBytesInUse('h'), 7803);
    await sync.set({ k: 'x'.repeat(8192 - 1 - 2) });
    await assert.rejects(sync.set({ k: 'x'.repeat(8192 - 1 - 2 + 1) }), /kQuotaBytesPerItem quota exceeded/);
  });

  it('sync holds 512 items; clear empties an area and says what went', async () => {
    const storage = fakeChromeStorage();
    const many = Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`k${i}`, 1]));
    await assert.rejects(storage.sync.set(many), /kMaxItems quota exceeded/);
    delete many.k512;
    await storage.sync.set(many);
    /** @type {string[][]} */
    const cleared = [];
    storage.onChanged.addListener((changes, area) => cleared.push([area, ...Object.keys(changes)]));
    await storage.sync.clear();
    assert.deepEqual(storage.sync.data, {});
    assert.equal(cleared[0].length, 513);
    assert.deepEqual(await storage.sync.get(null), {});
  });

  it('sync takes 120 calls a minute and 1,800 an hour of each of set, remove and clear, refused ones counted', async () => {
    let time = 0;
    const { sync } = fakeChromeStorage({ now: () => time });
    await assert.rejects(sync.set({ big: 'x'.repeat(9000) }), /kQuotaBytesPerItem/);
    for (let n = 0; n < 119; n++) await sync.set({ n });
    await assert.rejects(sync.set({ n: 'one too many' }), /MAX_WRITE_OPERATIONS_PER_MINUTE/);
    await sync.remove('n'); // remove has its own count
    await sync.clear();
    time += 60_000;
    await sync.set({ n: 'the next minute' });
    // 30 a minute is under the minute's limit; the hour's stops it at 1,800.
    const steady = fakeChromeStorage({ now: () => time }).sync;
    let taken = 0;
    await assert.rejects(async () => {
      for (; taken < 2000; taken++, time += 1900) await steady.set({ n: taken });
    }, /MAX_WRITE_OPERATIONS_PER_HOUR/);
    assert.equal(taken, 1800);
  });

  it('get takes a key, keys, defaults or nothing; values come back as Chrome stores them', async () => {
    const { local } = fakeChromeStorage({ local: { a: { x: 1, y: 2 } } });
    assert.deepEqual(await local.get({ missing: 'default', a: 'unused' }), { a: { x: 1, y: 2 }, missing: 'default' });
    assert.deepEqual(await local.get('missing'), {});
    assert.deepEqual(await local.get([]), {});
    assert.deepEqual(await local.get(['a', 'b']), { a: { x: 1, y: 2 } });
    await local.set({ u: undefined, n: null, d: new Date(0), nan: NaN, f() {}, re: /x/g, nested: { u: undefined, arr: [undefined, 1] } });
    assert.deepEqual(await local.get(null), { a: { x: 1, y: 2 }, d: {}, n: null, nested: { arr: [null, 1] }, re: {} });
    assert.equal(await local.getBytesInUse('n'), 5);
    assert.equal(await local.getBytesInUse(['missing']), 0);
  });

  it('onChanged fires for a changed value only (not the same object with its keys reordered), and a listener can be taken off', async () => {
    const storage = fakeChromeStorage();
    /** @type {unknown[]} */
    const heard = [];
    /** @type {unknown[]} */
    const areaHeard = [];
    const listener = (/** @type {unknown} */ changes, /** @type {string} */ area) => heard.push([area, changes]);
    storage.onChanged.addListener(listener);
    storage.local.onChanged.addListener((changes) => areaHeard.push(changes));
    await storage.local.set({ a: { x: 1, y: 2 } });
    await storage.local.set({ a: { y: 2, x: 1 } });
    assert.deepEqual(heard, [['local', { a: { newValue: { x: 1, y: 2 } } }]]);
    assert.deepEqual(areaHeard, [{ a: { newValue: { x: 1, y: 2 } } }]);
    assert.equal(storage.onChanged.hasListener(listener), true);
    storage.onChanged.removeListener(listener);
    await storage.local.set({ a: 2 });
    assert.equal(heard.length, 1);
    assert.equal(areaHeard.length, 2);
  });
});

describe('fakeLanguageModel, where Chrome refuses', () => {
  it('a destroyed session answers nothing more, and an answer under way is stopped', async () => {
    const model = fakeLanguageModel({ answerMs: 30 });
    const session = await model.create();
    const underWay = session.prompt('Hi');
    session.destroy();
    session.destroy();
    await assert.rejects(underWay, { name: 'AbortError' });
    await assert.rejects(session.prompt('Again'), { name: 'InvalidStateError' });
    await assert.rejects(session.clone(), { name: 'InvalidStateError' });
    assert.equal(model.log.destroyed, 1);
    assert.deepEqual(model.log.prompts, ['Hi']);
  });

  it('a download needs a click behind it; a model that’s here doesn’t', async () => {
    const model = fakeLanguageModel({ availability: 'downloadable', userActivation: false });
    await assert.rejects(model.create(), { name: 'NotAllowedError' });
    assert.equal(model.state.availability, 'downloadable');
    model.set({ userActivation: true });
    await model.create();
    model.set({ userActivation: false });
    await model.create();
  });
});
