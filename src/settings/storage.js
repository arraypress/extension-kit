/**
 * The slice of `chrome.storage` the settings store uses, as types, plus the
 * small helpers every part of the store shares.
 *
 * The store never touches the `chrome` global: callers pass `chrome.storage`
 * (or a fake in tests), so the logic runs and is tested unchanged in Node.
 *
 * @module settings/storage
 */

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
export const MAX_SYNC_ITEM_BYTES = 8192;

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
export function pick(object, keys) {
  return /** @type {Partial<T>} */ (Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]])));
}

/** What Chrome's JSON writer spells as six bytes where `JSON.stringify` writes fewer: `<` (one byte), U+2028 and U+2029 (three each). */
const WIDER_IN_CHROME = /[<\u2028\u2029]/g;

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
export function syncItemBytes(key, value) {
  const json = String(JSON.stringify(value));
  let wider = 0;
  for (const [character] of json.matchAll(WIDER_IN_CHROME)) wider += character === '<' ? 5 : 3;
  return new TextEncoder().encode(key + json).length + wider;
}

/**
 * A value as text that reads the same however its objects' keys are ordered:
 * Chrome hands a stored object back with its keys sorted.
 *
 * @param {unknown} value - Anything JSON can hold.
 * @returns {string} Its JSON, object keys sorted.
 */
function canonical(value) {
  return String(JSON.stringify(value, (_, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner)
    ? Object.fromEntries(Object.keys(inner).sort().map((key) => [key, inner[key]]))
    : inner)));
}

/**
 * Whether two stored values are the same, whatever order their objects' keys come in.
 *
 * @param {unknown} a - One value.
 * @param {unknown} b - The other.
 * @returns {boolean} True when they'd be stored alike.
 * @example
 * sameValue({ a: 1, b: [2] }, { b: [2], a: 1 }); // true
 */
export function sameValue(a, b) {
  return canonical(a) === canonical(b);
}

/** Where there are no Web Locks (an old Node): each name's last piece of work, so the next waits for it. @type {Map<string, Promise<unknown>>} */
const chains = new Map();

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
export async function exclusive(name, work) {
  const locks = /** @type {{navigator?: {locks?: LockManager}}} */ (globalThis).navigator?.locks;
  if (locks) {
    /** @type {{value: T} | null} */
    const free = await locks.request(name, { ifAvailable: true }, async (lock) => (lock ? { value: await work(false) } : null));
    return free ? free.value : locks.request(name, () => work(true));
  }
  const before = chains.get(name);
  const run = (before ?? Promise.resolve()).then(() => work(before !== undefined));
  const settled = run.catch(() => {});
  chains.set(name, settled);
  settled.then(() => { if (chains.get(name) === settled) chains.delete(name); });
  return run;
}

/**
 * Whether an object has no own keys.
 *
 * @param {object} object - The object to look at.
 * @returns {boolean} True for `{}`.
 */
export function isEmpty(object) {
  return Object.keys(object).length === 0;
}
