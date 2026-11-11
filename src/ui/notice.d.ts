/**
 * A notice in a side panel's list (chrome-ui.css `.sp-notice`): a card with an icon, a heading,
 * a line, buttons beside the heading and actions under the line. For what a list leaves out or
 * can't do: frames from other sites to allow, a web font that didn't load.
 *
 * @module ui/notice
 */
export type Notice = {
    /**
     * Its sprite symbol's id.
     */
    icon: string;
    /**
     * An information's icon is grey, a warning's red. Default `warning`.
     */
    tone?: 'info' | 'warning';
    /**
     * The heading.
     */
    title: string;
    /**
     * The line under it.
     */
    text: string;
    /**
     * Icon buttons at the heading's end.
     */
    buttons?: HTMLElement[];
    /**
     * Buttons under the line, at the end (“Allow”).
     */
    actions?: HTMLElement[];
    /**
     * The page. Default `document`.
     */
    doc?: Document;
};
/**
 * A notice's parts.
 *
 * @typedef {object} Notice
 * @property {string} icon Its sprite symbol's id.
 * @property {'info' | 'warning'} [tone] An information's icon is grey, a warning's red. Default `warning`.
 * @property {string} title The heading.
 * @property {string} text The line under it.
 * @property {HTMLElement[]} [buttons] Icon buttons at the heading's end.
 * @property {HTMLElement[]} [actions] Buttons under the line, at the end (“Allow”).
 * @property {Document} [doc] The page. Default `document`.
 */
/**
 * A notice card.
 *
 * @param {Notice} notice - Its parts.
 * @returns {HTMLElement} The card.
 * @example
 * notices.append(noticeCard({ icon: 'i-frame', tone: 'info', title: t('panelFrames'), text, actions: [allow] }));
 */
export declare function noticeCard({ icon, tone, title, text, buttons, actions, doc }: Notice): HTMLElement;
