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
 *
 * Each extension supplies its schema: the defaults and one normaliser that
 * coerces anything read from storage or a form into valid settings.
 *
 * @module settings/store
 */

import { MAX_SYNC_ITEM_BYTES, isEmpty, pick, syncItemBytes } from './storage.js';

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

  /**
   * Start one sync write of `values` at once; resolves to what sync refused.
   * An item too big for sync isn't even tried.
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
    return storage.sync.set(fits).then(() => refused, (/** @type {unknown} */ error) => {
      console.warn('Settings: Chrome Sync refused the change; keeping it on this computer and trying again later.',
        /** @type {Error | undefined} */ (error)?.message ?? error);
      return { ...refused, ...fits };
    });
  }

  /** @type {SettingsStore<S>['load']} */
  async function load(storage) {
    const [synced, local] = await Promise.all([
      storage.sync.get([...syncedKeys]),
      storage.local.get([...localKeys, unsyncedKey]),
    ]);
    const { [unsyncedKey]: unsynced = {}, ...here } = local;
    return normalize({ ...synced, ...pick(unsynced, syncedKeys), ...here });
  }

  /**
   * One sync write for all of `values` (sync allows 120 a minute), then any
   * that sync refused before. What sync refuses is kept in local, where
   * `load` still reads it, and goes up with the next write or
   * `retryUnsynced`.
   *
   * @type {SettingsStore<S>['writeSynced']}
   */
  async function writeSynced(storage, values) {
    // Sent before anything is awaited, so a page that's closing still gets it out.
    const sending = send(storage, values);
    const { [unsyncedKey]: held } = await storage.local.get([unsyncedKey]);
    let refused = await sending;
    const older = Object.fromEntries(Object.entries(pick(held ?? {}, syncedKeys)).filter(([key]) => !(key in values)));
    if (!isEmpty(older)) refused = { ...(await send(storage, older)), ...refused };
    if (!isEmpty(refused)) await storage.local.set({ [unsyncedKey]: refused });
    else if (held) await storage.local.remove(unsyncedKey);
    return isEmpty(refused);
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
    retryUnsynced: (/** @type {SyncedStorage} */ storage) => writeSynced(storage, {}),
    save,
    changed,
  });
}
