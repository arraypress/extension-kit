/**
 * A content script's helpers in jsdom: a big page cut into blocks and worked
 * through in slices that hand the main thread back, and the change watcher
 * (one batch, each subtree once, the extension's own nodes ignored, removals
 * at once).
 *
 * @module tests/content
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import { BLOCK_CHARS, blocksOf, eachInSlices, inSlices, watchChanges } from '../src/index.js';
import { until } from '../src/testing/e2e.js';

/** @param {string} html */
const page = (html) => new JSDOM(`<body>${html}</body>`).window;

describe('blocksOf', () => {
  it('a small part is one block; a big one is cut down to its children, its own text nodes alone', () => {
    const { document } = page('<p>short</p>');
    assert.deepEqual(blocksOf(document.body), [document.body]);
    const long = 'x'.repeat(30);
    const big = page(`<main>intro<section><p>${long}</p><p>${long}</p></section><aside>${long}</aside></main>`).document;
    const blocks = blocksOf(big.body, 50);
    assert.deepEqual(blocks.map((node) => node.nodeName), ['#text', 'P', 'P', 'ASIDE']);
    assert.equal(BLOCK_CHARS, 4000);
  });
});

describe('blocksOf and inSlices on a whole page', () => {
  it('scripts, styles and templates inside a part that’s cut aren’t blocks: their text isn’t the page’s', () => {
    const long = 'x'.repeat(30);
    const { document } = page(`<p>${long}</p><script>var a = "${long}";</script><style>.a { color: red; } /* ${long} */</style><template><p>${long}</p></template><noscript>${long}</noscript><p>${long}</p>`);
    assert.deepEqual(blocksOf(document.body, 50).map((node) => node.nodeName), ['P', 'P']);
  });

  it('the page is cut as the work goes, not whole before the first slice; what the work adds beside a block isn’t handed back', async () => {
    const long = 'x'.repeat(30);
    const { document } = page(`<section><p>${long}</p><p>${long}</p></section><section><p>${long}</p><p>${long}</p></section>`);
    const second = /** @type {Element} */ (document.querySelectorAll('section')[1]);
    let measured = 0;
    Object.defineProperty(second, 'textContent', { get() { measured++; return long + long; } });
    /** @type {string[]} */
    const worked = [];
    let measuredAtFirst = -1;
    await inSlices(document.body, (block) => {
      if (measuredAtFirst < 0) measuredAtFirst = measured;
      worked.push(block.nodeName);
      const note = document.createElement('my-note');
      note.textContent = long;
      /** @type {Element} */ (block).after(note);
    }, { blockChars: 50, pause: async () => {} });
    assert.equal(measuredAtFirst, 0, 'the second section isn’t measured until the first is done');
    assert.deepEqual(worked, ['P', 'P', 'P', 'P']);
  });
});

describe('inSlices', () => {
  it('works every block still in the page, and pauses once a slice has run its time', async () => {
    const { document } = page(Array.from({ length: 6 }, (_, at) => `<p id="p${at}">${'y'.repeat(20)}</p>`).join(''));
    let clock = 0;
    let pauses = 0;
    /** @type {string[]} */
    const worked = [];
    await inSlices(document.body, (block) => {
      worked.push(/** @type {Element} */ (block).id);
      clock += 15;
      if (block === document.getElementById('p1')) document.getElementById('p2')?.remove();
    }, { blockChars: 25, sliceMs: 40, now: () => clock, pause: async () => { pauses += 1; } });
    assert.deepEqual(worked, ['p0', 'p1', 'p3', 'p4', 'p5'], 'p2 left the page first');
    assert.equal(pauses, 1, '60 ms of work in 40 ms slices');
  });
});

describe('eachInSlices', () => {
  it('works every item in order with its index, pausing whenever a slice has run its time', async () => {
    let clock = 0;
    /** @type {string[]} */
    const log = [];
    await eachInSlices(new Set(['a', 'b', 'c', 'd', 'e']), (item, index) => {
      log.push(`${item}${index}`);
      clock += 25;
    }, { sliceMs: 40, now: () => clock, pause: async () => { log.push('pause'); } });
    assert.deepEqual(log, ['a0', 'b1', 'pause', 'c2', 'd3', 'pause', 'e4']);
  });

  it('hands the main thread back for real by default: a timer set first runs between slices', async () => {
    /** @type {string[]} */
    const log = [];
    setTimeout(() => log.push('page'), 0);
    const end = Date.now() + 30;
    await eachInSlices([1, 2], (item) => {
      log.push(`work ${item}`);
      if (item === 1) while (Date.now() < end) { /* a long piece of work */ }
    }, { sliceMs: 10 });
    assert.deepEqual(log, ['work 1', 'page', 'work 2']);
  });
});

describe('watchChanges', () => {
  it('hands over what was added or changed in one batch, each subtree once, ignoring the extension’s own', async () => {
    const window = page('<ul id="list"><li>one</li></ul><p id="text">a</p>');
    const { document } = window;
    globalThis.MutationObserver = window.MutationObserver;
    /** @type {Node[][]} */
    const batches = [];
    /** @type {Node[]} */
    const removed = [];
    const stop = watchChanges(document.body, {
      changed: (nodes) => batches.push(nodes),
      removed: (node) => removed.push(node),
      ignore: (node) => node.nodeName === 'MY-NOTE',
      settleMs: 20,
      regroupChildren: 0,
    });
    const list = /** @type {HTMLElement} */ (document.getElementById('list'));
    const item = document.createElement('li');
    item.innerHTML = '<b>two</b>';
    list.append(item);
    item.firstElementChild?.append(' more');
    document.getElementById('text')?.firstChild?.replaceWith('b');
    list.append(document.createElement('my-note'));
    list.firstElementChild?.remove();
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].map((node) => node.textContent), ['two more', 'b']);
    assert.deepEqual(removed.map((node) => node.textContent), ['a', 'one'], 'the replaced text and the removed item, at once');
    document.body.append(document.createElement('my-note'));
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    assert.equal(batches.length, 1, 'its own notes set nothing off');
    stop();
    document.body.append('after');
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    assert.equal(batches.length, 1, 'stopped');
  });

  it('what changes inside the extension’s own element (its text set again, a child added) sets nothing off', async () => {
    const { window } = new JSDOM('<body><p id="price">£5</p><my-note id="note"><b>was</b></my-note></body>');
    const { document } = window;
    globalThis.MutationObserver = window.MutationObserver;
    /** @type {Node[][]} */
    const batches = [];
    const stop = watchChanges(document.body, {
      changed: (nodes) => batches.push(nodes), settleMs: 5,
      ignore: (node) => node.nodeType === 1 && /** @type {Element} */ (node).localName === 'my-note',
    });
    const note = /** @type {HTMLElement} */ (document.getElementById('note'));
    /** @type {Text} */ (/** @type {Element} */ (note.firstElementChild).firstChild).data = 'now';
    note.append(document.createElement('i'));
    note.textContent = 'again';
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(batches, []);
    /** @type {Text} */ (/** @type {HTMLElement} */ (document.getElementById('price')).firstChild).data = '£6';
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(batches.length, 1);
    stop();
  });

  it('thousands of nodes added at once are sorted into subtrees without asking every pair', async () => {
    const { window } = new JSDOM('<body><ul id="feed"></ul></body>');
    const { document } = window;
    globalThis.MutationObserver = window.MutationObserver;
    /** @type {Node[]} */
    let handed = [];
    const stop = watchChanges(document.body, { changed: (nodes) => { handed = nodes; }, settleMs: 0 });
    const feed = /** @type {HTMLElement} */ (document.getElementById('feed'));
    let asked = 0;
    const contains = window.Node.prototype.contains;
    window.Node.prototype.contains = function counted(/** @type {Node | null} */ other) { asked++; return contains.call(this, other); };
    for (let i = 0; i < 3000; i++) {
      const item = document.createElement('li');
      item.append(document.createElement('span'));
      feed.append(item);
      item.firstElementChild?.append('text'); // A change inside one already added: it goes with its item.
    }
    // Waited for, not timed: under a loaded machine the batch can take longer than any fixed wait.
    await until(() => handed.length > 0, 'the batch to be handed over');
    window.Node.prototype.contains = contains;
    assert.equal(handed.length, 3000);
    assert.equal(handed.every((node) => node.nodeName === 'LI'), true);
    assert.ok(asked < 3000, `contains() asked ${asked} times`);
    stop();
  });

  it('an element with few children whose children changed is handed over whole; a page that keeps changing still gets a batch', async () => {
    const window = page('<span id="price"><b>12</b></span>');
    globalThis.MutationObserver = window.MutationObserver;
    const { document } = window;
    /** @type {string[]} */
    const seen = [];
    const stop = watchChanges(document.body, { changed: (nodes) => seen.push(...nodes.map((node) => /** @type {Element} */ (node).id || node.nodeName)), settleMs: 50, maxWaitMs: 120 });
    const price = /** @type {HTMLElement} */ (document.getElementById('price'));
    const ticker = setInterval(() => price.append(document.createElement('sup')), 20);
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    clearInterval(ticker);
    stop();
    assert.ok(seen.includes('price'), seen.join());
  });

  it('is in the runtime half, vendored with it', () => {
    assert.ok(RUNTIME_ENTRIES.includes('content'));
  });
});
