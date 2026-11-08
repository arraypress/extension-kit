/**
 * The offscreen scheme watcher (toolbar/theme.js `watchFromOffscreen`): the
 * one job of an offscreen document kept open to hear light/dark changes.
 * Offscreen documents get `chrome.runtime` and nothing else, so it can't read
 * what's stored: it reports once on opening (the worker drops a repeat), then
 * on each change.
 *
 * @module toolbar/offscreen
 */
import type { MessageSender, SchemeMedia } from './scheme.js';
/** @import { MessageSender, SchemeMedia } from './scheme.js' */
/**
 * How often the watcher looks, ms. An offscreen document never renders, and
 * Chrome fires a media query's `change` event as part of rendering, so there
 * it never comes (checked in Chromium 157: no animation frames either).
 * `matches` itself stays current, so look every few seconds: one cached
 * boolean read, and a message only when it differs.
 */
export declare const POLL_MS = 2000;
/**
 * Start watching. The offscreen document's script is just this call.
 *
 * @param {MessageSender} runtime - `chrome.runtime`.
 * @param {SchemeMedia} [media] - Default `matchMedia(DARK_QUERY)`.
 * @returns {ReturnType<typeof setInterval>} The poll, for `clearInterval` in tests.
 * @example
 * // offscreen/offscreen.js
 * watchSchemeOffscreen(chrome.runtime);
 */
export declare function watchSchemeOffscreen(runtime: MessageSender, media?: SchemeMedia): ReturnType<typeof setInterval>;
