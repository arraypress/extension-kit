/**
 * The kit's Node half, for an extension's build, package and maintenance
 * scripts: never loaded by the extension itself.
 *
 * @module build
 */

export { clonesFromReport, disallowedClones, findDisallowedClones } from './duplication.js';
export { placeholderWarning, printReleaseChecks, repositoryReminder } from './release-checks.js';
export { TOOLBAR_COLORS, TOOLBAR_ICON_COLORS, TOOLBAR_ICON_SIZES, renderToolbarIcons, toolbarIconFile } from './toolbar-icons.js';
export { RUNTIME_ENTRIES, STYLESHEET, vendorKit } from './vendor.js';
export { ZIP_EXCLUDE, shipsFile, zipExtension } from './zip.js';
