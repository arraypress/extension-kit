/**
 * Making a page's elements in a line: an element with its class and text, an
 * icon from the page's SVG sprite, and Chrome's 24px icon button with its
 * tooltip. For extension pages and content-script overlays alike (pass the
 * document the element belongs to).
 *
 * @module dom/make
 */
/**
 * An element with a class and text.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag - Its tag.
 * @param {string} [className] - Its class.
 * @param {string} [text] - Its text.
 * @param {Document} [doc] - Its document. Default `document`.
 * @returns {HTMLElementTagNameMap[K]} It.
 * @example
 * make('span', 'meta', '12 colours');
 */
export declare function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string, doc?: Document): HTMLElementTagNameMap[K];
/**
 * An icon from the page's SVG sprite (`<symbol id="i-copy">`), hidden from screen readers.
 *
 * @param {string} id - The symbol's id, without `#`.
 * @param {string} [className] - More classes beside `icon`.
 * @param {Document} [doc] - Its document. Default `document`.
 * @returns {SVGSVGElement} The icon.
 * @example
 * button.append(spriteIcon('i-copy'));
 */
export declare function spriteIcon(id: string, className?: string, doc?: Document): SVGSVGElement;
/**
 * Chrome's icon button (chrome-ui.css `.icon-button`): an icon, its label as tooltip and for
 * screen readers.
 *
 * @param {object} options
 * @param {string} options.icon - The sprite symbol's id.
 * @param {string} options.label - What it does.
 * @param {() => void} options.onClick - Doing it.
 * @param {string} [options.className] - More classes.
 * @param {Document} [options.doc] - Its document. Default `document`.
 * @returns {HTMLButtonElement} The button.
 * @example
 * iconButton({ icon: 'i-copy', label: 'Copy', onClick: () => copy(hex) });
 */
export declare function iconButton({ icon, label, onClick, className, doc }: {
    icon: string;
    label: string;
    onClick: () => void;
    className?: string;
    doc?: Document;
}): HTMLButtonElement;
