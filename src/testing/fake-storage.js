/**
 * An in-memory `chrome.storage` for tests, behaving as Chrome does: values
 * are stored as JSON, `onChanged` fires only for values that changed, and
 * sync refuses an item over its 8,192-byte quota and more than 120 writes
 * (set or remove) a minute. Tests then check outcomes (what's stored), not
 * calls.
 *
 * @module testing/fake-storage
 */

import { MAX_SYNC_ITEM_BYTES } from '../settings/storage.js';

/** @import { StorageChange } from '../settings/storage.js' */

/** Chrome Sync's write limit: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE`. */
export const SYNC_WRITES_PER_MINUTE = 120;

/**
 * @typedef {(changes: Record<string, StorageChange>, area: string) => unknown} ChangeListener
 */

/**
 * One fake storage area.
 *
 * @typedef {object} FakeArea
 * @property {Record<string, any>} data What it holds, to inspect (and seed) in tests.
 * @property {number} writes How many writes it has taken.
 * @property {(keys?: string | string[] | null) => Promise<Record<string, any>>} get
 * @property {(items: Record<string, unknown>) => Promise<void>} set
 * @property {(keys: string | string[]) => Promise<void>} remove
 */

/**
 * The fake `chrome.storage`.
 *
 * @typedef {object} FakeChromeStorage
 * @property {FakeArea} local `chrome.storage.local`.
 * @property {FakeArea} sync `chrome.storage.sync`, with Chrome's quotas.
 * @property {FakeArea} session `chrome.storage.session`.
 * @property {{addListener(listener: ChangeListener): void}} onChanged `chrome.storage.onChanged`.
 * @property {() => Promise<void>} settled Waits for every listener, including the changes those listeners make.
 */

/**
 * Copy a value the way storage does, through JSON.
 *
 * @param {unknown} value - Anything JSON-able, or undefined.
 * @returns {any} The copy.
 */
const viaJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Make a fake `chrome.storage`.
 *
 * @param {object} [initial] - Starting contents and the clock.
 * @param {Record<string, unknown>} [initial.local] - What local holds.
 * @param {Record<string, unknown>} [initial.sync] - What sync holds.
 * @param {Record<string, unknown>} [initial.session] - What session holds.
 * @param {() => number} [initial.now] - The clock sync's write limit reads. Default `Date.now`.
 * @returns {FakeChromeStorage} The fake.
 * @example
 * const storage = fakeChromeStorage({ sync: { days: 3 } });
 * await store.save(storage, { days: 5 });
 * assert.equal(storage.sync.data.days, 5);
 */
export function fakeChromeStorage({ local = {}, sync = {}, session = {}, now = Date.now } = {}) {
  /** @type {ChangeListener[]} */
  const listeners = [];
  /** @type {unknown[]} */
  const running = [];

  /**
   * @param {string} name
   * @param {Record<string, unknown>} initialData
   * @param {{quotaPerItem?: number, writesPerMinute?: number}} [limits]
   * @returns {FakeArea}
   */
  function area(name, initialData, { quotaPerItem, writesPerMinute } = {}) {
    /** @type {Record<string, any>} */
    const data = viaJson(initialData);
    /** @type {number[]} */
    const recent = [];
    /** @param {Record<string, StorageChange>} changes */
    const fire = (changes) => {
      if (!Object.keys(changes).length) return;
      for (const listener of listeners) running.push(listener(viaJson(changes), name));
    };
    /** A write, counted against the per-minute limit; refused over it, as Chrome does. */
    const take = () => {
      if (writesPerMinute) {
        while (recent.length && recent[0] <= now() - 60_000) recent.shift();
        if (recent.length >= writesPerMinute) throw new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.');
        recent.push(now());
      }
      fake.writes++;
    };
    /** @type {FakeArea} */
    const fake = {
      data,
      writes: 0,
      async get(keys) {
        const wanted = keys == null ? Object.keys(data) : [keys].flat();
        return Object.fromEntries(wanted.filter((key) => key in data).map((key) => [key, viaJson(data[key])]));
      },
      async set(items) {
        for (const [key, value] of Object.entries(items)) {
          if (quotaPerItem && key.length + JSON.stringify(value).length > quotaPerItem) {
            throw new Error('Resource::kQuotaBytesPerItem quota exceeded');
          }
        }
        take();
        /** @type {Record<string, StorageChange>} */
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
          changes[key] = { oldValue: data[key], newValue: viaJson(value) };
          data[key] = viaJson(value);
        }
        fire(changes);
      },
      async remove(keys) {
        take();
        /** @type {Record<string, StorageChange>} */
        const changes = {};
        for (const key of [keys].flat()) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        fire(changes);
      },
    };
    return fake;
  }

  return {
    local: area('local', local),
    sync: area('sync', sync, { quotaPerItem: MAX_SYNC_ITEM_BYTES, writesPerMinute: SYNC_WRITES_PER_MINUTE }),
    session: area('session', session),
    onChanged: { addListener: (listener) => listeners.push(listener) },
    async settled() {
      while (running.length) await Promise.all(running.splice(0));
    },
  };
}
