/**
 * Debounced saving for an options page. Chrome Sync allows 120 writes a
 * minute, and a person flicking switches can beat that, so changes apply at
 * once on the page but reach storage only once the clicks stop: a burst of
 * toggles is one sync write. If sync refuses anyway, the store keeps the
 * change on this computer and the saver tries again later.
 *
 * @module settings/saver
 */

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
 */
export function createSettingsSaver(store, storage, { delay = 1000, retryAfter = 60_000, onSaved = () => {} } = {}) {
  /** @type {Partial<S>} */
  let pending = {};
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let retryTimer;
  /** @type {Promise<unknown>} */
  let writing = Promise.resolve();

  /**
   * Track a write so `flush()` can be awaited; a failure is logged, never thrown.
   *
   * @param {Promise<void>} promise
   * @returns {Promise<unknown>}
   */
  const track = (promise) => {
    writing = Promise.all([writing, promise.catch((error) => console.error('Saving settings:', error))]);
    return writing;
  };

  function retry() {
    track(store.retryUnsynced(storage).then((synced) => {
      if (!synced) retryTimer = setTimeout(retry, retryAfter);
    }));
  }

  /** Writes start at once, not after earlier ones finish: Chrome applies them in order. */
  function flush() {
    clearTimeout(timer);
    const changes = pending;
    pending = {};
    if (!Object.keys(changes).length) return writing;
    return track(store.save(storage, changes).then(({ settings, synced }) => {
      clearTimeout(retryTimer);
      if (!synced) retryTimer = setTimeout(retry, retryAfter);
      onSaved(settings);
    }));
  }

  return {
    get pending() { return { ...pending }; },
    save(changes) {
      pending = { ...pending, ...changes };
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    stop() {
      clearTimeout(timer);
      clearTimeout(retryTimer);
    },
  };
}
