/**
 * Chrome's on-device model for a service worker, wherever Chrome puts the
 * Prompt API. Chrome's documentation says `LanguageModel` isn't in workers
 * (https://developer.chrome.com/docs/ai/prompt-api); Chrome 157 and Chromium
 * 156 do have it in an extension's service worker (checked in both: an
 * unpacked extension, `typeof LanguageModel` in the worker, an extension page
 * and an offscreen document, `'function'` in all three). So neither is
 * promised, and a worker that uses the model shouldn't depend on which holds:
 * {@link createHostedModelSession} is a `ModelSession` that asks the worker's
 * own `LanguageModel` when there is one, and otherwise the extension's
 * offscreen document, which has a page's Prompt API and answers over
 * `chrome.runtime` messages ({@link serveModelOffscreen}).
 *
 * The offscreen document is the one the worker already keeps for the toolbar
 * glyph (an extension gets only one): its script calls both
 * `watchSchemeOffscreen` and `serveModelOffscreen`. It's told the session's
 * options and instructions with each request, so it needs none of the
 * extension's own code.
 *
 * @module ai/host
 */

import { within } from '../time/time.js';
import { chromeLanguageModel, createModelSession } from './model.js';

/** @import { AskOptions, Availability, InitialPrompt, LanguageModelOptions, LanguageModelStatic, ModelAnswer, ModelSession } from './model.js' */

/** The request's message type: `{type: MODEL_HOST, method, name, …}`. */
export const MODEL_HOST = 'model-host';

/** How long past an answer's time limit the worker waits for the offscreen document to say so itself (ms). */
export const HOST_GRACE_MS = 1000;

/** The model's states, to check an answer that came over a message. */
const STATES = ['available', 'downloadable', 'downloading', 'unavailable', 'missing'];

/** Why a question got no answer, to check the same. */
const REASONS = ['unavailable', 'late', 'aborted', 'failed'];

/**
 * A request to the offscreen document.
 *
 * @typedef {object} HostRequest
 * @property {typeof MODEL_HOST} type The message type.
 * @property {'availability' | 'ask' | 'abort' | 'release'} method What's asked.
 * @property {string} name The session's name (one base session each).
 * @property {LanguageModelOptions} [options] What its sessions are made with.
 * @property {InitialPrompt[]} [initialPrompts] Its instructions and examples.
 * @property {string} [id] A question's id, for `abort`.
 * @property {string} [prompt] The question.
 * @property {number} [timeoutMs] Its time limit.
 * @property {object} [responseConstraint] The answer's JSON Schema.
 */

/**
 * The parts of `chrome.runtime` the worker's side uses.
 *
 * @typedef {{sendMessage(message: unknown): Promise<unknown>}} HostSender
 */

/**
 * The parts of `chrome.runtime` the offscreen document's side uses.
 *
 * @typedef {object} HostRuntime
 * @property {string} id This extension's id: requests from anyone else are ignored.
 * @property {{addListener(listener: (message: unknown, sender: {id?: string, tab?: unknown}, respond: (answer: unknown) => void) => boolean): void}} onMessage
 *   `chrome.runtime.onMessage`.
 */

/**
 * @typedef {object} HostedSessionSetup
 * @property {string} name The session's name, its own among the extension's sessions ('topics').
 * @property {LanguageModelOptions} options What sessions are made (and availability asked) with.
 * @property {InitialPrompt[]} [initialPrompts] The instructions and examples every question starts from.
 * @property {HostSender} runtime `chrome.runtime`.
 * @property {() => Promise<unknown>} open Makes sure the offscreen document is open
 *   (`() => watchFromOffscreen(chrome)`); only called when the worker has no Prompt API.
 * @property {() => LanguageModelStatic | undefined} [model] The worker's own Prompt API, read when used.
 *   Default Chrome's.
 */

/**
 * A model session for a service worker: the worker's own Prompt API when it
 * has one, else the offscreen document's. The same `ModelSession` either way.
 * An answer's JSON Schema crosses to the offscreen document as JSON, so it
 * must be a plain object there (not a RegExp).
 *
 * @param {HostedSessionSetup} setup - The session, and how to reach the offscreen document.
 * @returns {ModelSession} The session.
 * @example
 * // background.js
 * const words = createHostedModelSession({
 *   name: 'words', options: ENGLISH, initialPrompts: [{ role: 'system', content: 'You list words.' }],
 *   runtime: chrome.runtime, open: () => watchFromOffscreen(chrome),
 * });
 * const { text } = await words.ask('Topic: football', { timeoutMs: 20_000 });
 */
export function createHostedModelSession({ name, options, initialPrompts = [], runtime, open, model = chromeLanguageModel }) {
  const local = createModelSession({ model, options, initialPrompts });
  let asked = 0;

  /**
   * Ask the offscreen document.
   *
   * @param {HostRequest['method']} method
   * @param {Partial<HostRequest>} [more]
   * @returns {Promise<unknown>} Its answer; rejects when there's no document to hear it.
   */
  const send = async (method, more = {}) => {
    await open();
    return runtime.sendMessage(/** @type {HostRequest} */ ({ type: MODEL_HOST, method, name, options, initialPrompts, ...more }));
  };

  return {
    async availability() {
      if (model()) return local.availability();
      const state = await send('availability').catch(() => 'missing');
      return STATES.includes(/** @type {string} */ (state)) ? /** @type {Availability} */ (state) : 'missing';
    },

    async ask(prompt, askOptions) {
      if (model()) return local.ask(prompt, askOptions);
      const { timeoutMs, signal, responseConstraint } = askOptions;
      if (signal?.aborted) return { text: null, reason: 'aborted' };
      const id = `${name}:${Date.now()}:${asked++}`;
      const onAbort = () => { runtime.sendMessage({ type: MODEL_HOST, method: 'abort', name, id }).catch(() => {}); };
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        // The document keeps the time limit; the worker's own is for a document that never answers.
        const answer = /** @type {Partial<ModelAnswer> | 'gone' | 'late' | undefined} */ (await within(
          send('ask', { id, prompt, timeoutMs, ...(responseConstraint && { responseConstraint }) }).catch(() => 'gone'),
          timeoutMs + HOST_GRACE_MS,
          'late',
        ));
        if (answer === 'late') {
          onAbort();
          return { text: null, reason: signal?.aborted ? 'aborted' : 'late' };
        }
        if (answer && typeof answer === 'object') {
          if (typeof answer.text === 'string' && answer.reason === 'answered') return { text: answer.text, reason: 'answered' };
          if (REASONS.includes(/** @type {string} */ (answer.reason))) return { text: null, reason: /** @type {Exclude<ModelAnswer['reason'], 'answered'>} */ (answer.reason) };
        }
        return { text: null, reason: signal?.aborted ? 'aborted' : 'unavailable' };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },

    release() {
      local.release();
      if (!model()) runtime.sendMessage({ type: MODEL_HOST, method: 'release', name }).catch(() => {});
    },
  };
}

/**
 * Answer the worker's model requests, in the offscreen document: one base
 * session per name, made with the options and instructions the request
 * carries (and again if they change). Requests from another extension, or
 * from a content script (a web page's side), are ignored.
 *
 * @param {HostRuntime} runtime - `chrome.runtime`.
 * @param {{model?: () => LanguageModelStatic | undefined}} [options] - The document's Prompt API. Default Chrome's.
 * @returns {void}
 * @example
 * // offscreen/offscreen.js
 * watchSchemeOffscreen(chrome.runtime);
 * serveModelOffscreen(chrome.runtime);
 */
export function serveModelOffscreen(runtime, { model = chromeLanguageModel } = {}) {
  /** Each name's session, and the setup it was made with. @type {Map<string, {setup: string, session: ModelSession}>} */
  const sessions = new Map();
  /** The questions being answered, to stop one. @type {Map<string, AbortController>} */
  const asking = new Map();

  /** @param {HostRequest} request @returns {ModelSession} */
  const sessionFor = ({ name, options = {}, initialPrompts = [] }) => {
    const setup = JSON.stringify([options, initialPrompts]);
    const kept = sessions.get(name);
    if (kept?.setup === setup) return kept.session;
    kept?.session.release();
    const session = createModelSession({ model, options, initialPrompts });
    sessions.set(name, { setup, session });
    return session;
  };

  /** @param {HostRequest} request @returns {Promise<unknown>} */
  const answer = async (request) => {
    switch (request.method) {
      case 'availability':
        return sessionFor(request).availability();
      case 'ask': {
        const stop = new AbortController();
        const id = String(request.id);
        asking.set(id, stop);
        try {
          return await sessionFor(request).ask(String(request.prompt ?? ''), /** @type {AskOptions} */ ({
            timeoutMs: Number(request.timeoutMs) || 0,
            signal: stop.signal,
            ...(request.responseConstraint && { responseConstraint: request.responseConstraint }),
          }));
        } finally {
          asking.delete(id);
        }
      }
      case 'abort':
        asking.get(String(request.id))?.abort();
        return null;
      case 'release':
        sessions.get(request.name)?.session.release();
        sessions.delete(request.name);
        return null;
      default:
        return null;
    }
  };

  runtime.onMessage.addListener((message, sender, respond) => {
    const request = /** @type {HostRequest | null | undefined} */ (message);
    if (request?.type !== MODEL_HOST || typeof request.name !== 'string') return false;
    if (sender.id !== runtime.id || sender.tab) return false;
    answer(request).then(respond, () => respond(null));
    return true;
  });
}
