/**
 * The kit's test helpers: a fake `chrome.storage`, Playwright helpers for
 * end-to-end tests (time limits, a pool, a browser that passes for a
 * person's) and a server for their pages, Chrome's install warnings and
 * saved tab groups, and checks for a packaging test. Node only.
 *
 * @module testing
 */
export { TEST_BUILDS_ENV, testBuildDir } from '../build/test-build.js';
export { chromeUserAgent, closeOnSignal, realisticBrowser } from './browser.js';
export { CHECK_MS, checkRunner, checkToolbarTheme, extensionProfile, launchExtension, offscreenEmulator, recordIconCalls, until, } from './e2e.js';
export { exitPoint, parseLiveOptions, parseProxy } from './live.js';
export { eachLimited } from '../time/pool.js';
export { filesIn, launchDownloading } from './downloads.js';
export { serve, testCertificate } from './server.js';
export { SYNC_WRITES_PER_MINUTE, fakeChromeStorage } from './fake-storage.js';
export { filesUnder, manifestReferences, missingReferences, referencedPath, zipEntries } from './package.js';
export { savedTabGroups } from './saved-groups.js';
export { installWarnings, warningsAddedBy, withoutPermissions } from './warnings.js';
export type CheckRunner = import('./e2e.js').CheckRunner;
export type ExtensionProfile = import('./e2e.js').ExtensionProfile;
export type LaunchedExtension = import('./e2e.js').LaunchedExtension;
export type LaunchOptions = import('./e2e.js').LaunchOptions;
export type Exit = import('./live.js').Exit;
export type LiveOptions = import('./live.js').LiveOptions;
export type SavedTabGroup = import('./saved-groups.js').SavedTabGroup;
export type Manifest = import('./warnings.js').Manifest;
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
 * @typedef {import('./live.js').Exit} Exit
 * @typedef {import('./live.js').LiveOptions} LiveOptions
 * @typedef {import('./saved-groups.js').SavedTabGroup} SavedTabGroup
 * @typedef {import('./warnings.js').Manifest} Manifest
 * @typedef {import('./server.js').Reply} Reply
 * @typedef {import('./server.js').Routes} Routes
 * @typedef {import('./server.js').TestServer} TestServer
 */
