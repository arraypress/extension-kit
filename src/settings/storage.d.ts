/**
 * The slice of `chrome.storage` the settings store uses, as types, plus the
 * small helpers every part of the store shares.
 *
 * The store never touches the `chrome` global: callers pass `chrome.storage`
 * (or a fake in tests), so the logic runs and is tested unchanged in Node.
 *
 * @module settings/storage
 */
export type StorageArea = {
    /**
     *   Read `keys` (all when null); missing keys are absent from the result.
     */
    get: (keys?: string | string[] | null) => Promise<Record<string, any>>;
    /**
     * Write `items`.
     */
    set: (items: Record<string, unknown>) => Promise<void>;
    /**
     * Remove `keys`.
     */
    remove: (keys: string | string[]) => Promise<void>;
};
export type SyncedStorage = {
    /**
     * `chrome.storage.sync`: follows the user's Chrome Sync.
     */
    sync: StorageArea;
    /**
     * `chrome.storage.local`: this computer only.
     */
    local: StorageArea;
};
export type StorageChange = {
    oldValue?: unknown;
    newValue?: unknown;
};
/**
 * One `chrome.storage` area (`chrome.storage.sync`, `.local`, …), promise form.
 *
 * @typedef {object} StorageArea
 * @property {(keys?: string | string[] | null) => Promise<Record<string, any>>} get
 *   Read `keys` (all when null); missing keys are absent from the result.
 * @property {(items: Record<string, unknown>) => Promise<void>} set Write `items`.
 * @property {(keys: string | string[]) => Promise<void>} remove Remove `keys`.
 */
/**
 * `chrome.storage`, as far as settings need it: the synced area and this
 * computer's own.
 *
 * @typedef {object} SyncedStorage
 * @property {StorageArea} sync `chrome.storage.sync`: follows the user's Chrome Sync.
 * @property {StorageArea} local `chrome.storage.local`: this computer only.
 */
/**
 * One entry of a `chrome.storage.onChanged` event.
 *
 * @typedef {{oldValue?: unknown, newValue?: unknown}} StorageChange
 */
/**
 * Chrome refuses a sync item over 8,192 bytes (key plus JSON value):
 * `chrome.storage.sync.QUOTA_BYTES_PER_ITEM`.
 */
export declare const MAX_SYNC_ITEM_BYTES = 8192;
/**
 * The entries of `object` whose keys are in `keys`, in `keys`' order.
 *
 * @template {Record<string, unknown>} T
 * @param {T} object - Where to pick from.
 * @param {readonly string[]} keys - Which keys to keep; absent ones are skipped.
 * @returns {Partial<T>} A new object.
 * @example
 * pick({ a: 1, b: 2 }, ['b', 'c']); // { b: 2 }
 */
export declare function pick<T extends Record<string, unknown>>(object: T, keys: readonly string[]): Partial<T>;
/**
 * How many bytes sync counts for one item: the key plus the value's JSON,
 * UTF-8 encoded, as Chrome measures `QUOTA_BYTES_PER_ITEM`.
 *
 * @param {string} key - The item's key.
 * @param {unknown} value - The item's value.
 * @returns {number} Bytes.
 */
export declare function syncItemBytes(key: string, value: unknown): number;
/**
 * Whether an object has no own keys.
 *
 * @param {object} object - The object to look at.
 * @returns {boolean} True for `{}`.
 */
export declare function isEmpty(object: object): boolean;
