/**
 * A stand-in for Chrome's `LanguageModel` (the Prompt API), with its shape,
 * for an extension's unit tests and its e2e build (whose hook puts it on the
 * worker's or page's `globalThis`: Playwright's Chromium has no model). It
 * acts out what a real Chrome does: a model still to download (with
 * progress), one this computer can't run, a slow first session (the cold
 * start), a slow answer, an answer cut short by its signal, a failure, a
 * session that's been destroyed (it answers nothing more), and a download
 * asked for without a click (Chrome refuses it).
 * Moved here from Better Downloads' tests, so every extension that uses the
 * model tests against the same one.
 *
 * Plain browser JavaScript with no Node imports, so a test build can copy it in.
 *
 * @module testing/fake-model
 */

/** @import { LanguageModelOptions, LanguageModelSession, LanguageModelStatic, PromptOptions } from '../ai/model.js' */

/**
 * How the fake behaves; change it at any time with `set`.
 *
 * @typedef {object} FakeModelState
 * @property {'available' | 'downloadable' | 'downloading' | 'unavailable'} availability What `availability()` says.
 * @property {number} createMs How long making a session takes (a cold start is ~18 s on a real Chrome).
 * @property {number} answerMs How long an answer takes.
 * @property {(prompt: string, options: PromptOptions) => string} answer The answer to a prompt.
 * @property {boolean} failPrompt Whether answers fail (the model gave up).
 * @property {boolean} failDownload Whether a download fails part way.
 * @property {boolean | null} userActivation Whether a click is behind a `create()` that has to download the
 *   model (Chrome refuses one without: `NotAllowedError`). `null`, the default, reads the page's own
 *   `navigator.userActivation` (and takes it as given where there's none: Node, a worker).
 */

/**
 * What the fake was asked, for tests to look at.
 *
 * @typedef {object} FakeModelLog
 * @property {LanguageModelOptions[]} availability Each `availability()`'s options.
 * @property {LanguageModelOptions[]} created Each `create()`'s options.
 * @property {string[]} prompts Each prompt.
 * @property {PromptOptions[]} promptOptions Each prompt's options (signal, responseConstraint).
 * @property {number} cloned Sessions cloned.
 * @property {number} aborted Prompts and creates stopped by their signal.
 * @property {number} destroyed Sessions let go.
 */

/**
 * A fake Prompt API with its state, its log, and `set` to change the state.
 *
 * @typedef {LanguageModelStatic & {state: FakeModelState, log: FakeModelLog, set: (patch: Partial<FakeModelState>) => void}} FakeLanguageModel
 */

/**
 * Wait, unless the signal stops it first.
 *
 * @param {number} ms - How long.
 * @param {AbortSignal | undefined} signal - Stops it.
 * @returns {Promise<void>} Resolves after `ms`; rejects with an AbortError when stopped.
 */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * A fake Prompt API.
 *
 * @param {Partial<FakeModelState>} [initial] - How it starts (default: ready, instant, answers “Fake answer”).
 * @returns {FakeLanguageModel} The API, its state and log.
 * @example
 * const model = fakeLanguageModel({ createMs: 18_000 }); // a cold start
 * const sessions = createModelSession({ model: () => model, options });
 * (await sessions.ask('Hi', { timeoutMs: 2500 })).reason; // 'late'
 */
export function fakeLanguageModel(initial = {}) {
  /** @type {FakeModelState} */
  const state = {
    availability: 'available', createMs: 0, answerMs: 0, answer: () => 'Fake answer', failPrompt: false, failDownload: false, userActivation: null, ...initial,
  };
  /** @type {FakeModelLog} */
  const log = { availability: [], created: [], prompts: [], promptOptions: [], cloned: 0, aborted: 0, destroyed: 0 };

  /**
   * A session.
   *
   * @returns {LanguageModelSession} It.
   */
  const session = () => {
    let destroyed = false;
    /** Chrome's refusal to use a session that's been destroyed. */
    const refuseDestroyed = () => {
      if (destroyed) throw new DOMException('The session has been destroyed.', 'InvalidStateError');
    };
    return /** @type {LanguageModelSession} */ ({
      async prompt(prompt, options = {}) {
        refuseDestroyed();
        log.prompts.push(prompt);
        log.promptOptions.push(options);
        try {
          await wait(state.answerMs, options.signal);
        } catch (error) {
          log.aborted++;
          throw error;
        }
        // Destroyed while it was answering: Chrome stops the answer.
        if (destroyed) throw new DOMException('The session has been destroyed.', 'AbortError');
        if (state.failPrompt) throw new DOMException('The model failed', 'UnknownError');
        return state.answer(prompt, options);
      },
      async clone() {
        refuseDestroyed();
        log.cloned++;
        return session();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        log.destroyed++;
      },
    });
  };

  return {
    state,
    log,
    set: (patch) => Object.assign(state, patch),
    async availability(options = {}) {
      log.availability.push(options);
      return state.availability;
    },
    async create(options = {}) {
      log.created.push(options);
      if (state.availability === 'unavailable') throw new DOMException('Not supported', 'NotSupportedError');
      if (state.availability !== 'available') {
        // Chrome starts a download only from a click (transient user activation).
        const active = state.userActivation ?? /** @type {{navigator?: {userActivation?: {isActive: boolean}}}} */ (globalThis).navigator?.userActivation?.isActive ?? true;
        if (!active) throw new DOMException('Requires a user gesture when availability is "downloading" or "downloadable".', 'NotAllowedError');
        // A download, reported as Chrome reports it, then the model is here.
        const monitor = new EventTarget();
        options.monitor?.(monitor);
        for (const loaded of [0, 0.5, 1]) {
          if (state.failDownload && loaded === 1) throw new DOMException('Download failed', 'NetworkError');
          monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
        }
        state.availability = 'available';
      }
      try {
        await wait(state.createMs, options.signal);
      } catch (error) {
        log.aborted++;
        throw error;
      }
      return session();
    },
  };
}
