/**
 * Sites as people type them and pages report them, and a settings card's
 * site list with an add row, driven through its own form and buttons in
 * jsdom. The list with an Add button and a dialog needs a real `<dialog>`:
 * ui-chromium.test.js.
 *
 * @module tests/sites
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  MAX_HOST_LENGTH, createSiteList, hostPatterns, onSite, originPattern, siteHost, siteLabel, siteOrigin, withSite,
  withSiteReplaced, withoutSite,
} from '../src/index.js';

describe('sites', () => {
  it('a list with a site added (at the end, once), taken out, or edited in place (merged with a duplicate)', () => {
    const sites = Object.freeze(['a.com', 'b.com', 'c.com']);
    assert.deepEqual(withSite(sites, 'd.com'), ['a.com', 'b.com', 'c.com', 'd.com']);
    assert.deepEqual(withSite(sites, 'a.com'), ['b.com', 'c.com', 'a.com']);
    assert.deepEqual(withoutSite(sites, 'b.com'), ['a.com', 'c.com']);
    assert.deepEqual(withSiteReplaced(sites, 'b.com', 'x.com'), ['a.com', 'x.com', 'c.com']);
    assert.deepEqual(withSiteReplaced(sites, 'a.com', 'c.com'), ['c.com', 'b.com']);
  });

  it('siteOrigin: the origin Chrome grants, https unless typed, no port or path', () => {
    assert.equal(siteOrigin('example.com'), 'https://example.com');
    assert.equal(siteOrigin(' www.Example.com/shop '), 'https://www.example.com');
    assert.equal(siteOrigin('http://127.0.0.1:8080/page'), 'http://127.0.0.1');
    assert.equal(siteOrigin('localhost:3000'), 'https://localhost');
    assert.equal(siteOrigin('http://localhost:3000/x'), 'http://localhost');
    for (const bad of [undefined, 3, '', 'intranet', 'not a site', 'ftp://x.com', 'file:///x', 'chrome://settings', 'mailto:a@b.com']) {
      assert.equal(siteOrigin(bad), null, String(bad));
    }
  });

  it('siteHost: the host a list keeps, without www., port, path or a trailing dot', () => {
    assert.equal(siteHost(' https://www.GitHub.com:8443/a?x=1 '), 'github.com');
    assert.equal(siteHost('news.bbc.co.uk'), 'news.bbc.co.uk');
    assert.equal(siteHost('example.com.'), 'example.com');
    assert.equal(siteHost('127.0.0.1'), '127.0.0.1');
    assert.equal(siteHost('localhost'), 'localhost');
    assert.equal(siteHost(`${'a'.repeat(MAX_HOST_LENGTH - 4)}.com`)?.length, MAX_HOST_LENGTH);
    for (const bad of [null, 3, '', 'www.', 'intranet', 'not a site', 'javascript:void 0', 'chrome://extensions', `${'a'.repeat(MAX_HOST_LENGTH)}.com`]) {
      assert.equal(siteHost(bad), null, String(bad));
    }
  });

  it('onSite: a listed host covers its subdomains, and nothing that merely ends the same', () => {
    assert.equal(onSite('docs.github.com', ['github.com']), true);
    assert.equal(onSite('github.com', ['github.com']), true);
    assert.equal(onSite('notgithub.com', ['github.com']), false);
    assert.equal(onSite(siteHost('chrome://settings/'), ['settings']), false);
  });

  it('patterns: a listed host and its subdomains; access to a site; how a site reads', () => {
    assert.deepEqual(hostPatterns('example.com'), ['*://example.com/*', '*://*.example.com/*']);
    assert.equal(originPattern('https://example.com'), 'https://example.com/*');
    assert.equal(originPattern('https://bit.ly:8443/abc?x=1#y'), 'https://bit.ly/*');
    assert.equal(siteLabel('https://example.com'), 'example.com');
    assert.equal(siteLabel('http://example.com'), 'http://example.com');
  });
});

describe('createSiteList', () => {
  /**
   * A card's list, empty row and add form, with a site list over them.
   *
   * @param {Partial<import('../src/ui/site-list.js').SiteListOptions>} [options] - What differs.
   */
  const card = (options = {}) => {
    const { document, SubmitEvent } = new JSDOM(`<!doctype html><body>
      <ul class="list" id="sites"></ul>
      <p class="row text" id="none">No sites added</p>
      <form class="row add" id="add"><input type="text"><button type="submit">Add</button></form>`).window;
    /** @type {string[]} */
    let sites = [];
    /** @type {string[]} */
    const said = [];
    const list = createSiteList({
      list: /** @type {HTMLElement} */ (document.getElementById('sites')),
      form: /** @type {HTMLFormElement} */ (document.getElementById('add')),
      empty: /** @type {HTMLElement} */ (document.getElementById('none')),
      parse: siteHost,
      add: (site) => {
        sites = [...sites, site];
        list.render(sites);
      },
      remove: (site) => {
        sites = sites.filter((s) => s !== site);
        list.render(sites);
      },
      invalid: (text) => said.push(`invalid: ${text}`),
      ...options,
    });
    list.render(sites);
    const input = /** @type {HTMLInputElement} */ (document.querySelector('#add input'));
    /** Type `text` and press Enter. @param {string} text */
    const type = async (text) => {
      input.value = text;
      document.getElementById('add')?.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve));
    };
    return { document, input, type, said, rows: () => [...document.querySelectorAll('#sites li')].map((li) => li.outerHTML) };
  };

  it('shows “No sites added” until a site is added; a typed site is added as kept, and the field cleared', async () => {
    const { document, input, type, rows } = card();
    assert.equal(document.getElementById('none')?.hidden, false);
    await type(' https://www.Example.com/shop ');
    assert.deepEqual(rows(), ['<li class="row"><span class="label">example.com</span><button type="button" aria-label="Remove “example.com”">Remove</button></li>']);
    assert.equal(document.getElementById('none')?.hidden, true);
    assert.equal(input.value, '');
  });

  it('what isn’t a site is reported and kept in the field; a refused add keeps it too', async () => {
    const refused = card({ add: () => false });
    await refused.type('example.com');
    assert.equal(refused.input.value, 'example.com');
    const { input, type, said, rows } = card();
    await type('not a site');
    assert.deepEqual(said, ['invalid: not a site']);
    assert.equal(input.value, 'not a site');
    assert.deepEqual(rows(), []);
  });

  it('Remove takes its site out; labels and the button’s words can be the page’s own', async () => {
    const { document, type, rows } = card({
      parse: siteOrigin, words: { remove: 'Entfernen', removeLabel: (name) => `„${name}“ entfernen` },
    });
    await type('example.com');
    await type('http://example.org');
    assert.deepEqual([...document.querySelectorAll('#sites button')].map((b) => b.getAttribute('aria-label')),
      ['„example.com“ entfernen', '„http://example.org“ entfernen']);
    /** @type {HTMLButtonElement} */ (document.querySelector('#sites button')).click();
    assert.deepEqual(rows(), ['<li class="row"><span class="label">http://example.org</span><button type="button" aria-label="„http://example.org“ entfernen">Entfernen</button></li>']);
  });
});
