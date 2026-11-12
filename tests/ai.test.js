/**
 * Chrome's on-device model, through the real module against the kit's fake
 * Prompt API (`fakeLanguageModel`): availability asked with the session's
 * options, a download only from `downloadModel` with progress, one base
 * session and a clone per question, the time limit (a cold start comes back
 * 'late' and the next question uses the session that kept loading), the
 * caller's abort, failures, and the settings row in jsdom.
 *
 * @module tests/ai
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { RUNTIME_ENTRIES } from '../src/build/index.js';
import {
  MODEL_HOST, MODEL_MESSAGES, chromeLanguageModel, createHostedModelSession, createModelRow, createModelSession, describeModel, downloadModel,
  modelAvailability, serveModelOffscreen,
} from '../src/index.js';
import { fakeLanguageModel } from '../src/testing/index.js';

/** The options every session here is made with. */
const ENGLISH = Object.freeze({
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
});

/** @param {ReturnType<typeof fakeLanguageModel>} model */
const sessionsOver = (model) => createModelSession({ model: () => model, options: ENGLISH, initialPrompts: [{ role: 'system', content: 'Be brief.' }] });

describe('modelAvailability and chromeLanguageModel', () => {
  it('asks with the session’s options, says “missing” with no Prompt API and “unavailable” when asking throws', async () => {
    const model = fakeLanguageModel({ availability: 'downloadable' });
    assert.equal(await modelAvailability(model, ENGLISH), 'downloadable');
    assert.deepEqual(model.log.availability, [ENGLISH]);
    assert.equal(await modelAvailability(undefined, ENGLISH), 'missing');
    const broken = { ...model, availability: async () => { throw new Error('gone'); } };
    assert.equal(await modelAvailability(broken, ENGLISH), 'unavailable');
  });

  it('reads LanguageModel from the scope when asked, undefined without one', () => {
    const model = fakeLanguageModel();
    assert.equal(chromeLanguageModel({ LanguageModel: model }), model);
    assert.equal(chromeLanguageModel({}), undefined);
  });
});

describe('downloadModel', () => {
  it('creates a session with the options, reports Chrome’s progress, lets the session go, and is then available', async () => {
    const model = fakeLanguageModel({ availability: 'downloadable' });
    /** @type {number[]} */
    const progress = [];
    assert.equal(await downloadModel(model, ENGLISH, { onProgress: (loaded) => progress.push(loaded) }), 'available');
    assert.deepEqual(progress, [0, 0.5, 1]);
    assert.equal(model.log.created.length, 1);
    assert.deepEqual(model.log.created[0].expectedOutputs, ENGLISH.expectedOutputs);
    assert.equal(model.log.destroyed, 1);
  });

  it('rejects when the download fails part way, or there’s no Prompt API', async () => {
    const model = fakeLanguageModel({ availability: 'downloadable', failDownload: true });
    await assert.rejects(downloadModel(model, ENGLISH), /Download failed/);
    assert.equal(await modelAvailability(model, ENGLISH), 'downloadable');
    await assert.rejects(downloadModel(undefined, ENGLISH), /no Prompt API/);
  });
});

describe('describeModel', () => {
  it('maps each state to the settings page’s words', () => {
    assert.deepEqual(describeModel('available'), { state: 'ready', status: 'optionsModelReady', help: '', canDownload: false });
    assert.deepEqual(describeModel('downloading'), { state: 'pending', status: 'optionsModelNeedsDownload', help: 'optionsModelDownloadHelp', canDownload: true });
    assert.deepEqual(describeModel('missing'), { state: 'off', status: 'optionsModelMissing', help: 'optionsModelMissingHelp', canDownload: false });
    assert.deepEqual(describeModel('unavailable'), { state: 'off', status: 'optionsModelUnsupported', help: 'optionsModelRequirements', canDownload: false });
  });
});

describe('createModelSession', () => {
  it('makes one base session with the instructions, and asks a clone for each question', async () => {
    const model = fakeLanguageModel({ answer: (prompt) => `re: ${prompt}` });
    const sessions = sessionsOver(model);
    assert.deepEqual(await sessions.ask('one', { timeoutMs: 1000 }), { text: 're: one', reason: 'answered' });
    assert.deepEqual(await sessions.ask('two', { timeoutMs: 1000, responseConstraint: { type: 'array' } }), { text: 're: two', reason: 'answered' });
    assert.equal(model.log.created.length, 1);
    assert.deepEqual(model.log.created[0].initialPrompts, [{ role: 'system', content: 'Be brief.' }]);
    assert.equal(model.log.cloned, 2);
    assert.equal(model.log.destroyed, 2, 'each clone let go');
    assert.deepEqual(model.log.promptOptions[1].responseConstraint, { type: 'array' });
  });

  it('never creates (or downloads) a model that isn’t available: “unavailable”', async () => {
    const model = fakeLanguageModel({ availability: 'downloadable' });
    assert.deepEqual(await sessionsOver(model).ask('x', { timeoutMs: 1000 }), { text: null, reason: 'unavailable' });
    assert.equal(model.log.created.length, 0);
    assert.deepEqual(await createModelSession({ model: () => undefined, options: ENGLISH }).ask('x', { timeoutMs: 1000 }), { text: null, reason: 'unavailable' });
  });

  it('a cold start is “late”, and the session it started serves the next question', async () => {
    const model = fakeLanguageModel({ createMs: 150 });
    const sessions = sessionsOver(model);
    const started = Date.now();
    assert.deepEqual(await sessions.ask('first', { timeoutMs: 40 }), { text: null, reason: 'late' });
    assert.ok(Date.now() - started < 120, 'the limit is kept');
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    assert.deepEqual(await sessions.ask('second', { timeoutMs: 40 }), { text: 'Fake answer', reason: 'answered' });
    assert.equal(model.log.created.length, 1, 'the cold session was kept, not made again');
  });

  it('a slow answer is stopped by its signal once late', async () => {
    const model = fakeLanguageModel({ answerMs: 500 });
    assert.deepEqual(await sessionsOver(model).ask('slow', { timeoutMs: 50 }), { text: null, reason: 'late' });
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    assert.equal(model.log.aborted, 1);
    assert.equal(model.log.destroyed, 1, 'the clone let go');
  });

  it('the caller’s signal stops it: “aborted”, before or during the answer', async () => {
    const model = fakeLanguageModel({ answerMs: 500 });
    const sessions = sessionsOver(model);
    assert.deepEqual(await sessions.ask('x', { timeoutMs: 1000, signal: AbortSignal.abort() }), { text: null, reason: 'aborted' });
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 30);
    assert.deepEqual(await sessions.ask('y', { timeoutMs: 1000, signal: stop.signal }), { text: null, reason: 'aborted' });
    assert.equal(model.log.aborted, 1);
  });

  it('a failed answer is “failed”; a failed base session isn’t kept, so the next question tries again', async () => {
    const model = fakeLanguageModel({ failPrompt: true });
    const sessions = sessionsOver(model);
    assert.deepEqual(await sessions.ask('x', { timeoutMs: 1000 }), { text: null, reason: 'failed' });
    const flaky = fakeLanguageModel();
    let fails = 1;
    const create = flaky.create.bind(flaky);
    flaky.create = async (options) => {
      if (fails-- > 0) throw new Error('busy');
      return create(options);
    };
    const again = sessionsOver(flaky);
    assert.equal((await again.ask('a', { timeoutMs: 1000 })).reason, 'failed');
    assert.equal((await again.ask('b', { timeoutMs: 1000 })).reason, 'answered');
  });

  it('release lets the base session go; the next question makes another', async () => {
    const model = fakeLanguageModel();
    const sessions = sessionsOver(model);
    await sessions.ask('a', { timeoutMs: 1000 });
    sessions.release();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.equal(model.log.destroyed, 2, 'the clone and the base');
    await sessions.ask('b', { timeoutMs: 1000 });
    assert.equal(model.log.created.length, 2);
    assert.equal(await sessions.availability(), 'available');
  });

  it('is in the runtime half, vendored with it, its words under standard keys', () => {
    assert.ok(RUNTIME_ENTRIES.includes('ai'));
    const keys = new Set(/** @type {string[]} */ (Object.values(MODEL_MESSAGES)));
    for (const state of ['available', 'downloadable', 'missing', 'unavailable']) {
      const { status, help } = describeModel(state);
      assert.ok(keys.has(status) && (!help || keys.has(help)), state);
    }
  });
});

describe('createModelRow (jsdom)', () => {
  /** A page with the row's markup. */
  const page = () => {
    const { window } = new JSDOM(`<span id="status"></span><span id="help" hidden></span><progress id="progress" max="1" hidden></progress><button id="download" hidden>Download</button>`);
    const doc = window.document;
    const get = (/** @type {string} */ id) => /** @type {HTMLElement} */ (doc.getElementById(id));
    return {
      window,
      parts: {
        status: get('status'), help: get('help'),
        download: /** @type {HTMLButtonElement} */ (get('download')), progress: /** @type {HTMLProgressElement} */ (get('progress')),
      },
    };
  };
  /** The page's messages: the key, and any substitutions. @param {string} key @param {string | string[]} [subs] */
  const t = (key, subs) => (subs ? `${key}(${[subs].flat().join(',')})` : key);

  it('shows the state, offers Download only when it can be had, and downloads from the click with progress', async () => {
    const { parts, window } = page();
    const model = fakeLanguageModel({ availability: 'downloadable' });
    /** @type {string[]} */
    const shown = [];
    const row = createModelRow(parts, {
      options: ENGLISH, t, model: () => model, state: () => modelAvailability(model, ENGLISH), onShown: ({ state }) => shown.push(state),
    });
    assert.equal(row.current(), null);
    await row.refresh();
    assert.equal(parts.status.textContent, 'optionsModelNeedsDownload');
    assert.equal(parts.help.textContent, 'optionsModelDownloadHelp');
    assert.equal(parts.download.hidden, false);
    /** @type {string[]} */
    const seen = [];
    const watch = new window.MutationObserver(() => seen.push(parts.status.textContent ?? ''));
    watch.observe(parts.status, { childList: true });
    parts.download.click();
    assert.equal(parts.download.disabled, true);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    watch.disconnect();
    assert.ok(seen.includes('optionsModelDownloading(100)'), seen.join(' | '));
    assert.equal(parts.progress.value, 1);
    assert.equal(parts.status.textContent, 'optionsModelReady');
    assert.equal(parts.download.hidden, true);
    assert.equal(parts.progress.hidden, true);
    assert.deepEqual(shown, ['pending', 'ready']);
    assert.equal(row.current(), 'available');
  });

  it('says when a download failed, and offers it again; with no Prompt API, says so and offers nothing', async () => {
    const { parts } = page();
    const model = fakeLanguageModel({ availability: 'downloadable', failDownload: true });
    const row = createModelRow(parts, { options: ENGLISH, t, model: () => model, state: () => modelAvailability(model, ENGLISH) });
    await row.refresh();
    parts.download.click();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(parts.help.textContent, 'optionsModelDownloadFailed');
    assert.equal(parts.download.hidden, false);
    assert.equal(parts.download.disabled, false);
    const missing = page();
    await createModelRow(missing.parts, { options: ENGLISH, t, model: () => undefined, state: async () => 'missing' }).refresh();
    assert.equal(missing.parts.status.textContent, 'optionsModelMissing');
    assert.equal(missing.parts.help.textContent, 'optionsModelMissingHelp');
    assert.equal(missing.parts.download.hidden, true);
  });
});

describe('a base session Chrome let go', () => {
  it('is made again, once, and the question answered', async () => {
    const model = fakeLanguageModel();
    let gone = false;
    /** The Prompt API, its first base session failing to clone once `gone`. */
    const flaky = {
      ...model,
      create: async (/** @type {import('../src/index.js').LanguageModelOptions} */ options = {}) => {
        const session = await model.create(options);
        const first = model.log.created.length === 1;
        return { ...session, clone: async (/** @type {{signal?: AbortSignal}} */ o = {}) => { if (first && gone) throw new DOMException('The session has been destroyed.', 'InvalidStateError'); return session.clone(o); } };
      },
    };
    const sessions = createModelSession({ model: () => flaky, options: ENGLISH });
    assert.equal((await sessions.ask('one', { timeoutMs: 500 })).reason, 'answered');
    gone = true;
    assert.deepEqual(await sessions.ask('two', { timeoutMs: 500 }), { text: 'Fake answer', reason: 'answered' });
    assert.equal(model.log.created.length, 2);
    assert.equal((await sessions.ask('three', { timeoutMs: 500 })).reason, 'answered');
    assert.equal(model.log.created.length, 2); // The new one is kept.
  });
});

describe('a model session for a service worker', () => {
  /**
   * A worker and an offscreen document joined by `chrome.runtime` messages, as Chrome carries
   * them: JSON only, to every listener, the first answer back.
   *
   * @param {ReturnType<typeof fakeLanguageModel> | undefined} documentModel - The document's Prompt API.
   */
  const joined = (documentModel) => {
    /** @type {((message: unknown, sender: {id?: string, tab?: unknown}, respond: (answer: unknown) => void) => boolean)[]} */
    const listeners = [];
    const state = { opened: 0, sender: /** @type {{id?: string, tab?: unknown}} */ ({ id: 'kit' }), sent: /** @type {any[]} */ ([]) };
    const runtime = {
      id: 'kit',
      onMessage: { addListener: (/** @type {typeof listeners[number]} */ listener) => { listeners.push(listener); } },
      sendMessage: (/** @type {unknown} */ message) => new Promise((resolve, reject) => {
        const carried = JSON.parse(JSON.stringify(message));
        state.sent.push(carried);
        const heard = listeners.filter((listener) => listener(carried, state.sender, (answer) => resolve(answer === undefined ? undefined : JSON.parse(JSON.stringify(answer)))));
        if (!heard.length) reject(new Error('Could not establish connection. Receiving end does not exist.'));
      }),
    };
    const open = async () => {
      if (state.opened++ === 0) serveModelOffscreen(runtime, { model: () => documentModel });
    };
    return { runtime, open, state };
  };
  const INSTRUCTIONS = [{ role: /** @type {const} */ ('system'), content: 'Be brief.' }];

  it('asks the worker’s own Prompt API when it has one, and never opens the document', async () => {
    const own = fakeLanguageModel({ answer: () => 'From the worker' });
    const { runtime, open, state } = joined(fakeLanguageModel());
    const session = createHostedModelSession({ name: 'words', options: ENGLISH, runtime, open, model: () => own });
    assert.equal(await session.availability(), 'available');
    assert.deepEqual(await session.ask('Hi', { timeoutMs: 500 }), { text: 'From the worker', reason: 'answered' });
    assert.equal(state.opened, 0);
    assert.deepEqual(state.sent, []);
  });

  it('without one, the offscreen document answers: its state, an answer with the session’s options and instructions, the schema', async () => {
    const inDocument = fakeLanguageModel({ answer: (prompt) => `Document: ${prompt}` });
    const { runtime, open, state } = joined(inDocument);
    const session = createHostedModelSession({ name: 'words', options: ENGLISH, initialPrompts: INSTRUCTIONS, runtime, open, model: () => undefined });
    assert.equal(await session.availability(), 'available');
    const schema = { type: 'object', properties: { words: { type: 'array' } } };
    assert.deepEqual(await session.ask('Hi', { timeoutMs: 500, responseConstraint: schema }), { text: 'Document: Hi', reason: 'answered' });
    assert.deepEqual(inDocument.log.created, [{ ...ENGLISH, initialPrompts: INSTRUCTIONS }]);
    assert.deepEqual(inDocument.log.promptOptions[0].responseConstraint, schema);
    await session.ask('Again', { timeoutMs: 500 });
    assert.equal(inDocument.log.created.length, 1); // One base session, kept in the document.
    assert.equal(state.sent.every((message) => message.type === MODEL_HOST), true);
  });

  it('the document’s reasons come back: not on this computer, late, failed', async () => {
    for (const [setup, reason] of /** @type {const} */ ([
      [{ availability: 'downloadable' }, 'unavailable'], [{ answerMs: 200 }, 'late'], [{ failPrompt: true }, 'failed'],
    ])) {
      const { runtime, open } = joined(fakeLanguageModel(setup));
      const session = createHostedModelSession({ name: 'words', options: ENGLISH, runtime, open, model: () => undefined });
      assert.deepEqual(await session.ask('Hi', { timeoutMs: 40 }), { text: null, reason });
    }
  });

  it('the caller’s abort stops the answer in the document', async () => {
    const inDocument = fakeLanguageModel({ answerMs: 2000 });
    const { runtime, open } = joined(inDocument);
    const session = createHostedModelSession({ name: 'words', options: ENGLISH, runtime, open, model: () => undefined });
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 20);
    assert.deepEqual(await session.ask('Hi', { timeoutMs: 5000, signal: stop.signal }), { text: null, reason: 'aborted' });
    assert.equal(inDocument.log.aborted, 1);
    stop.abort();
    assert.deepEqual(await session.ask('Hi', { timeoutMs: 5000, signal: stop.signal }), { text: null, reason: 'aborted' });
  });

  it('no document to ask (it couldn’t open, or has no Prompt API either): missing, unavailable, nothing thrown', async () => {
    const closed = { sendMessage: async () => { throw new Error('Could not establish connection.'); } };
    const refused = createHostedModelSession({ name: 'words', options: ENGLISH, runtime: closed, open: async () => { throw new Error('No offscreen permission'); }, model: () => undefined });
    assert.equal(await refused.availability(), 'missing');
    assert.deepEqual(await refused.ask('Hi', { timeoutMs: 50 }), { text: null, reason: 'unavailable' });
    refused.release();

    const { runtime, open } = joined(undefined);
    const neither = createHostedModelSession({ name: 'words', options: ENGLISH, runtime, open, model: () => undefined });
    assert.equal(await neither.availability(), 'missing');
    assert.deepEqual(await neither.ask('Hi', { timeoutMs: 50 }), { text: null, reason: 'unavailable' });
  });

  it('the document ignores a web page’s content script and another extension; each name has its own session', async () => {
    const inDocument = fakeLanguageModel();
    const { runtime, open, state } = joined(inDocument);
    const words = createHostedModelSession({ name: 'words', options: ENGLISH, runtime, open, model: () => undefined });
    const checks = createHostedModelSession({ name: 'checks', options: ENGLISH, initialPrompts: INSTRUCTIONS, runtime, open, model: () => undefined });
    await words.ask('a', { timeoutMs: 500 });
    await checks.ask('b', { timeoutMs: 500 });
    assert.equal(inDocument.log.created.length, 2);
    words.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await words.ask('c', { timeoutMs: 500 });
    assert.equal(inDocument.log.created.length, 3); // Released: made again.

    state.sender = { id: 'kit', tab: { id: 4 } };
    assert.deepEqual(await words.ask('from a page', { timeoutMs: 50 }), { text: null, reason: 'unavailable' });
    state.sender = { id: 'someone-else' };
    assert.equal(await words.availability(), 'missing');
    assert.equal(inDocument.log.prompts.includes('from a page'), false);
  });
});
