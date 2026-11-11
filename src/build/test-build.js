/**
 * Test builds: copies of an extension folder with what the store build never
 * has (a test hook as the service worker, host access standing in for a
 * click on Chrome's permission prompt, …), in the hidden `.test-builds/`
 * folder, out of the way of the folder people load unpacked.
 *
 * The folder can be moved with {@link TEST_BUILDS_ENV}, so a change can be
 * built and tested while another run (a long live check) uses the usual
 * builds, or a run can use an older build for before-and-after numbers.
 *
 * @module build/test-build
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** The environment variable that moves the test builds' folder (absolute, or relative to the extension's root). */
export const TEST_BUILDS_ENV = 'EXTENSION_TEST_BUILDS';

/** The service worker a test hook is copied to. */
export const HOOK_FILE = 'e2e-hook.js';

/**
 * Where a test build lives: `<root>/.test-builds/<name>`, or
 * `$EXTENSION_TEST_BUILDS/<name>` when that's set.
 *
 * @param {string} root - The extension's repository.
 * @param {string} [name] - The build. Default `e2e`.
 * @param {Readonly<Record<string, string | undefined>>} [env] - Default `process.env`.
 * @returns {string} The build's folder.
 * @example
 * testBuildDir(root);                   // '<root>/.test-builds/e2e'
 * // EXTENSION_TEST_BUILDS=/tmp/before npm run e2e
 * testBuildDir(root, 'e2e-all-sites');  // '/tmp/before/e2e-all-sites'
 */
export function testBuildDir(root, name = 'e2e', env = process.env) {
  return path.resolve(root, env[TEST_BUILDS_ENV] || '.test-builds', name);
}

/**
 * A Chrome extension manifest, as far as a test build changes it.
 *
 * @typedef {{background?: {service_worker?: string}, host_permissions?: string[], permissions?: string[]} & Record<string, unknown>} TestManifest
 */

/**
 * What {@link buildTestCopy} takes.
 *
 * @typedef {object} TestBuild
 * @property {string} from The extension folder.
 * @property {string} to The build's folder ({@link testBuildDir}). Replaced.
 * @property {string} [hook] A script that becomes the service worker (as {@link HOOK_FILE}): one that
 *   imports the real worker and exposes what a test can't reach headlessly (a menu click, the
 *   toolbar button).
 * @property {(manifest: TestManifest) => void} [manifest] Changes the copy's manifest in place.
 * @property {string} [panelOpener] A side panel page (`panel/panel.html`): adds {@link PANEL_OPENER}
 *   (`?tab=<id>`), whose button opens that panel beside the tab the way the toolbar click does
 *   (the kit's `openSidePanel`, during a real click), which Playwright can't click. Its title turns
 *   `opened` (or `error: …`). The kit must be vendored at `vendor/extension-kit/`.
 */

/** The page {@link TestBuild}'s `panelOpener` adds, from the build's root. */
export const PANEL_OPENER = 'e2e/open-panel.html';

/**
 * The opener page's markup (its script a file beside it: extension pages run no inline script).
 *
 * @returns {string} The HTML.
 */
const openerHtml = () => `<!doctype html>
<meta charset="utf-8">
<title>Open the side panel</title>
<!-- Test builds only: a button that does what the toolbar click does, which Playwright can't click. -->
<button id="open" type="button">Open the side panel</button>
<script type="module" src="open-panel.js"></script>
`;

/**
 * The opener page's script.
 *
 * @param {string} panel - The panel page.
 * @returns {string} The module.
 */
const openerScript = (panel) => `import { openSidePanel } from '../vendor/extension-kit/panel/side-panel.js';

const tabId = Number(new URLSearchParams(location.search).get('tab'));
document.getElementById('open').addEventListener('click', () => {
  openSidePanel(chrome.sidePanel, tabId, ${JSON.stringify(panel)}).then(() => { document.title = 'opened'; }, (error) => { document.title = \`error: \${error.message}\`; });
});
`;

/**
 * Copy an extension folder into a test build, with its own hook and manifest.
 *
 * @param {TestBuild} build - From where, to where, and what changes.
 * @returns {Promise<string>} The build's folder.
 * @example
 * await buildTestCopy({
 *   from: path.join(root, 'extension'), to: testBuildDir(root), hook: path.join(root, 'test/e2e/hook.js'),
 *   manifest: (manifest) => { manifest.host_permissions = ['http://127.0.0.1/*']; },
 * });
 */
export async function buildTestCopy({ from, to, hook, manifest: change, panelOpener }) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  const file = path.join(to, 'manifest.json');
  /** @type {TestManifest} */
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (hook) {
    await cp(hook, path.join(to, HOOK_FILE));
    manifest.background = { ...manifest.background, service_worker: HOOK_FILE };
  }
  change?.(manifest);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  if (panelOpener) {
    await mkdir(path.join(to, path.dirname(PANEL_OPENER)), { recursive: true });
    await writeFile(path.join(to, PANEL_OPENER), openerHtml());
    await writeFile(path.join(to, PANEL_OPENER.replace(/\.html$/, '.js')), openerScript(panelOpener));
  }
  return to;
}
