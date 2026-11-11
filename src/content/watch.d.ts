/**
 * A content script keeping up with a page that changes (a single-page app,
 * a list that loads more as you scroll): a MutationObserver that only
 * collects what changed, and hands it over in one batch a little later,
 * never touching the page itself. The extension's own elements are ignored
 * (`ignore`), so what it adds never sets it off again. From Better Prices
 * (`content/watch.js`), shared with Topicless.
 *
 * @module content/watch
 */
/** How long after a change the batch waits for more (ms), by default. */
export declare const SETTLE_MS = 120;
/** The longest a batch waits while a page keeps changing (ms), by default. */
export declare const MAX_WAIT_MS = 600;
export type WatchHandlers = {
    /**
     * The nodes added or changed since the last batch, each once,
     * none inside another.
     */
    changed: (nodes: Node[]) => void;
    /**
     * A node that left (at once, so what the extension added for it
     * can go with it).
     */
    removed?: (node: Node) => void;
    /**
     * Whether a node added or removed is the extension's own.
     */
    ignore?: (node: Node) => boolean;
    /**
     * How long a batch waits for more. Default {@link SETTLE_MS}.
     */
    settleMs?: number;
    /**
     * The longest a batch waits. Default {@link MAX_WAIT_MS}.
     */
    maxWaitMs?: number;
    /**
     * An element whose children changed is handed over again whole
     * when it has at most this many element children (a split price's pieces; a list's new items
     * are handed over themselves). Default 6; 0 never.
     */
    regroupChildren?: number;
};
/**
 * @typedef {object} WatchHandlers
 * @property {(nodes: Node[]) => void} changed The nodes added or changed since the last batch, each once,
 *   none inside another.
 * @property {(node: Node) => void} [removed] A node that left (at once, so what the extension added for it
 *   can go with it).
 * @property {(node: Node) => boolean} [ignore] Whether a node added or removed is the extension's own.
 * @property {number} [settleMs] How long a batch waits for more. Default {@link SETTLE_MS}.
 * @property {number} [maxWaitMs] The longest a batch waits. Default {@link MAX_WAIT_MS}.
 * @property {number} [regroupChildren] An element whose children changed is handed over again whole
 *   when it has at most this many element children (a split price's pieces; a list's new items
 *   are handed over themselves). Default 6; 0 never.
 */
/**
 * Watch `root` for changes.
 *
 * @param {Node} root - What to watch (the body, or the document element from `document_start`).
 * @param {WatchHandlers} handlers - What to call, and how long to wait.
 * @returns {() => void} Stops watching.
 * @example
 * const stop = watchChanges(document.body, {
 *   changed: (nodes) => nodes.forEach((node) => scanner.scan(node)),
 *   removed: (node) => scanner.forget(node),
 *   ignore: (node) => node instanceof Element && node.localName === 'better-prices-note',
 * });
 */
export declare function watchChanges(root: Node, { changed, removed, ignore, settleMs, maxWaitMs, regroupChildren, }: WatchHandlers): () => void;
