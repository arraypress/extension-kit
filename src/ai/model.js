/**
 * Chrome's on-device model (Gemini Nano, through the Prompt API), the way
 * every extension here uses it, following
 * https://developer.chrome.com/docs/ai/prompt-api:
 *
 * - `availability()` is asked with the options `create()` gets, and only an
 *   'available' model is used: nothing here downloads it, except
 *   {@link downloadModel}, which a page calls from the person's click (Chrome
 *   only downloads from a user gesture) and which reports progress;
 * - one base session, with the instructions and examples, is made once and
 *   kept; each question goes to a `clone()` of it, so answers don't leak into
 *   each other; a base session Chrome has let go since (it can't be cloned)
 *   is made again;
 * - each answer has a time limit: an `AbortSignal` stops the answer once
 *   it's late, and the caller gets a reason instead of a hang;
 * - the first session after Chrome starts can take ~18 s while the model
 *   loads (a cold start, M3 Max). A question with a shorter limit gets
 *   'late', and the session goes on loading for the next one. Nothing loads
 *   it ahead of time: that would load the model on every start for work that
 *   may never come.
 *
 * Nothing here touches `chrome.*` or the global itself: the Prompt API comes
 * in as `model` (read when used, since Chrome may add it after start-up), so
 * tests hand it the kit's fake (`fakeLanguageModel`, `/testing`) at exactly
 * this edge. TypeScript's DOM library doesn't declare the Prompt API yet, so
 * the parts used are typed here.
 *
 * @module ai/model
 */

import { within } from '../time/time.js';

/**
 * The model's answer to `availability()`: 'available', 'downloadable',
 * 'downloading' or 'unavailable'; and, from {@link modelAvailability},
 * 'missing' when this Chrome has no Prompt API.
 *
 * @typedef {'available' | 'downloadable' | 'downloading' | 'unavailable' | 'missing'} Availability
 */

/**
 * @typedef {object} PromptOptions
 * @property {AbortSignal} [signal] Stops the answer.
 * @property {object} [responseConstraint] A JSON Schema (or RegExp) the answer must follow.
 */

/**
 * @typedef {object} LanguageModelSession
 * @property {(prompt: string, options?: PromptOptions) => Promise<string>} prompt The whole answer.
 * @property {(options?: {signal?: AbortSignal}) => Promise<LanguageModelSession>} clone A copy with the same history.
 * @property {() => void} destroy Let it go.
 */

/**
 * @typedef {{role: 'system' | 'user' | 'assistant', content: string}} InitialPrompt
 */

/**
 * @typedef {object} LanguageModelOptions
 * @property {{type: string, languages: string[]}[]} [expectedInputs] What it's given.
 * @property {{type: string, languages: string[]}[]} [expectedOutputs] What it answers in.
 * @property {InitialPrompt[]} [initialPrompts] Its instructions and examples.
 * @property {(monitor: EventTarget) => void} [monitor] Hears `downloadprogress` (`loaded`, 0–1) while the model downloads.
 * @property {AbortSignal} [signal] Stops creating it.
 */

/**
 * @typedef {object} LanguageModelStatic
 * @property {(options?: LanguageModelOptions) => Promise<Availability>} availability Whether it can run here.
 * @property {(options?: LanguageModelOptions) => Promise<LanguageModelSession>} create A session (downloads the model first, from a click).
 */

/**
 * Chrome's `LanguageModel`, or undefined when this Chrome has none.
 *
 * @param {object} [scope] - Where to look. Default `globalThis` (a page, or the service worker).
 * @returns {LanguageModelStatic | undefined} The Prompt API.
 * @example
 * const sessions = createModelSession({ model: chromeLanguageModel, options: ENGLISH });
 */
export function chromeLanguageModel(scope = globalThis) {
  return /** @type {{LanguageModel?: LanguageModelStatic}} */ (scope).LanguageModel;
}

/**
 * The model's state, never throwing: 'missing' without a Prompt API, and
 * 'unavailable' when asking fails.
 *
 * @param {LanguageModelStatic | undefined} model - The Prompt API.
 * @param {LanguageModelOptions} options - The options sessions are created with.
 * @returns {Promise<Availability>} Its state.
 * @example
 * await modelAvailability(chromeLanguageModel(), ENGLISH); // 'available'
 */
export async function modelAvailability(model, options) {
  if (!model) return 'missing';
  try {
    return await model.availability(options);
  } catch {
    return 'unavailable';
  }
}

/**
 * Download the model, from the person's click: `create()` with a monitor,
 * the session let go once made. Call it first in the click's handler, with
 * nothing awaited before it, or Chrome refuses (no user activation).
 *
 * @param {LanguageModelStatic | undefined} model - The Prompt API.
 * @param {LanguageModelOptions} options - The options sessions are created with.
 * @param {{onProgress?: (loaded: number) => void, signal?: AbortSignal}} [handlers] - `onProgress`: how much is
 *   downloaded, 0–1, as Chrome reports it; `signal`: stops it.
 * @returns {Promise<Availability>} The state afterwards ('available' once it's here).
 * @throws {Error} When there's no Prompt API, or Chrome couldn't download it.
 * @example
 * button.addEventListener('click', () => {
 *   downloadModel(chromeLanguageModel(), ENGLISH, { onProgress: (loaded) => { bar.value = loaded; } })
 *     .then(show, () => show('downloadable', 'The download didn’t finish. Try again.'));
 * });
 */
export async function downloadModel(model, options, { onProgress, signal } = {}) {
  if (!model) throw new Error('This Chrome has no Prompt API');
  const session = await model.create({
    ...options,
    ...(signal && { signal }),
    monitor: (monitor) => monitor.addEventListener('downloadprogress', (event) => {
      onProgress?.(Number(/** @type {ProgressEvent} */ (event).loaded) || 0);
    }),
  });
  session.destroy();
  return modelAvailability(model, options);
}

/**
 * The settings page's words for a state: standard message keys (the
 * extension's `_locales` names them alike), as `SITE_LIST_MESSAGES` does
 * for a site list.
 */
export const MODEL_MESSAGES = Object.freeze({
  /** “Chrome’s built-in AI”: the row's name. */
  name: 'optionsModel',
  /** “Checking…” before the state is known. */
  checking: 'optionsModelChecking',
  /** “Ready”. */
  ready: 'optionsModelReady',
  /** “Needs download”. */
  needsDownload: 'optionsModelNeedsDownload',
  /** “Chrome downloads its model once and shares it with every site and extension that uses it”. */
  downloadHelp: 'optionsModelDownloadHelp',
  /** “Download”: the button. */
  download: 'optionsModelDownload',
  /** “Downloading… $PERCENT$%” (content `$1`). */
  downloading: 'optionsModelDownloading',
  /** “The download didn’t finish. Try again.” */
  downloadFailed: 'optionsModelDownloadFailed',
  /** “Not supported on this computer”. */
  unsupported: 'optionsModelUnsupported',
  /** What a computer needs to run it. */
  requirements: 'optionsModelRequirements',
  /** “This Chrome doesn’t have it”. */
  missing: 'optionsModelMissing',
  /** What to do about that, and that the extension works without it. */
  missingHelp: 'optionsModelMissingHelp',
});

/**
 * The model's state, as a settings page shows it.
 *
 * @typedef {object} ModelStatus
 * @property {'ready' | 'pending' | 'off'} state Ready to use, can be downloaded, or can't run here.
 * @property {string} status The status's message key ({@link MODEL_MESSAGES}).
 * @property {string} help The help's message key ('' for none).
 * @property {boolean} canDownload Whether to offer Download.
 */

/**
 * Describe an availability for a settings page. Pure.
 *
 * @param {string} availability - 'available', 'downloadable', 'downloading', 'unavailable' or 'missing'.
 * @returns {ModelStatus} How to show it.
 * @example
 * describeModel('downloadable'); // { state: 'pending', status: 'optionsModelNeedsDownload', help: 'optionsModelDownloadHelp', canDownload: true }
 */
export function describeModel(availability) {
  switch (availability) {
    case 'available':
      return { state: 'ready', status: MODEL_MESSAGES.ready, help: '', canDownload: false };
    case 'downloadable':
    case 'downloading':
      return { state: 'pending', status: MODEL_MESSAGES.needsDownload, help: MODEL_MESSAGES.downloadHelp, canDownload: true };
    case 'missing':
      return { state: 'off', status: MODEL_MESSAGES.missing, help: MODEL_MESSAGES.missingHelp, canDownload: false };
    default:
      return { state: 'off', status: MODEL_MESSAGES.unsupported, help: MODEL_MESSAGES.requirements, canDownload: false };
  }
}

/**
 * What a question got: the answer, or why there's none: the model isn't
 * on this computer ('unavailable'), the time ran out first ('late', a cold
 * start among them), the caller's signal stopped it ('aborted'), or the model
 * failed ('failed').
 *
 * @typedef {{text: string, reason: 'answered'} | {text: null, reason: 'unavailable' | 'late' | 'aborted' | 'failed'}} ModelAnswer
 */

/**
 * @typedef {object} AskOptions
 * @property {number} timeoutMs The most the answer may take, from the moment it's asked: the base
 *   session (if it must be made) and the answer.
 * @property {AbortSignal} [signal] Stops it sooner (the person cancelled).
 * @property {object} [responseConstraint] A JSON Schema the answer must follow.
 */

/**
 * @typedef {object} ModelSession
 * @property {() => Promise<Availability>} availability The model's state, or 'missing'.
 * @property {(prompt: string, options: AskOptions) => Promise<ModelAnswer>} ask Ask a copy of the base session.
 * @property {() => void} release Let the base session go (the next question makes it again).
 */

/**
 * A base session over a Prompt API, made when first needed and kept, each
 * question asked of a `clone()` within its time limit.
 *
 * @param {{model: () => LanguageModelStatic | undefined, options: LanguageModelOptions, initialPrompts?: InitialPrompt[]}} setup -
 *   `model`: the Prompt API, read when used; `options`: what sessions are made (and availability asked)
 *   with; `initialPrompts`: the instructions and examples every question starts from.
 * @returns {ModelSession} The session.
 * @example
 * const sessions = createModelSession({
 *   model: chromeLanguageModel,
 *   options: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
 *   initialPrompts: [{ role: 'system', content: 'You name downloaded files.' }],
 * });
 * const { text } = await sessions.ask('Site: acme.com', { timeoutMs: 2500 }); // null when late
 */
export function createModelSession({ model, options, initialPrompts = [] }) {
  /** @type {Promise<LanguageModelSession> | null} */
  let base = null;

  /**
   * The base session, made once; a failed one isn't kept, so the next question tries again.
   *
   * @param {LanguageModelStatic} api - The Prompt API, ready.
   * @returns {Promise<LanguageModelSession>} The session.
   */
  function baseSession(api) {
    if (!base) {
      const made = api.create({ ...options, ...(initialPrompts.length && { initialPrompts }) });
      base = made;
      made.catch(() => {
        if (base === made) base = null;
      });
    }
    return base;
  }

  /**
   * Ask a copy of the base session; the copy is let go after.
   *
   * @param {LanguageModelStatic} api - The Prompt API, ready.
   * @param {string} prompt - The question.
   * @param {AbortSignal} signal - Stops it once it's late or the caller stops it.
   * @param {object | undefined} responseConstraint - The answer's shape.
   * @returns {Promise<string>} The answer.
   */
  async function ask(api, prompt, signal, responseConstraint) {
    const made = baseSession(api);
    const kept = await made;
    const session = await kept.clone({ signal }).catch(async (error) => {
      if (signal.aborted) throw error;
      // Chrome let the base session go (the model was updated, or its process ended): a new one, once.
      if (base === made) base = null;
      return (await baseSession(api)).clone({ signal });
    });
    try {
      return await session.prompt(prompt, { signal, ...(responseConstraint && { responseConstraint }) });
    } finally {
      session.destroy();
    }
  }

  return {
    availability: () => modelAvailability(model(), options),
    async ask(prompt, { timeoutMs, signal, responseConstraint }) {
      const started = Date.now();
      if (signal?.aborted) return { text: null, reason: 'aborted' };
      const api = model();
      const state = await within(modelAvailability(api, options), timeoutMs, /** @type {Availability | 'late'} */ ('late'));
      if (state === 'late') return { text: null, reason: 'late' };
      if (state !== 'available' || !api) return { text: null, reason: 'unavailable' };
      const stop = new AbortController();
      const onAbort = () => stop.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        // A string is the answer; false, it failed; null, it's late.
        const outcome = await within(
          ask(api, prompt, stop.signal, responseConstraint).catch(() => /** @type {false} */ (false)),
          Math.max(0, timeoutMs - (Date.now() - started)),
          /** @type {string | false | null} */ (null),
        );
        if (typeof outcome === 'string') return { text: outcome, reason: 'answered' };
        if (signal?.aborted) return { text: null, reason: 'aborted' };
        if (outcome === null) {
          stop.abort();
          return { text: null, reason: 'late' };
        }
        return { text: null, reason: 'failed' };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
    release() {
      const held = base;
      base = null;
      held?.then((session) => session.destroy(), () => {});
    },
  };
}
