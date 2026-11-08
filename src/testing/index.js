/**
 * The kit's test helpers: a fake `chrome.storage`, Playwright helpers for
 * end-to-end tests, and checks for a packaging test. Node only.
 *
 * @module testing
 */

export { checkRunner, checkToolbarTheme, launchExtension, offscreenEmulator, recordIconCalls, until } from './e2e.js';
export { SYNC_WRITES_PER_MINUTE, fakeChromeStorage } from './fake-storage.js';
export { filesUnder, manifestReferences, missingReferences, zipEntries } from './package.js';
