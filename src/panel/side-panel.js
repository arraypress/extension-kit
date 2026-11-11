/**
 * Opening Chrome's side panel for one tab, from a click: the panel is the
 * tab's own (no `side_panel` in the manifest, no global panel), so it shows
 * only beside the page it's about and goes when the person switches tabs, as
 * Chrome does for a tab's panel. Chrome opens a panel only while the click
 * still counts, so nothing is awaited before `open`.
 *
 * @module panel/side-panel
 */

/**
 * The parts of `chrome.sidePanel` opening one uses.
 *
 * @typedef {Pick<typeof chrome.sidePanel, 'setOptions' | 'open'>} SidePanelApi
 */

/**
 * The panel page's address for a tab: `path?tab=<id>`, so the page knows its tab.
 *
 * @param {string} path - The panel page, `panel/panel.html`.
 * @param {number} tabId - The tab.
 * @returns {string} `panel/panel.html?tab=12`.
 */
export const sidePanelPath = (path, tabId) => `${path}?tab=${tabId}`;

/**
 * Open the side panel beside a tab, from a click (the toolbar button's, a
 * shortcut's, or a button on an extension page).
 *
 * @param {SidePanelApi} sidePanel - `chrome.sidePanel` (or a fake in tests).
 * @param {number} tabId - The tab.
 * @param {string} path - The panel page; it gets `?tab=<id>`.
 * @returns {Promise<void>} Once it's open; rejects when Chrome refuses (no click behind it).
 * @example
 * chrome.action.onClicked.addListener((tab) => openSidePanel(chrome.sidePanel, tab.id, 'panel/panel.html'));
 */
export function openSidePanel(sidePanel, tabId, path) {
  // Not awaited: open() must be called while the click still counts.
  sidePanel.setOptions({ tabId, path: sidePanelPath(path, tabId), enabled: true }).catch((error) => console.error('Setting the side panel up:', error));
  return sidePanel.open({ tabId });
}
