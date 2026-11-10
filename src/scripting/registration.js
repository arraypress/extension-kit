/**
 * One registered content script kept in step with what may run: registered,
 * updated or unregistered to match, each change after the last, so a quick
 * run of setting and permission changes can't register and unregister out
 * of order. For an extension whose content script runs on every site only
 * while an optional all-sites grant is held, less a "Never on" list.
 *
 * @module scripting/registration
 */

/** @typedef {Omit<chrome.scripting.RegisteredContentScript, 'id' | 'js'> & {js: string[]}} ContentScript The script, but its id: its `js`, `matches` and the rest. */

/**
 * The parts of `chrome.scripting` a registration uses.
 *
 * @typedef {Pick<typeof chrome.scripting, 'getRegisteredContentScripts' | 'registerContentScripts' | 'updateContentScripts' | 'unregisterContentScripts'>} Scripting
 */

/**
 * Keep the content script `id` registered as `want()` says: the script, or
 * null for none. Each call asks `want()` afresh once the change before it is
 * done, so the last call always wins.
 *
 * @param {Scripting} scripting - `chrome.scripting` (or a fake in tests).
 * @param {string} id - The registered script's id.
 * @param {() => Promise<ContentScript | null>} want - What should be registered now (settings and
 *   grants read at the time).
 * @returns {() => Promise<void>} Makes the registration match; rejects if Chrome refuses.
 * @example
 * const sync = contentScriptSync(chrome.scripting, 'prices', async () => (await chrome.permissions.contains({ origins: ALL_SITES })
 *   ? { js: ['content/loader.js'], matches: ALL_SITES, excludeMatches: neverSites.flatMap(hostPatterns), runAt: 'document_idle' }
 *   : null));
 * chrome.permissions.onAdded.addListener(() => sync());
 */
export function contentScriptSync(scripting, id, want) {
  /** The last change, so the next waits for it. */
  let queue = Promise.resolve();
  const apply = async () => {
    const script = await want();
    const registered = (await scripting.getRegisteredContentScripts({ ids: [id] })).length > 0;
    if (!script) {
      if (registered) await scripting.unregisterContentScripts({ ids: [id] });
      return;
    }
    const full = { ...script, id };
    if (registered) await scripting.updateContentScripts([full]);
    else await scripting.registerContentScripts([full]);
  };
  return () => {
    const run = queue.then(apply, apply);
    queue = run.catch(() => {});
    return run;
  };
}
