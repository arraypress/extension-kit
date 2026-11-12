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
import type { InitialPrompt, LanguageModelOptions, LanguageModelStatic, ModelSession } from './model.js';
/** @import { AskOptions, Availability, InitialPrompt, LanguageModelOptions, LanguageModelStatic, ModelAnswer, ModelSession } from './model.js' */
/** The request's message type: `{type: MODEL_HOST, method, name, …}`. */
export declare const MODEL_HOST = "model-host";
/** How long past an answer's time limit the worker waits for the offscreen document to say so itself (ms). */
export declare const HOST_GRACE_MS = 1000;
export type HostRequest = {
    /**
     * The message type.
     */
    type: typeof MODEL_HOST;
    /**
     * What's asked.
     */
    method: 'availability' | 'ask' | 'abort' | 'release';
    /**
     * The session's name (one base session each).
     */
    name: string;
    /**
     * What its sessions are made with.
     */
    options?: LanguageModelOptions;
    /**
     * Its instructions and examples.
     */
    initialPrompts?: InitialPrompt[];
    /**
     * A question's id, for `abort`.
     */
    id?: string;
    /**
     * The question.
     */
    prompt?: string;
    /**
     * Its time limit.
     */
    timeoutMs?: number;
    /**
     * The answer's JSON Schema.
     */
    responseConstraint?: object;
};
export type HostSender = {
    sendMessage(message: unknown): Promise<unknown>;
};
export type HostRuntime = {
    /**
     * This extension's id: requests from anyone else are ignored.
     */
    id: string;
    /**
     *   `chrome.runtime.onMessage`.
     */
    onMessage: {
        addListener(listener: (message: unknown, sender: {
            id?: string;
            tab?: unknown;
        }, respond: (answer: unknown) => void) => boolean): void;
    };
};
export type HostedSessionSetup = {
    /**
     * The session's name, its own among the extension's sessions ('topics').
     */
    name: string;
    /**
     * What sessions are made (and availability asked) with.
     */
    options: LanguageModelOptions;
    /**
     * The instructions and examples every question starts from.
     */
    initialPrompts?: InitialPrompt[];
    /**
     * `chrome.runtime`.
     */
    runtime: HostSender;
    /**
     * Makes sure the offscreen document is open
     * (`() => watchFromOffscreen(chrome)`); only called when the worker has no Prompt API.
     */
    open: () => Promise<unknown>;
    /**
     * The worker's own Prompt API, read when used.
     * Default Chrome's.
     */
    model?: () => LanguageModelStatic | undefined;
};
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
export declare function createHostedModelSession({ name, options, initialPrompts, runtime, open, model }: HostedSessionSetup): ModelSession;
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
export declare function serveModelOffscreen(runtime: HostRuntime, { model }?: {
    model?: () => LanguageModelStatic | undefined;
}): void;
