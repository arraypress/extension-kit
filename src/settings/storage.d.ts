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
 * How many bytes sync counts for one item, as Chrome measures
 * `QUOTA_BYTES_PER_ITEM`: the key plus the value's JSON as Chrome's own
 * writer spells it, UTF-8 encoded. That writer (`base::WriteJson`) escapes
 * `<` as `\u003C` and U+2028 / U+2029 as `\u2028` / `\u2029`, six bytes each,
 * so text full of `<` (an HTML template) weighs far more in sync than its
 * `JSON.stringify` length says. Checked against Chromium's
 * `settings_storage_quota_enforcer.cc` and `base/json/string_escape.cc`.
 *
 * @param {string} key - The item's key.
 * @param {unknown} value - The item's value.
 * @returns {number} Bytes.
 * @example
 * syncItemBytes('k', 'a<b'); // 11: k + "a\u003Cb"
 */
export declare function syncItemBytes(key: string, value: unknown): number;
/**
 * Whether two stored values are the same, whatever order their objects' keys come in.
 *
 * @param {unknown} a - One value.
 * @param {unknown} b - The other.
 * @returns {boolean} True when they'd be stored alike.
 * @example
 * sameValue({ a: 1, b: [2] }, { b: [2], a: 1 }); // true
 */
export declare function sameValue(a: unknown, b: unknown): boolean;
/**
 * Run `work` while nothing else runs under the same name: in this page, the
 * extension's other pages and its service worker alike (Web Locks, which an
 * extension's contexts share), so a read-modify-write of one storage item
 * can't interleave with another. `work` is told whether it had to wait.
 *
 * @template T
 * @param {string} name - The lock's name.
 * @param {(waited: boolean) => Promise<T>} work - What to do; `waited` is true when other work held the name first.
 * @returns {Promise<T>} What `work` gives.
 * @example
 * await exclusive('unsyncedSettings', async () => storage.local.set({ held: { ...(await storage.local.get('held')).held, days } }));
 */
export declare function exclusive<T>(name: string, work: (waited: boolean) => Promise<T>): Promise<T>;
/**
 * Whether an object has no own keys.
 *
 * @param {object} object - The object to look at.
 * @returns {boolean} True for `{}`.
 */
export declare function isEmpty(object: object): boolean;
