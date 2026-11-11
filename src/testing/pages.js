/**
 * Reaching a tested extension's pages from an e2e test: a Playwright page's
 * tab id (as the extension's worker sees it), a page module called in a
 * tab's frames as the extension calls it, and a page's whole tree through
 * the DevTools protocol, closed shadow roots and frames included (where an
 * extension's overlay lives). Tests only: an extension never needs CDP.
 *
 * @module testing/pages
 */

/** @import { CDPSession, Page, Worker } from 'playwright' */

/**
 * The tab id of a page: the newest tab at its address (any tab for a `chrome:` page).
 *
 * @param {Worker} worker - The extension's service worker.
 * @param {Page} page - The page.
 * @returns {Promise<number>} Its tab's id.
 * @example
 * const tabId = await tabIdOf(worker, page);
 */
export async function tabIdOf(worker, page) {
  return worker.evaluate(async (url) => {
    const query = url.startsWith('chrome:') ? {} : { url: url.replace(/#.*$/, '') };
    const ids = (await chrome.tabs.query(query)).map((tab) => tab.id ?? -1);
    if (!ids.length) throw new Error(`No tab for ${url}`);
    return Math.max(...ids);
  }, page.url());
}

/**
 * Call an export of the extension's page module in a tab's frames, as `callInPage` does from the
 * worker.
 *
 * @param {Worker} worker - The extension's service worker.
 * @param {number} tabId - The tab.
 * @param {string} module - The module's path in the extension (`content/main.js`).
 * @param {string} name - The export.
 * @param {unknown[]} [args] - Its arguments.
 * @returns {Promise<{frameId: number, result: any}[]>} Each frame's answer.
 * @example
 * const [{ result }] = await callTabModule(worker, tabId, 'content/main.js', 'scan');
 */
export function callTabModule(worker, tabId, module, name, args = []) {
  return worker.evaluate(({ tabId, module, name, args }) => chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    injectImmediately: true,
    // As the kit's importAndCall (a worker's evaluate takes no function from outside, and its CSP no eval).
    func: (/** @type {string} */ module, /** @type {string} */ name, /** @type {unknown[]} */ args) => import(chrome.runtime.getURL(module)).then((loaded) => loaded[name](...args)),
    args: [module, name, args],
  }).then((frames) => frames.map(({ frameId, result }) => ({ frameId, result }))), { tabId, module, name, args });
}

/**
 * A node as the DevTools protocol's `DOM.getDocument` gives it (the parts read here).
 *
 * @typedef {object} CdpNode
 * @property {number} nodeId Its id in the session.
 * @property {number} backendNodeId Its lasting id.
 * @property {number} nodeType Its DOM node type.
 * @property {string} nodeName Its name.
 * @property {string} [nodeValue] A text node's text.
 * @property {string[]} [attributes] Its attributes, name and value in turn.
 * @property {CdpNode[]} [children] Its children.
 * @property {CdpNode[]} [shadowRoots] Its shadow roots, closed ones too.
 * @property {CdpNode} [contentDocument] A frame's document.
 */

/**
 * Every node of a page's tree in tree order, closed shadow roots and same-process frames included.
 *
 * @param {CDPSession} cdp - A session on the page.
 * @returns {Promise<CdpNode[]>} The nodes; a node's shadow roots come before its children.
 * @example
 * const boxes = (await pierceNodes(cdp)).filter((node) => nodeAttribute(node, 'class') === 'box');
 */
export async function pierceNodes(cdp) {
  const { root } = /** @type {{root: CdpNode}} */ (await cdp.send('DOM.getDocument', { depth: -1, pierce: true }));
  /** @type {CdpNode[]} */
  const nodes = [];
  /** @param {CdpNode} node */
  const walk = (node) => {
    nodes.push(node);
    for (const child of [...(node.shadowRoots ?? []), ...(node.children ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) walk(child);
  };
  walk(root);
  return nodes;
}

/**
 * A node's attribute.
 *
 * @param {CdpNode} node - The node.
 * @param {string} name - The attribute.
 * @returns {string} Its value, or ''.
 */
export function nodeAttribute(node, name) {
  const attributes = node.attributes ?? [];
  const at = attributes.findIndex((value, index) => index % 2 === 0 && value === name);
  return at >= 0 ? attributes[at + 1] : '';
}

/**
 * A node's text: a text node's own, an element's children's joined.
 *
 * @param {CdpNode} node - The node.
 * @returns {string} Its text.
 */
export const nodeText = (node) => (node.nodeType === 3 ? node.nodeValue ?? '' : (node.children ?? []).map(nodeText).join(''));
