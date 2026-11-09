export type SavedTabGroup = {
    /**
     * Its title.
     */
    title: string;
    /**
     * Whether it's pinned to the saved groups bar.
     */
    pinned: boolean;
    /**
     * Its tabs' addresses, in order.
     */
    urls: string[];
};
export type ProtoField = {
    field: number;
    value: number | Buffer;
};
/**
 * Chrome's saved tab groups in a closed profile.
 *
 * @param {string} profile - The profile folder (as `extensionProfile` gives it).
 * @returns {Promise<SavedTabGroup[]>} The saved groups, in no particular order; none when the
 *   profile has no store yet.
 * @throws {Error} When the store has compacted tables this doesn't read.
 * @example
 * const profile = await extensionProfile(chromium, 'extension');
 * const { worker, close } = await profile.launch();
 * await worker.evaluate(async () => chrome.tabGroups.update(await chrome.tabs.group({tabIds: [tabId]}), {title: 'Research'}));
 * await close();
 * const groups = await savedTabGroups(profile.dir); // → [{title: 'Research', pinned: true, urls: [...]}]
 */
export declare function savedTabGroups(profile: string): Promise<SavedTabGroup[]>;
