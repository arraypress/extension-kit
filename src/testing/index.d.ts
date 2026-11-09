/**
 * The kit's test helpers: a fake `chrome.storage`, Playwright helpers for
 * end-to-end tests and a server for their pages, and checks for a packaging
 * test. Node only.
 *
 * @module testing
 */
export { checkRunner, checkToolbarTheme, extensionProfile, launchExtension, offscreenEmulator, recordIconCalls, until } from './e2e.js';
export { serve } from './server.js';
export { SYNC_WRITES_PER_MINUTE, fakeChromeStorage } from './fake-storage.js';
export { filesUnder, manifestReferences, missingReferences, zipEntries } from './package.js';
export type CheckRunner = import('./e2e.js').CheckRunner;
export type ExtensionProfile = import('./e2e.js').ExtensionProfile;
export type LaunchedExtension = import('./e2e.js').LaunchedExtension;
export type LaunchOptions = import('./e2e.js').LaunchOptions;
export type Reply = import('./server.js').Reply;
export type Routes = import('./server.js').Routes;
export type TestServer = import('./server.js').TestServer;
/**
 * The helpers' types, for a test's JSDoc.
 *
 * @typedef {import('./e2e.js').CheckRunner} CheckRunner
 * @typedef {import('./e2e.js').ExtensionProfile} ExtensionProfile
 * @typedef {import('./e2e.js').LaunchedExtension} LaunchedExtension
 * @typedef {import('./e2e.js').LaunchOptions} LaunchOptions
 * @typedef {import('./server.js').Reply} Reply
 * @typedef {import('./server.js').Routes} Routes
 * @typedef {import('./server.js').TestServer} TestServer
 */
