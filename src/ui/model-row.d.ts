/**
 * The settings row “Chrome’s built-in AI”: how the on-device model stands,
 * what that means, and Download when it can be had, with Chrome's progress.
 * The download starts from the click (Chrome only downloads from a user
 * gesture): nothing is awaited in the click before `create()`. The words are
 * the page's messages under {@link MODEL_MESSAGES}' keys.
 *
 * Markup it fills (the page's, so it sits in any card):
 *
 * ```html
 * <div class="row two-line">
 *   <span class="label">
 *     <span data-i18n="optionsModel">Chrome’s built-in AI</span>
 *     <span class="secondary"><span id="model-status"></span> <span id="model-help" hidden></span></span>
 *     <progress id="model-progress" max="1" value="0" hidden></progress>
 *   </span>
 *   <button id="model-download" type="button" data-i18n="optionsModelDownload" hidden>Download</button>
 * </div>
 * ```
 *
 * @module ui/model-row
 */
import type { Availability, LanguageModelOptions, LanguageModelStatic, ModelStatus } from '../ai/model.js';
export type ModelRowParts = {
    /**
     * The state's words.
     */
    status: HTMLElement;
    /**
     * What it means, or why a download failed.
     */
    help: HTMLElement;
    /**
     * Download.
     */
    download: HTMLButtonElement;
    /**
     * The download's progress, 0–1.
     */
    progress: HTMLProgressElement;
};
export type ModelRowOptions = {
    /**
     * What sessions are made with (a download is for these).
     */
    options: LanguageModelOptions;
    /**
     * The model's state as the code that uses it sees it (the
     * worker's, asked by message, when the worker uses it).
     */
    state: () => Promise<Availability>;
    /**
     * The page's messages.
     */
    t: (key: string, substitutions?: string | string[]) => string;
    /**
     * The Prompt API in this page. Default Chrome's.
     */
    model?: () => LanguageModelStatic | undefined;
    /**
     * Hears each state shown
     * (to turn the switches that need the model on or off).
     */
    onShown?: (status: ModelStatus, availability: Availability) => void;
};
export type ModelRow = {
    /**
     * Ask the state again and show it.
     */
    refresh: () => Promise<Availability>;
    /**
     * The state last shown (null before the first).
     */
    current: () => Availability | null;
};
/** @import { Availability, LanguageModelOptions, LanguageModelStatic, ModelStatus } from '../ai/model.js' */
/**
 * @typedef {object} ModelRowParts
 * @property {HTMLElement} status The state's words.
 * @property {HTMLElement} help What it means, or why a download failed.
 * @property {HTMLButtonElement} download Download.
 * @property {HTMLProgressElement} progress The download's progress, 0–1.
 */
/**
 * @typedef {object} ModelRowOptions
 * @property {LanguageModelOptions} options What sessions are made with (a download is for these).
 * @property {() => Promise<Availability>} state The model's state as the code that uses it sees it (the
 *   worker's, asked by message, when the worker uses it).
 * @property {(key: string, substitutions?: string | string[]) => string} t The page's messages.
 * @property {() => LanguageModelStatic | undefined} [model] The Prompt API in this page. Default Chrome's.
 * @property {(status: ModelStatus, availability: Availability) => void} [onShown] Hears each state shown
 *   (to turn the switches that need the model on or off).
 */
/**
 * @typedef {object} ModelRow
 * @property {() => Promise<Availability>} refresh Ask the state again and show it.
 * @property {() => Availability | null} current The state last shown (null before the first).
 */
/**
 * Wire the row up and show the model's state.
 *
 * @param {ModelRowParts} parts - The row's elements.
 * @param {ModelRowOptions} setup - What to ask, and the words.
 * @returns {ModelRow} The row.
 * @example
 * const row = createModelRow({ status: byId('model-status'), help: byId('model-help'),
 *   download: byId('model-download', HTMLButtonElement), progress: byId('model-progress', HTMLProgressElement) },
 *   { options: SESSION_OPTIONS, state: () => ask(MESSAGES.modelState), t, onShown: ({ state }) => { useAi.disabled = state === 'off'; } });
 * await row.refresh();
 */
export declare function createModelRow({ status, help, download, progress }: ModelRowParts, { options, state, t, model, onShown }: ModelRowOptions): ModelRow;
