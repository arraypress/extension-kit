import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SYNC_ITEM_BYTES, createSettingsSaver, createSettingsStore, syncItemBytes } from '../src/index.js';
import { exclusive, sameValue } from '../src/settings/storage.js';
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
/**
 * The storage with every call a task later, as Chrome's are (they cross to the browser), so
 * calls from two places interleave as they do there. `refuse` says which sync writes Chrome turns away.
 *
 * @param {FakeChromeStorage} storage
 * @param {(items: Record<string, unknown>) => boolean} [refuse]
 * @returns {import('../src/settings/storage.js').SyncedStorage}
 */
const acrossProcesses = (storage, refuse = () => false) => {
  /** @param {FakeChromeStorage['sync']} area @param {boolean} synced */
  const later = (area, synced) => ({
    get: async (/** @type {string | string[] | null} */ keys = null) => { await wait(0); return area.get(keys); },
    set: async (/** @type {Record<string, unknown>} */ items) => {
      await wait(0);
      if (synced && refuse(items)) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      return area.set(items);
    },
    remove: async (/** @type {string | string[]} */ keys) => { await wait(0); return area.remove(keys); },
  });
  return { sync: later(storage.sync, true), local: later(storage.local, false) };
};
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

describe('what sync counts for an item', () => {
  it('counts as Chrome’s JSON writer spells it: “<” and the line separators six bytes each, the rest UTF-8', () => {
    assert.equal(syncItemBytes('k', 'ab'), 5); // k"ab"
    assert.equal(syncItemBytes('k', 'a<b'), 11); // k"a<b"
    assert.equal(syncItemBytes('k', '  '), 15);
    assert.equal(syncItemBytes('é', 'é'), 6); // two bytes each, and the quotes
    assert.equal(syncItemBytes('k', { a: ['<'] }), 1 + '{"a":["<"]}'.length + 5);
  });

  it('an item of “<” that JSON.stringify calls small is known too big, and kept here untried', async () => {
    const warn = quiet();
    const storage = fakeChromeStorage();
    const theme = '<b>'.repeat(2000); // 6,000 characters; 16,000 bytes in sync.
    assert.ok(syncItemBytes('theme', theme) > MAX_SYNC_ITEM_BYTES);
    const wide = createSettingsStore({ defaults: { theme: '', days: 7 }, normalize: (raw) => ({ theme: String(raw.theme ?? ''), days: Number(raw.days ?? 7) }) });
    assert.equal((await wide.save(storage, { theme, days: 3 })).synced, false);
    assert.deepEqual(storage.sync.data, { days: 3 });
    assert.equal(warn.mock.callCount(), 0);
  });

  it('sameValue reads objects alike whatever their keys’ order (Chrome sorts them)', () => {
    assert.equal(sameValue({ a: 1, b: [{ d: 1, c: 2 }] }, { b: [{ c: 2, d: 1 }], a: 1 }), true);
    assert.equal(sameValue([1, 2], [2, 1]), false);
    assert.equal(sameValue([], [null]), false);
  });
});

describe('held changes, with two writers at once', () => {
  it('two writes refused at once are both kept', async () => {
    quiet();
    const fake = fakeChromeStorage();
    const storage = acrossProcesses(fake, () => true);
    await Promise.all([store.writeSynced(storage, { theme: 'dark' }), store.writeSynced(storage, { days: 30 })]);
    assert.deepEqual(fake.local.data[UNSYNCED], { theme: 'dark', days: 30 });
    assert.deepEqual(await store.load(storage), { ...DEFAULTS, theme: 'dark', days: 30 });
  });

  it('a retry of an older held value can’t land over a newer save made meanwhile', async () => {
    const fake = fakeChromeStorage({ local: { [UNSYNCED]: { days: 1 } } });
    const storage = acrossProcesses(fake);
    await Promise.all([store.retryUnsynced(storage), store.save(storage, { days: 2 })]);
    assert.equal(fake.sync.data.days, 2);
    assert.equal(UNSYNCED in fake.local.data, false);
  });

  it('one item Chrome refuses doesn’t keep the ones written with it out of sync', async () => {
    quiet();
    const fake = fakeChromeStorage();
    const storage = acrossProcesses(fake, (items) => 'theme' in items);
    assert.equal((await store.save(storage, { theme: 'dark', days: 30 })).synced, false);
    assert.deepEqual(fake.sync.data, { days: 30 });
    assert.deepEqual(fake.local.data[UNSYNCED], { theme: 'dark' });
  });

  it('refused for the write rate: nothing is tried one by one (each would be refused too)', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    const set = mock.method(storage.sync, 'set');
    await store.save(storage, { theme: 'dark', days: 30 });
    assert.equal(set.mock.callCount(), 1);
  });

  it('exclusive() runs work one at a time and says who waited, with Web Locks or without', async () => {
    for (const withLocks of [true, false]) {
      const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      if (!withLocks) Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
      try {
        /** @type {string[]} */
        const order = [];
        /** @param {string} name */
        const work = (name) => async (/** @type {boolean} */ waited) => {
          order.push(`${name} in${waited ? ' (waited)' : ''}`);
          await wait(5);
          order.push(`${name} out`);
          return name;
        };
        assert.deepEqual(await Promise.all([exclusive('test-lock', work('a')), exclusive('test-lock', work('b'))]), ['a', 'b']);
        assert.deepEqual(order, ['a in', 'a out', 'b in (waited)', 'b out']);
        await assert.rejects(exclusive('test-lock', async () => { throw new Error('no'); }), /no/);
        assert.equal(await exclusive('test-lock', async (/** @type {boolean} */ waited) => waited), false);
      } finally {
        if (real) Object.defineProperty(globalThis, 'navigator', real);
      }
    }
  });
});

describe('a held change and a newer one from another computer', () => {
  it('the newer one is read, and the held one is dropped, not sent up over it', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now, sync: { days: 5 } });
    await exhaust(storage);
    await store.save(storage, { days: 1, theme: 'dark' }); // Refused: held here.
    assert.equal((await store.load(storage)).days, 1);

    storage.sync.data.days = 2; // The other computer's change arrives through sync.
    assert.deepEqual(await store.load(storage), { ...DEFAULTS, days: 2, theme: 'dark' });
    assert.equal(await store.retryable(storage), true); // The theme can still go up.

    time.pass(61_000);
    assert.equal(await store.retryUnsynced(storage), true);
    assert.equal(storage.sync.data.days, 2);
    assert.equal(storage.sync.data.theme, 'dark');
    assert.deepEqual(Object.keys(storage.local.data), []);
  });

  it('a setting sync never held is the newest until sync holds one', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    await store.save(storage, { days: 1 });
    assert.equal((await store.load(storage)).days, 1);
    storage.sync.data.days = 9;
    assert.equal((await store.load(storage)).days, 9);
  });

  it('a change held by a version before this one (nothing to compare) is still read and retried', async () => {
    const storage = fakeChromeStorage({ local: { [UNSYNCED]: { days: 3 } }, sync: { days: 8 } });
    assert.equal((await store.load(storage)).days, 3);
    assert.equal(await store.retryUnsynced(storage), true);
    assert.equal(storage.sync.data.days, 3);
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
  it('nothing is retried while all that’s held is too big for sync', async () => {
    const storage = fakeChromeStorage();
    const retries = mock.fn(store.retryUnsynced);
    const saver = createSettingsSaver({ ...store, retryUnsynced: retries }, storage, { delay: 5, retryAfter: 10 });
    try {
      saver.save({ sites: Array.from({ length: 500 }, (_, i) => `site-number-${i}.example.com`) });
      await saver.flush();
      await wait(60);
      assert.equal(retries.mock.callCount(), 0);
      assert.equal((await store.load(storage)).sites.length, 500);
    } finally {
      saver.stop();
    }
  });
});
