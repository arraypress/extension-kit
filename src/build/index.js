/**
 * The kit's Node half, for an extension's build, package and maintenance
 * scripts: never loaded by the extension itself.
 *
 * @module build
 */

export { clonesFromReport, disallowedClones, findDisallowedClones } from './duplication.js';
export { placeholderWarning, printReleaseChecks, repositoryReminder } from './release-checks.js';
export * as storeFrame from './store-frame.js';
export { HOOK_FILE, PANEL_OPENER, TEST_BUILDS_ENV, buildTestCopy, testBuildDir } from './test-build.js';
export {
  ICON_SIZES, TOOLBAR_COLORS, TOOLBAR_ICON_COLORS, TOOLBAR_ICON_SIZES, renderIcons, renderToolbarIcons, toolbarIconFile,
} from './toolbar-icons.js';
export { RUNTIME_ENTRIES, STYLESHEET, VENDOR_STAMP, checkVendored, packageDir, vendorKit, vendorPackage } from './vendor.js';
export { ZIP_EXCLUDE, shipsFile, zipExtension } from './zip.js';
