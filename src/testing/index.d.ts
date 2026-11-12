/**
 * The kit's test helpers: a fake `chrome.storage`, a fake on-device model, Playwright helpers for
 * end-to-end tests (time limits, a pool, a browser that passes for a
 * person's) and a server for their pages, Chrome's install warnings and
 * saved tab groups, and checks for a packaging test. Node only.
 *
 * @module testing
 */
export { TEST_BUILDS_ENV, testBuildDir } from '../build/test-build.js';
export { chromeUserAgent, closeOnSignal, realisticBrowser } from './browser.js';
export { CHECK_MS, checkRunner, checkToolbarTheme, extensionProfile, launchExtension, offscreenEmulator, recordIconCalls, runChecks, stopWorker, until, } from './e2e.js';
export { exitPoint, parseLiveOptions, parseProxy } from './live.js';
export { REPORT_MARKER, liveUsage, reportFolder, runLiveCheck } from './live-run.js';
export { eachLimited } from '../time/pool.js';
export { filesIn, launchDownloading } from './downloads.js';
export { fakeLanguageModel } from './fake-model.js';
export { messageLookup, readMessages } from './messages.js';
export { heartbeat } from './heartbeat.js';
export { playPermissionPrompt } from './prompt.js';
export { callTabModule, nodeAttribute, nodeText, pierceNodes, tabIdOf } from './pages.js';
export { serve, testCertificate } from './server.js';
export { LOCAL_QUOTA_BYTES, SYNC_MAX_ITEMS, SYNC_QUOTA_BYTES, SYNC_WRITES_PER_HOUR, SYNC_WRITES_PER_MINUTE, fakeChromeStorage, } from './fake-storage.js';
export { filesUnder, manifestReferences, missingReferences, referencedPath, zipEntries } from './package.js';
export { savedTabGroups } from './saved-groups.js';
export { installWarnings, warningsAddedBy, withoutPermissions } from './warnings.js';
export type CheckRunner = import('./e2e.js').CheckRunner;
export type FakeLanguageModel = import('./fake-model.js').FakeLanguageModel;
export type FakeModelState = import('./fake-model.js').FakeModelState;
export type ExtensionProfile = import('./e2e.js').ExtensionProfile;
export type LaunchedExtension = import('./e2e.js').LaunchedExtension;
export type LaunchOptions = import('./e2e.js').LaunchOptions;
export type Messages = import('./messages.js').Messages;
export type CdpNode = import('./pages.js').CdpNode;
export type Exit = import('./live.js').Exit;
export type LiveOptions = import('./live.js').LiveOptions;
export type LiveSite = import('./live-run.js').LiveSite;
export type SavedTabGroup = import('./saved-groups.js').SavedTabGroup;
export type Manifest = import('./warnings.js').Manifest;
export type Reply = import('./server.js').Reply;
export type Routes = import('./server.js').Routes;
export type TestServer = import('./server.js').TestServer;
/**
 * The helpers' types, for a test's JSDoc.
 *
 * @typedef {import('./e2e.js').CheckRunner} CheckRunner
 * @typedef {import('./fake-model.js').FakeLanguageModel} FakeLanguageModel
 * @typedef {import('./fake-model.js').FakeModelState} FakeModelState
 * @typedef {import('./e2e.js').ExtensionProfile} ExtensionProfile
 * @typedef {import('./e2e.js').LaunchedExtension} LaunchedExtension
 * @typedef {import('./e2e.js').LaunchOptions} LaunchOptions
 * @typedef {import('./messages.js').Messages} Messages
 * @typedef {import('./pages.js').CdpNode} CdpNode
 * @typedef {import('./live.js').Exit} Exit
 * @typedef {import('./live.js').LiveOptions} LiveOptions
 * @typedef {import('./live-run.js').LiveSite} LiveSite
 * @typedef {import('./saved-groups.js').SavedTabGroup} SavedTabGroup
 * @typedef {import('./warnings.js').Manifest} Manifest
 * @typedef {import('./server.js').Reply} Reply
 * @typedef {import('./server.js').Routes} Routes
 * @typedef {import('./server.js').TestServer} TestServer
 */
