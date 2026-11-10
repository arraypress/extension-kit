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

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extensionProfile } from './e2e.js';

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
export async function filesIn(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.crdownload'))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name))).sort();
}

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
export async function launchDownloading(chromium, dir, options = {}) {
  const profile = await extensionProfile(chromium, dir, options);
  const downloads = path.join(path.dirname(profile.dir), 'Downloads');
  await mkdir(path.join(profile.dir, 'Default'), { recursive: true });
  await mkdir(downloads, { recursive: true });
  await writeFile(path.join(profile.dir, 'Default', 'Preferences'), JSON.stringify({
    download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
  }));
  const launched = await profile.launch();
  const page = await launched.context.newPage();
  const cdp = await launched.context.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  await cdp.detach();
  await page.close();
  return {
    ...launched,
    downloads,
    async close() {
      await launched.close();
      await profile.remove();
    },
  };
}
