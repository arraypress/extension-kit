/**
 * An in-memory `chrome.storage` for tests, behaving as Chrome does (each point
 * checked against Chromium): values are stored as Chrome converts them (what
 * JSON can't hold is dropped, a `Date` is `{}`), `get` takes a key, keys, an
 * object of defaults or nothing, `onChanged` fires only for values that
 * changed (whatever order an object's keys come in), and every area has
 * Chrome's quotas. Sync refuses an item over 8,192 bytes as Chrome counts them
 * (`syncItemBytes`: UTF-8, `<` six bytes), more than 102,400 bytes or 512
 * items in all, and more than 120 calls a minute or 1,800 an hour of `set`,
 * `remove` or `clear` (each counted by itself, refused calls included); local
 * and session hold 10 MB. Tests then check outcomes (what's stored), not
 * calls.
 *
 * @module testing/fake-storage
 */

import { MAX_SYNC_ITEM_BYTES, sameValue, syncItemBytes } from '../settings/storage.js';

/** @import { StorageChange } from '../settings/storage.js' */

/** Chrome Sync's write limit a minute: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE`. */
export const SYNC_WRITES_PER_MINUTE = 120;

/** Chrome Sync's write limit an hour: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR`. */
export const SYNC_WRITES_PER_HOUR = 1800;

/** All of sync's items together may take this many bytes (`chrome.storage.sync.QUOTA_BYTES`). */
export const SYNC_QUOTA_BYTES = 102_400;

/** The most items sync holds (`chrome.storage.sync.MAX_ITEMS`). */
export const SYNC_MAX_ITEMS = 512;

/** What local and session each hold (`chrome.storage.local.QUOTA_BYTES`), without `unlimitedStorage`. */
export const LOCAL_QUOTA_BYTES = 10_485_760;

/**
 * @typedef {(changes: Record<string, StorageChange>, area: string) => unknown} ChangeListener
 */

/**
 * An `onChanged` event.
 *
 * @template {(...args: any[]) => unknown} L
 * @typedef {object} FakeEvent
 * @property {(listener: L) => void} addListener
 * @property {(listener: L) => void} removeListener
 * @property {(listener: L) => boolean} hasListener
 */

/**
 * One fake storage area.
 *
 * @typedef {object} FakeArea
 * @property {Record<string, any>} data What it holds, to inspect (and seed) in tests.
 * @property {number} writes How many writes (`set`, `remove`, `clear`) it has taken.
 * @property {(keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, any>>} get
 *   A key's or keys' items, an object's keys with its values for the missing ones, or everything.
 * @property {(items: Record<string, unknown>) => Promise<void>} set
 * @property {(keys: string | string[]) => Promise<void>} remove
 * @property {() => Promise<void>} clear
 * @property {(keys?: string | string[] | null) => Promise<number>} getBytesInUse The bytes the keys' items (or all) take.
 * @property {FakeEvent<(changes: Record<string, StorageChange>) => unknown>} onChanged This area's changes.
 */

/**
 * The fake `chrome.storage`.
 *
 * @typedef {object} FakeChromeStorage
 * @property {FakeArea} local `chrome.storage.local`.
 * @property {FakeArea} sync `chrome.storage.sync`, with Chrome's quotas.
 * @property {FakeArea} session `chrome.storage.session`.
 * @property {FakeEvent<ChangeListener>} onChanged `chrome.storage.onChanged`.
 * @property {() => Promise<void>} settled Waits for every listener, including the changes those listeners make.
 */

/** Stands for a value Chrome doesn't store (`undefined`, a function, `NaN`). */
const DROPPED = Symbol('dropped');

/**
 * A value as Chrome stores it: what JSON holds, copied; `undefined`, functions, symbols and
 * numbers that aren't finite dropped from objects (`null` in arrays); any other object (a
 * `Date`, a `RegExp`, a `Map`) as `{}`.
 *
 * @param {unknown} value - What an extension gave `set`.
 * @returns {unknown} The stored copy, or {@link DROPPED}.
 */
function asStored(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : DROPPED;
  if (typeof value !== 'object') return DROPPED;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const stored = asStored(item);
      return stored === DROPPED ? null : stored;
    });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return {};
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, asStored(inner)]).filter(([, inner]) => inner !== DROPPED));
}

/**
 * A copy of what's stored, as `get` and `onChanged` hand it out.
 *
 * @param {unknown} value - A stored value, or undefined.
 * @returns {any} The copy.
 */
const copied = (value) => (value === undefined ? undefined : structuredClone(value));

/**
 * An event's listeners.
 *
 * @template {(...args: any[]) => unknown} L
 * @returns {FakeEvent<L> & {listeners: L[]}} The event, and who listens.
 */
function fakeEvent() {
  /** @type {L[]} */
  const listeners = [];
  return {
    listeners,
    addListener: (listener) => { if (!listeners.includes(listener)) listeners.push(listener); },
    removeListener: (listener) => { if (listeners.includes(listener)) listeners.splice(listeners.indexOf(listener), 1); },
    hasListener: (listener) => listeners.includes(listener),
  };
}

/**
 * A limit on calls in a window of time, as Chrome's quota service keeps one: the window opens
 * with the first call and takes so many; the first call after it has passed opens the next.
 *
 * @param {number} most - Calls a window.
 * @param {number} ms - The window.
 * @param {() => number} now - The clock.
 * @returns {() => boolean} Counts a call; false when it's over the limit.
 */
function callLimit(most, ms, now) {
  let opened = -Infinity;
  let left = 0;
  return () => {
    if (now() >= opened + ms) [opened, left] = [now(), most];
    left -= 1;
    return left >= 0;
  };
}

/**
 * Make a fake `chrome.storage`.
 *
 * @param {object} [initial] - Starting contents and the clock.
 * @param {Record<string, unknown>} [initial.local] - What local holds.
 * @param {Record<string, unknown>} [initial.sync] - What sync holds.
 * @param {Record<string, unknown>} [initial.session] - What session holds.
 * @param {() => number} [initial.now] - The clock sync's write limits read. Default `Date.now`.
 * @returns {FakeChromeStorage} The fake.
 *
 * @example
 * const storage = fakeChromeStorage({ sync: { days: 3 } });
 * await store.save(storage, { days: 5 });
 * assert.equal(storage.sync.data.days, 5);
 */
export function fakeChromeStorage({ local = {}, sync = {}, session = {}, now = Date.now } = {}) {
  /** @type {ReturnType<typeof fakeEvent<ChangeListener>>} */
  const onChanged = fakeEvent();
  /** @type {unknown[]} */
  const running = [];

  /**
   * @param {string} name
   * @param {Record<string, unknown>} initialData
   * @param {{quotaPerItem?: number, quotaBytes: number, maxItems?: number, limited?: boolean}} limits
   * @returns {FakeArea}
   */
  function area(name, initialData, { quotaPerItem, quotaBytes, maxItems, limited = false }) {
    /** @type {Record<string, any>} */
    const data = /** @type {Record<string, any>} */ (asStored(initialData));
    /** @type {ReturnType<typeof fakeEvent<(changes: Record<string, StorageChange>) => unknown>>} */
    const areaChanged = fakeEvent();
    /** Each function's own limits, as Chrome counts them. @type {Map<string, (() => boolean)[]>} */
    const limits = new Map();
    /** @param {Record<string, StorageChange>} changes */
    const fire = (changes) => {
      if (!Object.keys(changes).length) return;
      for (const listener of [...onChanged.listeners]) running.push(listener(copied(changes), name));
      for (const listener of [...areaChanged.listeners]) running.push(listener(copied(changes)));
    };
    /**
     * A call counted against the function's limits (a minute's, an hour's); refused over one, as Chrome does.
     *
     * @param {string} method - `set`, `remove` or `clear`.
     */
    const count = (method) => {
      if (!limited) return;
      if (!limits.has(method)) limits.set(method, [callLimit(SYNC_WRITES_PER_MINUTE, 60_000, now), callLimit(SYNC_WRITES_PER_HOUR, 3_600_000, now)]);
      const [minute, hour] = /** @type {(() => boolean)[]} */ (limits.get(method)).map((take) => take());
      if (!minute) throw new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.');
      if (!hour) throw new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.');
    };
    /** @param {Record<string, unknown>} items @returns {number} */
    const bytes = (items) => Object.entries(items).reduce((sum, [key, value]) => sum + syncItemBytes(key, value), 0);
    /** @type {FakeArea} */
    const fake = {
      data,
      writes: 0,
      onChanged: areaChanged,
      async get(keys) {
        const defaults = keys !== null && typeof keys === 'object' && !Array.isArray(keys) ? /** @type {Record<string, unknown>} */ (asStored(keys)) : {};
        const wanted = keys == null ? Object.keys(data) : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        return Object.fromEntries(wanted.filter((key) => key in data || key in defaults).map((key) => [key, copied(key in data ? data[key] : defaults[key])]));
      },
      async getBytesInUse(keys) {
        const wanted = keys == null ? Object.keys(data) : [keys].flat();
        return bytes(Object.fromEntries(wanted.filter((key) => key in data).map((key) => [key, data[key]])));
      },
      async set(items) {
        count('set');
        const stored = /** @type {Record<string, unknown>} */ (asStored(items));
        for (const [key, value] of Object.entries(stored)) {
          if (quotaPerItem && syncItemBytes(key, value) > quotaPerItem) throw new Error('Resource::kQuotaBytesPerItem quota exceeded');
        }
        const next = { ...data, ...stored };
        if (bytes(next) > quotaBytes) throw new Error('Resource::kQuotaBytes quota exceeded');
        if (maxItems && Object.keys(next).length > maxItems) throw new Error('Resource::kMaxItems quota exceeded');
        fake.writes++;
        /** @type {Record<string, StorageChange>} */
        const changes = {};
        for (const [key, value] of Object.entries(stored)) {
          if (key in data && sameValue(data[key], value)) continue;
          changes[key] = { ...(key in data ? { oldValue: data[key] } : {}), newValue: value };
          data[key] = value;
        }
        fire(changes);
      },
      async remove(keys) {
        count('remove');
        fake.writes++;
        /** @type {Record<string, StorageChange>} */
        const changes = {};
        for (const key of [keys].flat()) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        fire(changes);
      },
      async clear() {
        count('clear');
        fake.writes++;
        /** @type {Record<string, StorageChange>} */
        const changes = {};
        for (const key of Object.keys(data)) {
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        fire(changes);
      },
    };
    return fake;
  }

  return {
    local: area('local', local, { quotaBytes: LOCAL_QUOTA_BYTES }),
    sync: area('sync', sync, { quotaPerItem: MAX_SYNC_ITEM_BYTES, quotaBytes: SYNC_QUOTA_BYTES, maxItems: SYNC_MAX_ITEMS, limited: true }),
    session: area('session', session, { quotaBytes: LOCAL_QUOTA_BYTES }),
    onChanged,
    async settled() {
      while (running.length) await Promise.all(running.splice(0));
    },
  };
}
