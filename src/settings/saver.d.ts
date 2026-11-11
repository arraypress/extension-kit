/**
 * Debounced saving for an options page. Chrome Sync allows 120 writes a
 * minute, and a person flicking switches can beat that, so changes apply at
 * once on the page but reach storage only once the clicks stop: a burst of
 * toggles is one sync write. If sync refuses anyway, the store keeps the
 * change on this computer and the saver tries again later.
 *
 * @module settings/saver
 */
import type { SettingsStore } from './store.js';
import type { SyncedStorage } from './storage.js';
export type SaverOptions<S extends Record<string, unknown>> = {
    /**
     * Quiet time before a write, ms. Default 1000.
     */
    delay?: number;
    /**
     * Wait before retrying what sync refused, ms. Default 60,000.
     */
    retryAfter?: number;
    /**
     * Called with every setting after each write.
     */
    onSaved?: (settings: S) => void;
};
export type SettingsSaver<S extends Record<string, unknown>> = {
    /**
     * A copy of the changes not yet written, to lay over what storage holds.
     */
    pending: Partial<S>;
    /**
     * Queue `changes`; the write starts once `delay` passes quietly.
     */
    save: (changes: Partial<S>) => void;
    /**
     * Write what's queued now (call it as the page is hidden);
     * resolves once every write so far has finished.
     */
    flush: () => Promise<unknown>;
    /**
     * Cancel the timers (tests, or a page being torn down).
     */
    stop: () => void;
    /**
     *   Hear the settings change elsewhere (another tab, another computer through sync):
     *   `onChange` gets them all, this page's changes not yet written laid over them. `events` is
     *   `chrome.storage.onChanged`.
     */
    follow: (onChange: (settings: S) => void, events: {
        addListener(listener: (changes: Record<string, import('./storage.js').StorageChange>, area: string) => void): void;
    }) => void;
};
/** @import { SettingsStore } from './store.js' */
/** @import { SyncedStorage } from './storage.js' */
/**
 * @template {Record<string, unknown>} S
 * @typedef {object} SaverOptions
 * @property {number} [delay] Quiet time before a write, ms. Default 1000.
 * @property {number} [retryAfter] Wait before retrying what sync refused, ms. Default 60,000.
 * @property {(settings: S) => void} [onSaved] Called with every setting after each write.
 */
/**
 * @template {Record<string, unknown>} S
 * @typedef {object} SettingsSaver
 * @property {Partial<S>} pending A copy of the changes not yet written, to lay over what storage holds.
 * @property {(changes: Partial<S>) => void} save Queue `changes`; the write starts once `delay` passes quietly.
 * @property {() => Promise<unknown>} flush Write what's queued now (call it as the page is hidden);
 *   resolves once every write so far has finished.
 * @property {() => void} stop Cancel the timers (tests, or a page being torn down).
 * @property {(onChange: (settings: S) => void, events: {addListener(listener: (changes: Record<string, import('./storage.js').StorageChange>, area: string) => void): void}) => void} follow
 *   Hear the settings change elsewhere (another tab, another computer through sync):
 *   `onChange` gets them all, this page's changes not yet written laid over them. `events` is
 *   `chrome.storage.onChanged`.
 */
/**
 * Make a debounced saver over a settings store.
 *
 * @template {Record<string, unknown>} S
 * @param {SettingsStore<S>} store - The extension's settings store.
 * @param {SyncedStorage} storage - `chrome.storage`, or a fake.
 * @param {SaverOptions<S>} [options] - Timing and the saved callback.
 * @returns {SettingsSaver<S>} The saver.
 * @example
 * const saver = createSettingsSaver(store, chrome.storage, { onSaved: showSaved });
 * toggle.addEventListener('change', () => saver.save({ compact: toggle.checked }));
 * addEventListener('pagehide', () => saver.flush());
 * saver.follow((settings) => show(settings), chrome.storage.onChanged);
 */
export declare function createSettingsSaver<S extends Record<string, unknown>>(store: SettingsStore<S>, storage: SyncedStorage, { delay, retryAfter, onSaved }?: SaverOptions<S>): SettingsSaver<S>;
