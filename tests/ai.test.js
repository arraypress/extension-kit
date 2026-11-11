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
  MODEL_MESSAGES, chromeLanguageModel, createModelRow, createModelSession, describeModel, downloadModel, modelAvailability,
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
