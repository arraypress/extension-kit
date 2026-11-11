/**
 * A notice in a side panel's list (chrome-ui.css `.sp-notice`): a card with an icon, a heading,
 * a line, buttons beside the heading and actions under the line. For what a list leaves out or
 * can't do: frames from other sites to allow, a web font that didn't load.
 *
 * @module ui/notice
 */

import { make, spriteIcon } from '../dom/make.js';

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
export function noticeCard({ icon, tone = 'warning', title, text, buttons = [], actions = [], doc = document }) {
  const card = make('section', `sp-card sp-notice ${tone}`, '', doc);
  const heading = make('div', 'sp-heading', '', doc);
  heading.append(spriteIcon(icon, '', doc), make('h2', '', title, doc), ...buttons);
  card.append(heading, make('p', 'sp-notice-text', text, doc));
  if (actions.length) {
    const row = make('div', 'sp-notice-actions', '', doc);
    row.append(...actions);
    card.append(row);
  }
  return card;
}
