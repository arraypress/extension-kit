import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsSaver, createSettingsStore } from '../src/index.js';
import { SYNC_QUOTA_BYTES, fakeChromeStorage } from '../src/testing/index.js';

/** @import { FakeChromeStorage } from '../src/testing/fake-storage.js' */

/** A small schema with one per-computer setting, like an extension's. */
const store = createSettingsStore({
  defaults: { theme: 'auto', days: 7, sites: /** @type {string[]} */ ([]), here: false },
  normalize: (raw) => ({
    theme: ['auto', 'light', 'dark'].includes(/** @type {string} */ (raw.theme)) ? /** @type {string} */ (raw.theme) : 'auto',
    days: Number.isInteger(raw.days) ? /** @type {number} */ (raw.days) : 7,
    sites: Array.isArray(raw.sites) ? raw.sites.filter((site) => typeof site === 'string') : [],
    here: typeof raw.here === 'boolean' ? raw.here : false,
  }),
  localKeys: ['here'],
});
const DEFAULTS = store.defaults;
const UNSYNCED = store.unsyncedKey;

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** A clock the fake's sync write limit reads; tests move it on. */
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, pass: (/** @type {number} */ ms) => { t += ms; } };
};
/** Use up the minute's sync writes. @param {FakeChromeStorage} storage */
const exhaust = async (storage) => {
  for (let i = 0; i < 120; i++) await storage.sync.set({ filler: i });
};
const quiet = () => mock.method(console, 'warn', () => {});
afterEach(() => mock.restoreAll());

describe('settings store', () => {
  it('splits the keys: per-computer ones in local, the rest in sync', () => {
    assert.deepEqual(store.localKeys, ['here']);
    assert.deepEqual(store.syncedKeys, ['theme', 'days', 'sites']);
    assert.equal(UNSYNCED, 'unsyncedSettings');
  });

  it('normalises null and undefined as empty', () => {
    assert.deepEqual(store.normalize(undefined), DEFAULTS);
    assert.deepEqual(store.normalize(null), DEFAULTS);
  });

  it('empty storage gives the defaults', async () => {
    assert.deepEqual(await store.load(fakeChromeStorage()), DEFAULTS);
  });

  it('saves synced settings to sync, one item each, normalised; per-computer ones to local only', async () => {
    const storage = fakeChromeStorage();
    const { settings, synced } = await store.save(storage, { theme: 'dark', days: 3, here: true });
    assert.equal(synced, true);
    assert.deepEqual(settings, { ...DEFAULTS, theme: 'dark', days: 3, here: true });
    assert.deepEqual(storage.sync.data, { theme: 'dark', days: 3 });
    assert.deepEqual(storage.local.data, { here: true });
    assert.equal(storage.sync.writes, 1);
    assert.deepEqual(await store.load(storage), settings);
  });

  it('changing only a per-computer setting writes nothing to sync', async () => {
    const storage = fakeChromeStorage();
    await store.save(storage, { here: true });
    assert.equal(storage.sync.writes, 0);
  });

  it('a per-computer setting found in sync is never used', async () => {
    assert.deepEqual(await store.load(fakeChromeStorage({ sync: { here: true } })), DEFAULTS);
  });

  it('writes only what changed, so another computer’s change meanwhile survives', async () => {
    const storage = fakeChromeStorage();
    await storage.sync.set({ theme: 'light' }); // From another computer, while the page was open.
    await store.save(storage, { days: 3 });
    assert.deepEqual(await store.load(storage), { ...DEFAULTS, theme: 'light', days: 3 });
  });

  it('a value a newer version wrote reads as the default but stays in sync until changed here', async () => {
    const storage = fakeChromeStorage({ sync: { theme: 'sepia' } });
    assert.equal((await store.load(storage)).theme, 'auto');
    await store.save(storage, { days: 10 });
    assert.equal(storage.sync.data.theme, 'sepia');
  });

  it('names the settings an onChanged event touches, including ones held for sync', () => {
    assert.deepEqual(store.changed({ theme: { newValue: 'dark' }, filler: {} }, 'sync'), ['theme']);
    assert.deepEqual(store.changed({ here: { newValue: true } }, 'sync'), []);
    assert.deepEqual(store.changed({ here: { newValue: true } }, 'local'), ['here']);
    assert.deepEqual(store.changed({ [UNSYNCED]: { oldValue: { days: 3 } } }, 'local'), ['days']);
    assert.deepEqual(store.changed({ theme: { newValue: 'dark' } }, 'session'), []);
  });

  it('sync refuses (too many writes a minute): kept here, still read, then retried', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    assert.equal((await store.save(storage, { theme: 'dark', here: true })).synced, false);
    assert.deepEqual(storage.local.data[UNSYNCED], { theme: 'dark' });
    assert.deepEqual(await store.load(storage), { ...DEFAULTS, theme: 'dark', here: true });

    // Another change while sync still refuses: both are kept.
    await store.save(storage, { days: 30 });
    assert.deepEqual(storage.local.data[UNSYNCED], { theme: 'dark', days: 30 });

    time.pass(61_000);
    assert.equal(await store.retryUnsynced(storage), true);
    assert.deepEqual(storage.sync.data, { filler: 119, theme: 'dark', days: 30 });
    assert.deepEqual(storage.local.data, { here: true });
  });

  it('a setting too big for one sync item stays on this computer, untried; the rest still syncs', async () => {
    const warn = quiet();
    const storage = fakeChromeStorage();
    const sites = Array.from({ length: 500 }, (_, i) => `site-number-${i}.example.com`);
    assert.equal((await store.save(storage, { sites, theme: 'dark' })).synced, false);
    assert.deepEqual(storage.sync.data, { theme: 'dark' });
    assert.equal((await store.load(storage)).sites.length, 500);
    assert.equal(warn.mock.callCount(), 0); // Known too big: not even tried.
  });
});

describe('fakeChromeStorage’s sync quotas', () => {
  it('refuses a write that takes sync past 102,400 bytes in all, as Chrome does, and keeps what it had', async () => {
    const storage = fakeChromeStorage();
    const item = 'x'.repeat(8000);
    for (let i = 0; i < 12; i++) await storage.sync.set({ [`k${i}`]: item });
    await assert.rejects(storage.sync.set({ k12: item }), /kQuotaBytes quota exceeded/);
    assert.equal(Object.keys(storage.sync.data).length, 12);
    await storage.sync.set({ k0: 'small' });
    await storage.sync.set({ k12: item });
    assert.equal(SYNC_QUOTA_BYTES, 102_400);
  });
});

describe('settings saver', () => {
  it('a burst of clicks is one sync write, of the last state', async () => {
    const storage = fakeChromeStorage();
    /** @type {unknown[]} */
    const saved = [];
    const saver = createSettingsSaver(store, storage, { delay: 20, onSaved: (settings) => saved.push(settings) });
    for (let i = 0; i < 150; i++) saver.save({ theme: i % 2 ? 'dark' : 'light', days: i });
    assert.deepEqual(saver.pending, { theme: 'dark', days: 149 });
    assert.equal(storage.sync.writes, 0);
    await wait(60);
    await saver.flush();
    assert.equal(storage.sync.writes, 1);
    assert.deepEqual(storage.sync.data, { theme: 'dark', days: 149 });
    assert.equal(saved.length, 1);
    assert.deepEqual(saver.pending, {});
  });

  it('without it, the same burst runs into sync’s write limit', async () => {
    quiet();
    const storage = fakeChromeStorage();
    const results = [];
    for (let i = 0; i < 150; i++) results.push((await store.save(storage, { theme: i % 2 ? 'dark' : 'light' })).synced);
    assert.ok(results.includes(false));
  });

  it('follow: a change made elsewhere comes with this page’s unwritten changes laid over it', async () => {
    const storage = fakeChromeStorage();
    const saver = createSettingsSaver(store, storage, { delay: 10_000 });
    /** @type {unknown[]} */
    const heard = [];
    saver.follow((settings) => heard.push(settings), storage.onChanged);
    saver.save({ days: 3 });
    await storage.sync.set({ theme: 'dark' });
    await storage.settled();
    await storage.local.set({ unrelated: 1 });
    await storage.settled();
    assert.equal(heard.length, 1);
    assert.deepEqual(heard[0], { ...store.normalize({ theme: 'dark' }), days: 3 });
    saver.stop();
  });

  it('flush() writes at once (the page is closing)', async () => {
    const storage = fakeChromeStorage();
    const saver = createSettingsSaver(store, storage, { delay: 10_000 });
    saver.save({ theme: 'dark', here: true });
    await saver.flush();
    assert.deepEqual(storage.sync.data, { theme: 'dark' });
    assert.deepEqual(storage.local.data, { here: true });
    saver.stop();
  });

  it('a refused write is kept here and retried until sync takes it', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    const saver = createSettingsSaver(store, storage, { delay: 5, retryAfter: 20 });
    try {
      saver.save({ days: 14 });
      await saver.flush();
      assert.deepEqual(storage.local.data[UNSYNCED], { days: 14 });
      await wait(50); // A retry or two, still within the minute: still kept.
      assert.deepEqual(storage.local.data[UNSYNCED], { days: 14 });
      time.pass(61_000);
      await wait(50);
      assert.equal(storage.sync.data.days, 14);
      assert.equal(UNSYNCED in storage.local.data, false);
    } finally {
      saver.stop();
    }
  });
});
