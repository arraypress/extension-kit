/**
 * Saving files a page has made: through Chrome's downloads when the person has allowed it (asked
 * from the Download click: “Manage your downloads”), else as a link's download, which Chrome
 * saves the same way, one file at a time.
 *
 * @module files/save
 */
/** How long a file's address is kept once Chrome has it (ms): long enough to finish saving it. */
export declare const KEEP_URL_MS = 60000;
export type SavedFile = {
    /**
     * Its name; with `chrome.downloads`, a path under the Downloads folder (`Trips/Lake.jpg`).
     */
    name: string;
    /**
     * Its contents.
     */
    blob: Blob;
};
/**
 * A file to save.
 *
 * @typedef {object} SavedFile
 * @property {string} name Its name; with `chrome.downloads`, a path under the Downloads folder (`Trips/Lake.jpg`).
 * @property {Blob} blob Its contents.
 */
/**
 * Save files, in order. Each gets a blob address, let go after {@link KEEP_URL_MS}. With
 * `chrome.downloads`, a name already taken gets a number (“Lake (1).jpg”) and each download is
 * started before the next; without, Chrome saves each link's download to the Downloads folder
 * (and asks before a page saves several).
 *
 * @param {readonly SavedFile[]} files - The files.
 * @param {Pick<typeof chrome.downloads, 'download'> | undefined} downloads - `chrome.downloads`, once granted (undefined until then).
 * @param {Document} [doc] - The page, for a link's download. Default `document` (not read in a worker, which has `chrome.downloads` or nothing).
 * @returns {Promise<void>} Once Chrome has every file's address.
 * @example
 * await saveFiles([{ name: 'Capture.zip', blob: await zip.finish() }], chrome.downloads);
 */
export declare function saveFiles(files: readonly SavedFile[], downloads: Pick<typeof chrome.downloads, 'download'> | undefined, doc?: Document): Promise<void>;
