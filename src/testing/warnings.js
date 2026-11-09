/**
 * Chrome's own install warnings for a manifest ("Read your browsing
 * history"), the lines its install dialog and the Chrome Web Store list, read
 * with `chrome.management.getPermissionWarningsByManifest` (no `management`
 * permission needed) in a loaded extension's service worker. For an e2e check
 * that a permission adds no warning, or that the warnings are exactly the
 * ones the store listing explains.
 *
 * @module testing/warnings
 */

/** @import { Worker } from 'playwright' */

/**
 * A manifest, as `manifest.json` parses.
 *
 * @typedef {Record<string, unknown>} Manifest
 */

/**
 * The manifest less some permissions (from `permissions`, `optional_permissions`
 * and `host_permissions`). Pure: `manifest` is left as it was.
 *
 * @param {Manifest} manifest - The manifest.
 * @param {readonly string[]} names - The permissions (or host patterns) to leave out.
 * @returns {Manifest} A copy without them.
 * @example
 * withoutPermissions({permissions: ['tabs', 'alarms']}, ['alarms']); // → {permissions: ['tabs']}
 */
export function withoutPermissions(manifest, names) {
  const copy = { ...manifest };
  for (const key of ['permissions', 'optional_permissions', 'host_permissions']) {
    const list = manifest[key];
    if (Array.isArray(list)) copy[key] = list.filter((name) => !names.includes(name));
  }
  return copy;
}

/**
 * Chrome's install warnings for a manifest, as this browser words them.
 *
 * @param {Worker} worker - A loaded extension's service worker (`launchExtension`'s `worker`).
 * @param {Manifest} manifest - The manifest to ask about (it needn't be the loaded extension's).
 * @returns {Promise<string[]>} The warnings, in Chrome's order.
 * @example
 * assert.deepEqual(await installWarnings(worker, manifest), ['Read your browsing history']);
 */
export function installWarnings(worker, manifest) {
  return worker.evaluate((text) => chrome.management.getPermissionWarningsByManifest(text), JSON.stringify(manifest));
}

/**
 * Chrome's install warnings for a manifest, with and without some permissions,
 * and the ones only the permissions bring (a warning they reword counts).
 *
 * @param {Worker} worker - A loaded extension's service worker.
 * @param {Manifest} manifest - The manifest.
 * @param {readonly string[]} names - The permissions in question.
 * @returns {Promise<{warnings: string[], without: string[], added: string[]}>} The warnings with
 *   them, without them, and those in the first list only.
 * @example
 * const { warnings, added } = await warningsAddedBy(worker, manifest, ['alarms']);
 * assert.deepEqual(added, []); // alarms asks the user nothing
 */
export async function warningsAddedBy(worker, manifest, names) {
  const warnings = await installWarnings(worker, manifest);
  const without = await installWarnings(worker, withoutPermissions(manifest, names));
  return { warnings, without, added: warnings.filter((warning) => !without.includes(warning)) };
}
