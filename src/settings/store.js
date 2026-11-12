/**
 * A settings store on `chrome.storage.sync`, one item per setting, like
 * Chrome's own settings: they follow the user to their other computers
 * through their own Chrome Sync, and the developer receives nothing.
 *
 * Settings tied to one computer (say, ones that need a site permission Chrome
 * grants per computer) are named in `localKeys` and kept in
 * `chrome.storage.local` instead. Local also holds any write sync refused
 * (too many writes a minute, or an item over its size limit), kept under
 * `unsyncedKey`, read as if synced, and retried, so a change is never lost.
 * Beside it (`<unsyncedKey>Was`) is what sync held for each when it was
 * refused: once sync holds something else (the setting was changed since on
 * another computer), the held change is the older one and is dropped, not
 * read over the newer one or sent up over it.
 *
 * Holding a change is a read-modify-write of one local item, so it runs
 * under a Web Lock the extension's pages and worker share: two refused
 * writes at once keep both changes, and a retry can't put an older value
 * back over a newer one.
 *
 * Each extension supplies its schema: the defaults and one normaliser that
 * coerces anything read from storage or a form into valid settings.
 *
 * @module settings/store
 */

import { MAX_SYNC_ITEM_BYTES, exclusive, isEmpty, pick, sameValue, syncItemBytes } from './storage.js';

/** @import { StorageChange, SyncedStorage } from './storage.js' */

/**
 * What an extension's settings are.
 *
 * @template {Record<string, unknown>} S
 * @typedef {object} SettingsSchema
 * @property {Readonly<S>} defaults Every setting and its default value.
 * @property {(raw: Record<string, unknown>) => S} normalize Coerce anything
 *   (stored, typed, from a newer version) into valid settings, falling back
 *   to the default for what it can't read. Must handle `{}`.
 * @property {readonly (keyof S & string)[]} [localKeys] Settings kept in
 *   `chrome.storage.local`, tied to this computer. Default none.
 * @property {string} [unsyncedKey] The local item holding writes sync
 *   refused, `{key: value}`. Default `'unsyncedSettings'`.
 */

/**
 * A settings store made by {@link createSettingsStore}.
 *
 * @template {Record<string, unknown>} S
 * @typedef {object} SettingsStore
 * @property {Readonly<S>} defaults The schema's defaults.
 * @property {readonly (keyof S & string)[]} localKeys Settings kept per computer.
 * @property {readonly (keyof S & string)[]} syncedKeys Settings kept in Chrome Sync.
 * @property {string} unsyncedKey The local item holding writes sync refused.
 * @property {(raw?: Record<string, unknown> | null) => S} normalize The
 *   schema's normaliser; `undefined` or `null` read as `{}`.
 * @property {(storage: SyncedStorage) => Promise<S>} load Read every setting.
 * @property {(storage: SyncedStorage, values: Partial<S>) => Promise<boolean>} writeSynced
 *   Write synced settings, then retry earlier refusals; resolves to whether
 *   everything reached sync.
 * @property {(storage: SyncedStorage) => Promise<boolean>} retryUnsynced
 *   Try again to put earlier refusals into sync.
 * @property {(storage: SyncedStorage) => Promise<boolean>} retryable
 *   Whether trying again could help: something held is still the newest and small enough for sync
 *   (an item over sync's size limit stays on this computer however often it's tried).
 * @property {(storage: SyncedStorage, changes: Partial<S>) => Promise<{settings: S, synced: boolean}>} save
 *   Save the settings `changes` names, normalised.
 * @property {(changes: Record<string, StorageChange>, area: string) => (keyof S & string)[]} changed
 *   The settings a `chrome.storage.onChanged` event touches.
 */

/**
 * Make a settings store for an extension's schema.
 *
 * @template {Record<string, unknown>} S
 * @param {SettingsSchema<S>} schema - The defaults, the normaliser and where each setting lives.
 * @returns {SettingsStore<S>} The store; every method takes `chrome.storage` (or a fake).
 * @example
 * const store = createSettingsStore({
 *   defaults: { days: 7 },
 *   normalize: (raw) => ({ days: Number.isInteger(raw.days) ? raw.days : 7 }),
 * });
 * const settings = await store.load(chrome.storage);
 * await store.save(chrome.storage, { days: 14 });
 */
export function createSettingsStore({ defaults, normalize: normalizeRaw, localKeys = [], unsyncedKey = 'unsyncedSettings' }) {
  const allKeys = /** @type {(keyof S & string)[]} */ (Object.keys(defaults));
  const syncedKeys = Object.freeze(allKeys.filter((key) => !localKeys.includes(key)));

  /** @param {Record<string, unknown> | null} [raw] @returns {S} */
  const normalize = (raw) => normalizeRaw(raw ?? {});

  /** The local item holding what sync held for each refused setting: `{key: [value]}`, `[]` for nothing. */
  const wasKey = `${unsyncedKey}Was`;

  /**
   * What an area holds for a key, in a form that tells nothing from `null`.
   *
   * @param {Record<string, unknown>} items - What a `get` gave.
   * @param {string} key - The key.
   * @returns {unknown[]} `[value]`, or `[]` when it holds nothing.
   */
  const seen = (items, key) => (key in items ? [items[key]] : []);

  /**
   * The held changes that are still the newest: sync holds what it did when each was refused.
   * One held before `wasKey` existed has nothing to compare, and counts as newest.
   *
   * @param {Record<string, unknown>} held - The held changes.
   * @param {Record<string, unknown[]>} was - What sync held when each was refused.
   * @param {Record<string, unknown>} synced - What sync holds now.
   * @returns {Record<string, unknown>} The ones to keep.
   */
  const newest = (held, was, synced) => Object.fromEntries(Object.entries(pick(held, syncedKeys))
    .filter(([key]) => !(key in was) || sameValue(was[key], seen(synced, key))));

  /**
   * Start one sync write of `values` at once; resolves to what sync refused.
   * An item too big for sync isn't even tried. When Chrome refuses several
   * together for anything but its write rate, each is tried on its own, so
   * one item Chrome won't take (the whole of sync is full, or it weighs more
   * there than here) doesn't keep the others on this computer.
   *
   * @param {SyncedStorage} storage
   * @param {Record<string, unknown>} values
   * @returns {Promise<Record<string, unknown>>}
   */
  function send(storage, values) {
    const entries = Object.entries(values);
    const fits = Object.fromEntries(entries.filter(([key, value]) => syncItemBytes(key, value) <= MAX_SYNC_ITEM_BYTES));
    const refused = Object.fromEntries(entries.filter(([key]) => !(key in fits)));
    if (isEmpty(fits)) return Promise.resolve(refused);
    return storage.sync.set(fits).then(() => refused, async (/** @type {unknown} */ error) => {
      const message = String(/** @type {Error | undefined} */ (error)?.message ?? error);
      console.warn('Settings: Chrome Sync refused the change; keeping it on this computer and trying again later.', message);
      const keys = Object.keys(fits);
      if (keys.length === 1 || /MAX_WRITE_OPERATIONS/.test(message)) return { ...refused, ...fits };
      const alone = await Promise.all(keys.map((key) => storage.sync.set({ [key]: fits[key] }).then(() => [], () => [key])));
      return { ...refused, ...pick(fits, alone.flat()) };
    });
  }

  /** @type {SettingsStore<S>['load']} */
  async function load(storage) {
    const [synced, local] = await Promise.all([
      storage.sync.get([...syncedKeys]),
      storage.local.get([...localKeys, unsyncedKey, wasKey]),
    ]);
    const { [unsyncedKey]: unsynced = {}, [wasKey]: was = {}, ...here } = local;
    return normalize({ ...synced, ...newest(unsynced, was, synced), ...here });
  }

  /**
   * One sync write for all of `values` (sync allows 120 a minute), then any
   * that sync refused before and that are still the newest. What sync refuses
   * is kept in local, where `load` still reads it, and goes up with the next
   * write or `retryUnsynced`.
   *
   * @type {SettingsStore<S>['writeSynced']}
   */
  function writeSynced(storage, values) {
    // Sent before anything is awaited, so a page that's closing still gets it out.
    const sending = send(storage, values);
    return exclusive(`settings:${unsyncedKey}`, async (waited) => {
      let refused = await sending;
      const sent = Object.keys(values).filter((key) => !(key in refused));
      if (waited && sent.length) {
        // The work waited for may have been a retry that sent an older value after this one: put this one back.
        const now = await storage.sync.get(sent);
        const undone = pick(values, sent.filter((key) => !sameValue(seen(now, key), [values[key]])));
        if (!isEmpty(undone)) refused = { ...refused, ...(await send(storage, undone)) };
      }
      const { [unsyncedKey]: held = {}, [wasKey]: was = {} } = await storage.local.get([unsyncedKey, wasKey]);
      const heldKeys = Object.keys(pick(held, syncedKeys)).filter((key) => !(key in values));
      const synced = await storage.sync.get([...heldKeys, ...Object.keys(refused)]);
      const older = pick(newest(held, was, synced), heldKeys);
      const stillOlder = isEmpty(older) ? {} : await send(storage, older);
      const keep = { ...stillOlder, ...refused };
      const keepWas = Object.fromEntries(Object.keys(keep).map((key) => [key, key in refused || !(key in was) ? seen(synced, key) : was[key]]));
      if (isEmpty(keep)) {
        if (!isEmpty(held) || !isEmpty(was)) await storage.local.remove([unsyncedKey, wasKey]);
      } else if (!sameValue(keep, held) || !sameValue(keepWas, was)) {
        await storage.local.set({ [unsyncedKey]: keep, [wasKey]: keepWas });
      }
      return isEmpty(keep);
    });
  }

  /** @type {SettingsStore<S>['retryable']} */
  async function retryable(storage) {
    const { [unsyncedKey]: held = {}, [wasKey]: was = {} } = await storage.local.get([unsyncedKey, wasKey]);
    const keys = Object.keys(pick(held, syncedKeys));
    if (!keys.length) return false;
    return Object.entries(newest(held, was, await storage.sync.get(keys))).some(([key, value]) => syncItemBytes(key, value) <= MAX_SYNC_ITEM_BYTES);
  }

  /**
   * Only the settings `changes` names are written, so a change made meanwhile
   * on another computer to a different setting survives. Each setting
   * normalises on its own, so nothing is read first and the writes start at
   * once.
   *
   * @type {SettingsStore<S>['save']}
   */
  async function save(storage, changes) {
    const values = pick(normalize(changes), Object.keys(changes));
    const local = pick(values, localKeys);
    const writingLocal = isEmpty(local) ? null : storage.local.set(local);
    const synced = await writeSynced(storage, pick(values, syncedKeys));
    await writingLocal;
    return { settings: await load(storage), synced };
  }

  /**
   * Includes settings held for sync in local, which `load` reads too.
   *
   * @type {SettingsStore<S>['changed']}
   */
  function changed(changes, area) {
    if (area === 'sync') return syncedKeys.filter((key) => key in changes);
    if (area !== 'local') return [];
    const heldChange = changes[unsyncedKey];
    const held = heldChange ? Object.keys({ ...(/** @type {object} */ (heldChange.oldValue)), ...(/** @type {object} */ (heldChange.newValue)) }) : [];
    return allKeys.filter((key) => (localKeys.includes(key) ? key in changes : held.includes(key)));
  }

  return Object.freeze({
    defaults,
    localKeys: Object.freeze([...localKeys]),
    syncedKeys,
    unsyncedKey,
    normalize,
    load,
    writeSynced,
    retryable,
    retryUnsynced: (/** @type {SyncedStorage} */ storage) => writeSynced(storage, {}),
    save,
    changed,
  });
}
