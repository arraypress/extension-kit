/**
 * The kit's test helpers: a fake `chrome.storage`, Playwright helpers for
 * end-to-end tests and a server for their pages, Chrome's install warnings
 * and saved tab groups, and checks for a packaging test. Node only.
 *
 * @module testing
 */

export { checkRunner, checkToolbarTheme, extensionProfile, launchExtension, offscreenEmulator, recordIconCalls, until } from './e2e.js';
export { serve } from './server.js';
export { SYNC_WRITES_PER_MINUTE, fakeChromeStorage } from './fake-storage.js';
export { filesUnder, manifestReferences, missingReferences, referencedPath, zipEntries } from './package.js';
export { savedTabGroups } from './saved-groups.js';
export { installWarnings, warningsAddedBy, withoutPermissions } from './warnings.js';

/**
 * The helpers' types, for a test's JSDoc.
 *
 * @typedef {import('./e2e.js').CheckRunner} CheckRunner
 * @typedef {import('./e2e.js').ExtensionProfile} ExtensionProfile
 * @typedef {import('./e2e.js').LaunchedExtension} LaunchedExtension
 * @typedef {import('./e2e.js').LaunchOptions} LaunchOptions
 * @typedef {import('./saved-groups.js').SavedTabGroup} SavedTabGroup
 * @typedef {import('./warnings.js').Manifest} Manifest
 * @typedef {import('./server.js').Reply} Reply
 * @typedef {import('./server.js').Routes} Routes
 * @typedef {import('./server.js').TestServer} TestServer
 */
