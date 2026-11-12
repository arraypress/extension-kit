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
export const SETTLE_MS = 120;

/** The longest a batch waits while a page keeps changing (ms), by default. */
export const MAX_WAIT_MS = 600;

/**
 * @typedef {object} WatchHandlers
 * @property {(nodes: Node[]) => void} changed The nodes added or changed since the last batch, each once,
 *   none inside another.
 * @property {(node: Node) => void} [removed] A node that left (at once, so what the extension added for it
 *   can go with it).
 * @property {(node: Node) => boolean} [ignore] Whether a node is the extension's own: one added or removed, and
 *   anything that changes inside one (its text set again), is left out.
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
export function watchChanges(root, {
  changed, removed = () => {}, ignore = () => false, settleMs = SETTLE_MS, maxWaitMs = MAX_WAIT_MS, regroupChildren = 6,
}) {
  /** @type {Set<Node>} */
  let pending = new Set();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let firstAt = 0;

  const flush = () => {
    timer = undefined;
    firstAt = 0;
    const nodes = [...pending].filter((node) => node.isConnected);
    pending = new Set();
    // Each subtree once: a node inside another changed node goes with it. Found by walking up from
    // each (its depth), not by asking every pair: a feed adding thousands at once would stall the page.
    const batch = new Set(nodes);
    const tops = nodes.filter((node) => {
      for (let above = node.parentNode; above; above = above.parentNode) if (batch.has(above)) return false;
      return true;
    });
    if (tops.length) changed(tops);
  };

  /** Whether a node is the extension's own, or inside one that is. @param {Node | null} node */
  const within = (node) => {
    for (let at = node; at; at = at.parentNode) if (ignore(at)) return true;
    return false;
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;
      // What happens inside the extension's own elements (its note's text set again) isn't the page changing.
      if (within(target)) continue;
      if (mutation.type === 'characterData') {
        pending.add(target);
        continue;
      }
      let ours = true;
      for (const node of mutation.addedNodes) {
        if (ignore(node)) continue;
        ours = false;
        pending.add(node);
      }
      for (const node of mutation.removedNodes) {
        if (ignore(node)) continue;
        ours = false;
        removed(node);
      }
      if (!ours && target.nodeType === 1 && /** @type {Element} */ (target).childElementCount <= regroupChildren) pending.add(target);
    }
    if (!pending.size) return;
    const now = Date.now();
    firstAt ||= now;
    clearTimeout(timer);
    timer = setTimeout(flush, Math.max(0, Math.min(settleMs, firstAt + maxWaitMs - now)));
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}
