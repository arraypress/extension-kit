import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  TOOLBAR_SCHEME, byId, githubAboutLinks, localize, setAboutLinks, setShortcuts, setUpPage, statusFlasher, translator, valueRow,
} from '../src/index.js';
import { fakeChromeStorage, until } from '../src/testing/index.js';

const page = () => new JSDOM(`<!doctype html>
  <input id="days" type="number"><span id="status" class="save-status"></span>
  <a id="help"></a><a id="report-issue"></a><a id="privacy-policy"></a>`).window;

describe('page helpers', () => {
  it('byId returns the element with its type, and fails loudly when the markup disagrees', () => {
    const { document, HTMLInputElement, HTMLAnchorElement } = page();
    assert.equal(byId('days', HTMLInputElement, document).type, 'number');
    assert.throws(() => byId('days', HTMLAnchorElement, document), /#days is a HTMLInputElement, not a HTMLAnchorElement/);
    assert.throws(() => byId('gone', HTMLInputElement, document), /#gone is missing/);
  });

  it('valueRow is chrome-ui’s row with the value at its end', () => {
    const { document } = page();
    assert.equal(valueRow('Close duplicate tabs', '⌥⇧D', document).outerHTML,
      '<div class="row"><span class="label">Close duplicate tabs</span><span class="row-value">⌥⇧D</span></div>');
  });

  it('setAboutLinks points the About card’s rows at the repository', () => {
    const { document } = page();
    const links = githubAboutLinks('https://github.com/arraypress/upright');
    setAboutLinks(links, document);
    assert.equal(/** @type {HTMLAnchorElement} */ (document.getElementById('report-issue')).href, links.reportIssue);
    assert.equal(/** @type {HTMLAnchorElement} */ (document.getElementById('privacy-policy')).href, links.privacyPolicy);
  });

  it('statusFlasher shows the text, then hides it after the wait; a new flash restarts it', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { document } = page();
    const status = /** @type {HTMLElement} */ (document.getElementById('status'));
    const flash = statusFlasher(status, 1500);
    flash('Saved');
    assert.equal(status.textContent, 'Saved');
    assert.ok(status.classList.contains('show'));
    t.mock.timers.tick(1000);
    flash('Saved');
    t.mock.timers.tick(1000);
    assert.ok(status.classList.contains('show'));
    t.mock.timers.tick(500);
    assert.ok(!status.classList.contains('show'));
  });
});

describe('shortcuts', () => {
  const entries = [{ id: 'close-site-tabs', title: 'Close tabs from this site' }, { id: 'mute-other-tabs', title: 'Mute other tabs' }];

  it('lists only the shortcuts that are set, in the given order', () => {
    const commands = [{ name: 'mute-other-tabs', shortcut: '⌥⇧M' }, { name: 'close-site-tabs', shortcut: '⌥⇧W' }, { name: 'other', shortcut: '⌥⇧O' }];
    assert.deepEqual(setShortcuts(entries, commands).map((entry) => [entry.id, entry.shortcut]), [
      ['close-site-tabs', '⌥⇧W'],
      ['mute-other-tabs', '⌥⇧M'],
    ]);
  });

  it('nothing set means an empty list (the page then shows only the link row)', () => {
    assert.deepEqual(setShortcuts(entries, entries.map((entry) => ({ name: entry.id, shortcut: '' }))), []);
    assert.deepEqual(setShortcuts(entries, []), []);
  });
});

describe('localize', () => {
  /** A `chrome.i18n` with two messages. */
  const i18n = {
    /** @param {string} key @param {string | string[]} [subs] */
    getMessage: (key, subs) => ({ title: 'Settings', hint: `Press ${[subs].flat()[0]}`, search: 'Search sites' })[key] ?? '',
    getUILanguage: () => 'en-GB',
  };

  it('fills text and any attribute, shows a missing key as itself, and sets the page’s language', () => {
    const { document } = new JSDOM('<h1 data-i18n="title">x</h1><input data-i18n-placeholder="search" data-i18n-aria-label="search"><p data-i18n="typo"></p>').window;
    localize(document, i18n);
    assert.equal(document.querySelector('h1')?.textContent, 'Settings');
    assert.equal(document.querySelector('input')?.placeholder, 'Search sites');
    assert.equal(document.querySelector('input')?.getAttribute('aria-label'), 'Search sites');
    assert.equal(document.querySelector('p')?.textContent, 'typo');
    assert.equal(document.documentElement.lang, 'en-GB');
  });

  it('translator substitutes', () => {
    assert.equal(translator(i18n)('hint', ['R']), 'Press R');
  });
});

describe('setUpPage', () => {
  /** A `chrome.i18n` that names the extension. */
  const i18n = {
    /** @param {string} key @param {string | string[]} [subs] */
    getMessage: (key, subs) => ({ optionsTitle: `${[subs].flat()[0]} settings`, heading: 'Appearance' })[key] ?? '',
    getUILanguage: () => 'en-GB',
  };

  /**
   * A page, and `chrome` with a fake storage and a runtime that records what's sent.
   *
   * @param {boolean} dark - The page's scheme.
   */
  const setup = (dark) => {
    const { document } = new JSDOM('<title>x</title><h2 data-i18n="heading"></h2>').window;
    /** @type {unknown[]} */
    const sent = [];
    const api = { i18n, storage: fakeChromeStorage({ local: { toolbarDark: false } }), runtime: { sendMessage: async (/** @type {unknown} */ message) => { sent.push(message); } } };
    const media = { matches: dark, addEventListener: () => {} };
    return { document, sent, api, media };
  };

  it('localises the page, sets its title from a message, and reports its scheme for the toolbar glyph', async () => {
    const { document, sent, api, media } = setup(true);
    const t = setUpPage(api, { title: 'optionsTitle', substitutions: ['Upright'], doc: document, media });
    assert.equal(document.title, 'Upright settings');
    assert.equal(document.querySelector('h2')?.textContent, 'Appearance');
    assert.equal(document.documentElement.lang, 'en-GB');
    assert.equal(t('heading'), 'Appearance');
    await until(() => sent.length, 'the scheme report', 1000);
    assert.deepEqual(sent, [{ type: TOOLBAR_SCHEME, dark: true }]);
  });

  it('leaves the title alone without one, and only logs a scheme report that fails', async (t) => {
    const { document, api, media } = setup(true);
    const logged = t.mock.method(console, 'debug', () => {});
    api.storage.local.get = async () => { throw new Error('Extension context invalidated.'); };
    setUpPage(api, { doc: document, media });
    assert.equal(document.title, 'x');
    await until(() => logged.mock.callCount(), 'the failure logged', 1000);
    assert.match(String(logged.mock.calls[0].arguments[0]), /colour scheme/);
  });
});
