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

import { MODEL_MESSAGES, chromeLanguageModel, describeModel, downloadModel } from '../ai/model.js';

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
export function createModelRow({ status, help, download, progress }, { options, state, t, model = chromeLanguageModel, onShown }) {
  /** @type {Availability | null} */
  let shown = null;

  /**
   * Show a state, or why the last download failed.
   *
   * @param {Availability} availability - The model's.
   * @param {string} [problem] - What went wrong.
   */
  function show(availability, problem = '') {
    const described = describeModel(availability);
    shown = availability;
    status.dataset.state = described.state;
    status.textContent = t(described.status);
    help.textContent = problem || (described.help ? t(described.help) : '');
    help.hidden = !help.textContent;
    download.hidden = !described.canDownload;
    download.disabled = false;
    progress.hidden = true;
    onShown?.(described, availability);
  }

  download.addEventListener('click', () => {
    download.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    downloadModel(model(), options, {
      onProgress: (loaded) => {
        progress.value = loaded;
        status.textContent = t(MODEL_MESSAGES.downloading, [String(Math.round(loaded * 100))]);
      },
    }).then(async () => show(await state()), () => show('downloadable', t(MODEL_MESSAGES.downloadFailed)));
  });

  return {
    async refresh() {
      const availability = await state();
      show(availability);
      return availability;
    },
    current: () => shown,
  };
}
