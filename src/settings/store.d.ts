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
import type { StorageChange, SyncedStorage } from './storage.js';
export type SettingsSchema<S extends Record<string, unknown>> = {
    /**
     * Every setting and its default value.
     */
    defaults: Readonly<S>;
    /**
     * Coerce anything
     * (stored, typed, from a newer version) into valid settings, falling back
     * to the default for what it can't read. Must handle `{}`.
     */
    normalize: (raw: Record<string, unknown>) => S;
    /**
     * Settings kept in
     * `chrome.storage.local`, tied to this computer. Default none.
     */
    localKeys?: readonly (keyof S & string)[];
    /**
     * The local item holding writes sync
     * refused, `{key: value}`. Default `'unsyncedSettings'`.
     */
    unsyncedKey?: string;
};
export type SettingsStore<S extends Record<string, unknown>> = {
    /**
     * The schema's defaults.
     */
    defaults: Readonly<S>;
    /**
     * Settings kept per computer.
     */
    localKeys: readonly (keyof S & string)[];
    /**
     * Settings kept in Chrome Sync.
     */
    syncedKeys: readonly (keyof S & string)[];
    /**
     * The local item holding writes sync refused.
     */
    unsyncedKey: string;
    /**
     * The
     * schema's normaliser; `undefined` or `null` read as `{}`.
     */
    normalize: (raw?: Record<string, unknown> | null) => S;
    /**
     * Read every setting.
     */
    load: (storage: SyncedStorage) => Promise<S>;
    /**
     *   Write synced settings, then retry earlier refusals; resolves to whether
     *   everything reached sync.
     */
    writeSynced: (storage: SyncedStorage, values: Partial<S>) => Promise<boolean>;
    /**
     *   Try again to put earlier refusals into sync.
     */
    retryUnsynced: (storage: SyncedStorage) => Promise<boolean>;
    /**
     *   Save the settings `changes` names, normalised.
     */
    save: (storage: SyncedStorage, changes: Partial<S>) => Promise<{
        settings: S;
        synced: boolean;
    }>;
    /**
     *   The settings a `chrome.storage.onChanged` event touches.
     */
    changed: (changes: Record<string, StorageChange>, area: string) => (keyof S & string)[];
};
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
export declare function createSettingsStore<S extends Record<string, unknown>>({ defaults, normalize: normalizeRaw, localKeys, unsyncedKey }: SettingsSchema<S>): SettingsStore<S>;
