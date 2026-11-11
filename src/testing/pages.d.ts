/**
 * Reaching a tested extension's pages from an e2e test: a Playwright page's
 * tab id (as the extension's worker sees it), a page module called in a
 * tab's frames as the extension calls it, and a page's whole tree through
 * the DevTools protocol, closed shadow roots and frames included (where an
 * extension's overlay lives). Tests only: an extension never needs CDP.
 *
 * @module testing/pages
 */
import type { CDPSession, Page, Worker } from 'playwright';
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
export declare function tabIdOf(worker: Worker, page: Page): Promise<number>;
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
export declare function callTabModule(worker: Worker, tabId: number, module: string, name: string, args?: unknown[]): Promise<{
    frameId: number;
    result: any;
}[]>;
export type CdpNode = {
    /**
     * Its id in the session.
     */
    nodeId: number;
    /**
     * Its lasting id.
     */
    backendNodeId: number;
    /**
     * Its DOM node type.
     */
    nodeType: number;
    /**
     * Its name.
     */
    nodeName: string;
    /**
     * A text node's text.
     */
    nodeValue?: string;
    /**
     * Its attributes, name and value in turn.
     */
    attributes?: string[];
    /**
     * Its children.
     */
    children?: CdpNode[];
    /**
     * Its shadow roots, closed ones too.
     */
    shadowRoots?: CdpNode[];
    /**
     * A frame's document.
     */
    contentDocument?: CdpNode;
};
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
export declare function pierceNodes(cdp: CDPSession): Promise<CdpNode[]>;
/**
 * A node's attribute.
 *
 * @param {CdpNode} node - The node.
 * @param {string} name - The attribute.
 * @returns {string} Its value, or ''.
 */
export declare function nodeAttribute(node: CdpNode, name: string): string;
/**
 * A node's text: a text node's own, an element's children's joined.
 *
 * @param {CdpNode} node - The node.
 * @returns {string} Its text.
 */
export declare const nodeText: (node: CdpNode) => string;
