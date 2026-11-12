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
import type { StorageChange } from '../settings/storage.js';
/** @import { StorageChange } from '../settings/storage.js' */
/** Chrome Sync's write limit a minute: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE`. */
export declare const SYNC_WRITES_PER_MINUTE = 120;
/** Chrome Sync's write limit an hour: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR`. */
export declare const SYNC_WRITES_PER_HOUR = 1800;
/** All of sync's items together may take this many bytes (`chrome.storage.sync.QUOTA_BYTES`). */
export declare const SYNC_QUOTA_BYTES = 102400;
/** The most items sync holds (`chrome.storage.sync.MAX_ITEMS`). */
export declare const SYNC_MAX_ITEMS = 512;
/** What local and session each hold (`chrome.storage.local.QUOTA_BYTES`), without `unlimitedStorage`. */
export declare const LOCAL_QUOTA_BYTES = 10485760;
export type ChangeListener = (changes: Record<string, StorageChange>, area: string) => unknown;
export type FakeEvent<L extends (...args: any[]) => unknown> = {
    addListener: (listener: L) => void;
    removeListener: (listener: L) => void;
    hasListener: (listener: L) => boolean;
};
export type FakeArea = {
    /**
     * What it holds, to inspect (and seed) in tests.
     */
    data: Record<string, any>;
    /**
     * How many writes (`set`, `remove`, `clear`) it has taken.
     */
    writes: number;
    /**
     *   A key's or keys' items, an object's keys with its values for the missing ones, or everything.
     */
    get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, any>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
    clear: () => Promise<void>;
    /**
     * The bytes the keys' items (or all) take.
     */
    getBytesInUse: (keys?: string | string[] | null) => Promise<number>;
    /**
     * This area's changes.
     */
    onChanged: FakeEvent<(changes: Record<string, StorageChange>) => unknown>;
};
export type FakeChromeStorage = {
    /**
     * `chrome.storage.local`.
     */
    local: FakeArea;
    /**
     * `chrome.storage.sync`, with Chrome's quotas.
     */
    sync: FakeArea;
    /**
     * `chrome.storage.session`.
     */
    session: FakeArea;
    /**
     * `chrome.storage.onChanged`.
     */
    onChanged: FakeEvent<ChangeListener>;
    /**
     * Waits for every listener, including the changes those listeners make.
     */
    settled: () => Promise<void>;
};
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
export declare function fakeChromeStorage({ local, sync, session, now }?: {
    local?: Record<string, unknown>;
    sync?: Record<string, unknown>;
    session?: Record<string, unknown>;
    now?: () => number;
}): FakeChromeStorage;
