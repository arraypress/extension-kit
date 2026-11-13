import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFSCREEN_PATH, POLL_MS, TOOLBAR_DARK_KEY, TOOLBAR_SCHEME, createToolbarTheme, reportColorScheme, startToolbarTheme,
  toolbarIcon, watchColorScheme, watchFromOffscreen, watchSchemeOffscreen,
} from '../src/index.js';
import { fakeChromeStorage } from '../src/testing/index.js';

/** @import { FakeChromeStorage } from '../src/testing/fake-storage.js' */

const EXTENSION_ID = 'test-extension-id';
const self = { id: EXTENSION_ID };
afterEach(() => mock.restoreAll());

/** `chrome.action` as far as this goes: it remembers the icons it was given. */
function fakeAction() {
  return {
    /** @type {unknown[]} */
    calls: [],
    /** @param {{path: unknown}} details */
    async setIcon({ path }) { this.calls.push(path); },
  };
}

/** @param {FakeChromeStorage} [storage] */
function setUp(storage = fakeChromeStorage()) {
  const action = fakeAction();
  return { storage, action, theme: createToolbarTheme({ storage: storage.local, action, extensionId: EXTENSION_ID }) };
}

/** A MediaQueryList whose answer the test flips, firing `change` as Chrome does. */
function fakeMedia(/** @type {boolean} */ matches) {
  const target = new EventTarget();
  const media = Object.assign(target, {
    matches,
    /** @param {boolean} next */
    flip(next) { media.matches = next; target.dispatchEvent(new Event('change')); },
  });
  return media;
}

/** `chrome.runtime` for a document: remembers what it sent. */
function fakeRuntime() {
  return {
    /** @type {unknown[]} */
    sent: [],
    /** @param {unknown} message */
    async sendMessage(message) { this.sent.push(message); },
  };
}

describe('toolbar theme (worker)', () => {
  it('a dark report stores it and shows the dark glyph; light swaps back', async () => {
    const { storage, action, theme } = setUp();
    theme.onMessage({ type: TOOLBAR_SCHEME, dark: true }, self);
    await theme.settled();
    assert.equal(storage.local.data[TOOLBAR_DARK_KEY], true);
    assert.deepEqual(action.calls, [toolbarIcon(true)]);
    theme.onMessage({ type: TOOLBAR_SCHEME, dark: false }, self);
    await theme.settled();
    assert.equal(storage.local.data[TOOLBAR_DARK_KEY], false);
    assert.deepEqual(action.calls, [toolbarIcon(true), toolbarIcon(false)]);
  });

  it('the glyph paths start at the root, one per size', () => {
    assert.deepEqual(toolbarIcon(false), { 16: '/icons/toolbar/light-16.png', 32: '/icons/toolbar/light-32.png', 48: '/icons/toolbar/light-48.png' });
  });

  it('the same scheme again writes and shows nothing', async () => {
    const { storage, action, theme } = setUp();
    for (const dark of [false, true, true, true]) theme.onMessage({ type: TOOLBAR_SCHEME, dark }, self);
    await theme.settled();
    assert.deepEqual(action.calls, [toolbarIcon(true)]);
    assert.equal(storage.local.writes, 1);
  });

  it('other senders and anything but a boolean are ignored; other messages aren’t its', async () => {
    const { storage, action, theme } = setUp();
    assert.equal(theme.onMessage({ type: TOOLBAR_SCHEME, dark: true }, { id: 'another-extension' }), true);
    theme.onMessage({ type: TOOLBAR_SCHEME, dark: true }, {});
    theme.onMessage({ type: TOOLBAR_SCHEME, dark: 'yes' }, self);
    theme.onMessage({ type: TOOLBAR_SCHEME }, self);
    await theme.settled();
    assert.deepEqual(action.calls, []);
    assert.deepEqual(storage.local.data, {});
    assert.equal(theme.onMessage({ type: 'something-else' }, self), false);
    assert.equal(theme.onMessage(null, self), false);
  });

  it('a glyph Chrome refuses isn’t stored, so the next report tries again', async () => {
    const { storage, action, theme } = setUp();
    action.setIcon = async () => { throw new Error('Failed to set icon'); };
    const error = mock.method(console, 'error', () => {});
    theme.onMessage({ type: TOOLBAR_SCHEME, dark: true }, self);
    await theme.settled();
    assert.equal(TOOLBAR_DARK_KEY in storage.local.data, false);
    assert.equal(error.mock.callCount(), 1);
  });

  it('a worker start puts the dark glyph back, and leaves light to the manifest', async () => {
    const dark = setUp(fakeChromeStorage({ local: { [TOOLBAR_DARK_KEY]: true } }));
    await dark.theme.restore();
    assert.deepEqual(dark.action.calls, [toolbarIcon(true)]);
    const light = setUp();
    await light.theme.restore();
    assert.deepEqual(light.action.calls, []);
  });
});

describe('offscreen watcher', () => {
  /** `chrome.offscreen` and `chrome.runtime` holding real state: one document at most. */
  function fakeOffscreen() {
    /** @type {unknown[]} */
    const contexts = [];
    const offscreen = {
      Reason: { MATCH_MEDIA: 'MATCH_MEDIA' },
      /** @type {{url: string, reasons: string[], justification: string}[]} */
      created: [],
      /** @param {{url: string, reasons: string[], justification: string}} options */
      async createDocument(options) {
        if (contexts.length) throw new Error('Only a single offscreen document may be created.');
        this.created.push(options);
        contexts.push({ contextType: 'OFFSCREEN_DOCUMENT' });
      },
    };
    const runtime = { async getContexts() { return [...contexts]; } };
    return { offscreen, runtime };
  }

  it('opens once, for MATCH_MEDIA, even when asked twice at once', async () => {
    const api = fakeOffscreen();
    assert.deepEqual(await Promise.all([watchFromOffscreen(api), watchFromOffscreen(api)]), [true, true]);
    assert.equal(await watchFromOffscreen(api), false);
    assert.equal(api.offscreen.created.length, 1);
    assert.deepEqual(api.offscreen.created[0].reasons, ['MATCH_MEDIA']);
    assert.equal(api.offscreen.created[0].url, OFFSCREEN_PATH);
  });

  it('a document that does more says so: its other reasons after MATCH_MEDIA, and its justification', async () => {
    const api = fakeOffscreen();
    await watchFromOffscreen(api, undefined, 'Reads light or dark mode, and reads fetched pages.', ['DOM_PARSER']);
    assert.deepEqual(api.offscreen.created[0].reasons, ['MATCH_MEDIA', 'DOM_PARSER']);
    assert.equal(api.offscreen.created[0].justification, 'Reads light or dark mode, and reads fetched pages.');
  });

  it('polls, as no change event reaches a document that never renders', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const runtime = fakeRuntime();
    const media = fakeMedia(false);
    watchSchemeOffscreen(runtime, media);
    media.matches = true; // Chrome updated it, but fired nothing.
    t.mock.timers.tick(POLL_MS);
    t.mock.timers.tick(POLL_MS);
    assert.deepEqual(runtime.sent, [{ type: TOOLBAR_SCHEME, dark: false }, { type: TOOLBAR_SCHEME, dark: true }]);
  });

  it('startToolbarTheme restores, opens the watcher and handles its reports', async () => {
    const storage = fakeChromeStorage({ local: { [TOOLBAR_DARK_KEY]: true } });
    const action = fakeAction();
    const { offscreen, runtime } = fakeOffscreen();
    /** @type {((message: unknown, sender: {id?: string}) => boolean)[]} */
    const listeners = [];
    const theme = startToolbarTheme({
      storage, action, offscreen,
      runtime: { ...runtime, id: EXTENSION_ID, onMessage: { addListener: (listener) => listeners.push(listener) } },
    });
    await theme.settled();
    assert.deepEqual(action.calls, [toolbarIcon(true)]);
    await watchFromOffscreen({ offscreen, runtime });
    assert.equal(offscreen.created.length, 1);
    assert.equal(listeners[0]({ type: TOOLBAR_SCHEME, dark: false }, self), false); // Never keeps the channel open.
    await theme.settled();
    assert.equal(storage.local.data[TOOLBAR_DARK_KEY], false);
  });
});

describe('scheme reports (pages)', () => {
  it('report only when the scheme differs from what’s stored, then on each change', () => {
    /** @type {boolean[]} */
    const sent = [];
    const media = fakeMedia(false);
    reportColorScheme(media, false, (dark) => sent.push(dark));
    media.flip(true);
    media.flip(true);
    media.flip(false);
    assert.deepEqual(sent, [true, false]);
    // Unknown (the offscreen document can't read storage): it reports once.
    /** @type {boolean[]} */
    const once = [];
    reportColorScheme(fakeMedia(false), undefined, (dark) => once.push(dark));
    assert.deepEqual(once, [false]);
  });

  it('watchColorScheme reads what’s stored, then reports through the runtime', async () => {
    const storage = fakeChromeStorage({ local: { [TOOLBAR_DARK_KEY]: true } });
    const runtime = fakeRuntime();
    const media = fakeMedia(true);
    await watchColorScheme({ storage, runtime }, media);
    assert.deepEqual(runtime.sent, []); // Same as stored.
    media.flip(false);
    assert.deepEqual(runtime.sent, [{ type: TOOLBAR_SCHEME, dark: false }]);
  });

  it('a report the asleep worker misses is dropped quietly', async () => {
    const runtime = { sendMessage: async () => { throw new Error('Could not establish connection.'); } };
    await watchColorScheme({ storage: fakeChromeStorage(), runtime }, fakeMedia(true));
  });
});
