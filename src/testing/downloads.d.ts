/**
 * A browser that downloads for real, for an extension that names, files or
 * makes downloads. Playwright normally takes downloads over (CDP's
 * `Browser.setDownloadBehavior` set to `allowAndName`), saving them under
 * made-up names where no extension sees them: `downloads.onDeterminingFilename`
 * never fires, and `chrome.downloads.download`'s names are lost. So the
 * profile gets its own Downloads folder (Chrome's `download.default_directory`
 * preference, written before the first start) and the behaviour goes back to
 * Chrome's default: files land on disk as on a person's computer.
 *
 * @module testing/downloads
 */
import type { BrowserType } from 'playwright';
import type { LaunchOptions, LaunchedExtension } from './e2e.js';
/** @import { BrowserType } from 'playwright' */
/** @import { LaunchOptions, LaunchedExtension } from './e2e.js' */
/**
 * Every file under a folder, as paths from it (Chrome's `.crdownload` files
 * of downloads still running left out), sorted.
 *
 * @param {string} dir - The folder.
 * @returns {Promise<string[]>} The files.
 * @example
 * await filesIn(downloads); // ['Trips/Lake.jpg', 'Trips/Lake 2.jpg']
 */
export declare function filesIn(dir: string): Promise<string[]>;
/**
 * Load the unpacked extension at `dir` into a fresh profile whose downloads
 * go to a folder of their own, really.
 *
 * @param {BrowserType} chromium - Playwright's `chromium`.
 * @param {string} dir - The unpacked extension.
 * @param {LaunchOptions} [options] - As `launchExtension`'s.
 * @returns {Promise<LaunchedExtension & {downloads: string}>} The running extension, and its
 *   Downloads folder; `close()` deletes both.
 * @example
 * const { context, downloads, close } = await launchDownloading(chromium, 'extension');
 */
export declare function launchDownloading(chromium: BrowserType, dir: string, options?: LaunchOptions): Promise<LaunchedExtension & {
    downloads: string;
}>;
