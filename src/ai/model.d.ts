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
 *   each other;
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
export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'missing';
export type PromptOptions = {
    /**
     * Stops the answer.
     */
    signal?: AbortSignal;
    /**
     * A JSON Schema (or RegExp) the answer must follow.
     */
    responseConstraint?: object;
};
export type LanguageModelSession = {
    /**
     * The whole answer.
     */
    prompt: (prompt: string, options?: PromptOptions) => Promise<string>;
    /**
     * A copy with the same history.
     */
    clone: (options?: {
        signal?: AbortSignal;
    }) => Promise<LanguageModelSession>;
    /**
     * Let it go.
     */
    destroy: () => void;
};
export type InitialPrompt = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};
export type LanguageModelOptions = {
    /**
     * What it's given.
     */
    expectedInputs?: {
        type: string;
        languages: string[];
    }[];
    /**
     * What it answers in.
     */
    expectedOutputs?: {
        type: string;
        languages: string[];
    }[];
    /**
     * Its instructions and examples.
     */
    initialPrompts?: InitialPrompt[];
    /**
     * Hears `downloadprogress` (`loaded`, 0–1) while the model downloads.
     */
    monitor?: (monitor: EventTarget) => void;
    /**
     * Stops creating it.
     */
    signal?: AbortSignal;
};
export type LanguageModelStatic = {
    /**
     * Whether it can run here.
     */
    availability: (options?: LanguageModelOptions) => Promise<Availability>;
    /**
     * A session (downloads the model first, from a click).
     */
    create: (options?: LanguageModelOptions) => Promise<LanguageModelSession>;
};
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
export declare function chromeLanguageModel(scope?: object): LanguageModelStatic | undefined;
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
export declare function modelAvailability(model: LanguageModelStatic | undefined, options: LanguageModelOptions): Promise<Availability>;
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
export declare function downloadModel(model: LanguageModelStatic | undefined, options: LanguageModelOptions, { onProgress, signal }?: {
    onProgress?: (loaded: number) => void;
    signal?: AbortSignal;
}): Promise<Availability>;
/**
 * The settings page's words for a state: standard message keys (the
 * extension's `_locales` names them alike), as `SITE_LIST_MESSAGES` does
 * for a site list.
 */
export declare const MODEL_MESSAGES: Readonly<{
    /** “Chrome’s built-in AI”: the row's name. */
    name: "optionsModel";
    /** “Checking…” before the state is known. */
    checking: "optionsModelChecking";
    /** “Ready”. */
    ready: "optionsModelReady";
    /** “Needs download”. */
    needsDownload: "optionsModelNeedsDownload";
    /** “Chrome downloads its model once and shares it with every site and extension that uses it”. */
    downloadHelp: "optionsModelDownloadHelp";
    /** “Download”: the button. */
    download: "optionsModelDownload";
    /** “Downloading… $PERCENT$%” (content `$1`). */
    downloading: "optionsModelDownloading";
    /** “The download didn’t finish. Try again.” */
    downloadFailed: "optionsModelDownloadFailed";
    /** “Not supported on this computer”. */
    unsupported: "optionsModelUnsupported";
    /** What a computer needs to run it. */
    requirements: "optionsModelRequirements";
    /** “This Chrome doesn’t have it”. */
    missing: "optionsModelMissing";
    /** What to do about that, and that the extension works without it. */
    missingHelp: "optionsModelMissingHelp";
}>;
export type ModelStatus = {
    /**
     * Ready to use, can be downloaded, or can't run here.
     */
    state: 'ready' | 'pending' | 'off';
    /**
     * The status's message key ({@link MODEL_MESSAGES}).
     */
    status: string;
    /**
     * The help's message key ('' for none).
     */
    help: string;
    /**
     * Whether to offer Download.
     */
    canDownload: boolean;
};
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
export declare function describeModel(availability: string): ModelStatus;
export type ModelAnswer = {
    text: string;
    reason: 'answered';
} | {
    text: null;
    reason: 'unavailable' | 'late' | 'aborted' | 'failed';
};
export type AskOptions = {
    /**
     * The most the answer may take, from the moment it's asked: the base
     * session (if it must be made) and the answer.
     */
    timeoutMs: number;
    /**
     * Stops it sooner (the person cancelled).
     */
    signal?: AbortSignal;
    /**
     * A JSON Schema the answer must follow.
     */
    responseConstraint?: object;
};
export type ModelSession = {
    /**
     * The model's state, or 'missing'.
     */
    availability: () => Promise<Availability>;
    /**
     * Ask a copy of the base session.
     */
    ask: (prompt: string, options: AskOptions) => Promise<ModelAnswer>;
    /**
     * Let the base session go (the next question makes it again).
     */
    release: () => void;
};
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
export declare function createModelSession({ model, options, initialPrompts }: {
    model: () => LanguageModelStatic | undefined;
    options: LanguageModelOptions;
    initialPrompts?: InitialPrompt[];
}): ModelSession;
