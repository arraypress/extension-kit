/**
 * An in-memory `chrome.storage` for tests, behaving as Chrome does: values
 * are stored as JSON, `onChanged` fires only for values that changed, and
 * sync refuses an item over its 8,192-byte quota and more than 120 writes
 * (set or remove) a minute. Tests then check outcomes (what's stored), not
 * calls.
 *
 * @module testing/fake-storage
 */
import type { StorageChange } from '../settings/storage.js';
/** @import { StorageChange } from '../settings/storage.js' */
/** Chrome Sync's write limit: `chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE`. */
export declare const SYNC_WRITES_PER_MINUTE = 120;
export type ChangeListener = (changes: Record<string, StorageChange>, area: string) => unknown;
export type FakeArea = {
    /**
     * What it holds, to inspect (and seed) in tests.
     */
    data: Record<string, any>;
    /**
     * How many writes it has taken.
     */
    writes: number;
    get: (keys?: string | string[] | null) => Promise<Record<string, any>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
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
    onChanged: {
        addListener(listener: ChangeListener): void;
    };
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
 * @param {() => number} [initial.now] - The clock sync's write limit reads. Default `Date.now`.
 * @returns {FakeChromeStorage} The fake.
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
