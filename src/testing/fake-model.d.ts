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
import type { LanguageModelOptions, LanguageModelStatic, PromptOptions } from '../ai/model.js';
export type FakeModelState = {
    /**
     * What `availability()` says.
     */
    availability: 'available' | 'downloadable' | 'downloading' | 'unavailable';
    /**
     * How long making a session takes (a cold start is ~18 s on a real Chrome).
     */
    createMs: number;
    /**
     * How long an answer takes.
     */
    answerMs: number;
    /**
     * The answer to a prompt.
     */
    answer: (prompt: string, options: PromptOptions) => string;
    /**
     * Whether answers fail (the model gave up).
     */
    failPrompt: boolean;
    /**
     * Whether a download fails part way.
     */
    failDownload: boolean;
    /**
     * Whether a click is behind a `create()` that has to download the
     * model (Chrome refuses one without: `NotAllowedError`). `null`, the default, reads the page's own
     * `navigator.userActivation` (and takes it as given where there's none: Node, a worker).
     */
    userActivation: boolean | null;
};
export type FakeModelLog = {
    /**
     * Each `availability()`'s options.
     */
    availability: LanguageModelOptions[];
    /**
     * Each `create()`'s options.
     */
    created: LanguageModelOptions[];
    /**
     * Each prompt.
     */
    prompts: string[];
    /**
     * Each prompt's options (signal, responseConstraint).
     */
    promptOptions: PromptOptions[];
    /**
     * Sessions cloned.
     */
    cloned: number;
    /**
     * Prompts and creates stopped by their signal.
     */
    aborted: number;
    /**
     * Sessions let go.
     */
    destroyed: number;
};
export type FakeLanguageModel = LanguageModelStatic & {
    state: FakeModelState;
    log: FakeModelLog;
    set: (patch: Partial<FakeModelState>) => void;
};
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
export declare function fakeLanguageModel(initial?: Partial<FakeModelState>): FakeLanguageModel;
