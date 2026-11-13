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
  MAX_HOST_LENGTH, createSiteList, hostPatterns, isLocalUrl, isWebUrl, onSite, originPattern, siteHost, siteLabel, siteOrigin, withSite,
  withSiteReplaced, withoutSite,
} from '../src/index.js';

describe('sites', () => {
  it('isWebUrl: http and https only', () => {
    assert.equal(isWebUrl('http://a.com/'), true);
    assert.equal(isWebUrl('https://a.com/'), true);
    assert.equal(['mailto:a@b.com', 'javascript:void 0', 'chrome://extensions', 'file:///etc/hosts', 'nonsense', ''].some(isWebUrl), false);
  });

  it('isLocalUrl: this computer and its network, however the address is written; the internet isn’t', () => {
    for (const url of [
      'http://localhost/', 'http://app.localhost:3000/', 'http://127.0.0.1:8080/', 'http://0x7f.1/', 'http://2130706433/', 'http://10.1.2.3/',
      'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/admin', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/',
      'http://0.0.0.0/', 'http://[::1]/', 'http://[::]/', 'http://[fd12::1]/', 'http://[fe80::1]/', 'http://[::ffff:192.168.0.1]/',
      'http://router/', 'http://printer.local/', 'http://nas.lan/', 'http://db.internal/', 'http://host.home.arpa/', 'http://localhost./',
    ]) assert.equal(isLocalUrl(url), true, url);
    for (const url of [
      'https://example.com/', 'http://8.8.8.8/', 'http://172.32.0.1/', 'http://100.128.0.1/', 'http://192.169.1.1/', 'http://[2606:4700::1111]/',
      'http://[::ffff:8.8.8.8]/', 'https://local.example.com/', 'https://internal.example/', 'mailto:a@b.com', 'nonsense',
    ]) assert.equal(isLocalUrl(url), false, url);
  });

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

  it('a match pattern typed as a site is its host: the list covers subdomains anyway', () => {
    assert.equal(siteHost('*.example.com'), 'example.com');
    assert.equal(siteHost('https://*.example.com/shop'), 'example.com');
    assert.equal(siteHost('*://*.example.com/*'), 'example.com');
    assert.equal(siteHost('*://example.com/*'), 'example.com');
    assert.equal(siteOrigin('*.example.com'), 'https://example.com');
    assert.deepEqual(hostPatterns(/** @type {string} */ (siteHost('*.example.com'))), ['*://example.com/*', '*://*.example.com/*']);
  });

  it('only a real host name is a site: no wildcard inside, stray punctuation or empty label', () => {
    for (const typed of ['*', '*.com.*', 'www.*.example.com', 'exam*ple.com', 'example.com,', 'a..b', '.com', 'exa mple.com', '[::1]']) {
      assert.equal(siteHost(typed), null, typed);
      assert.equal(siteOrigin(typed), null, typed);
    }
    assert.equal(siteHost('my_site.example.com'), 'my_site.example.com');
    assert.equal(siteHost('xn--bcher-kva.de'), 'xn--bcher-kva.de');
    assert.equal(siteHost('bücher.de'), 'xn--bcher-kva.de');
    assert.equal(siteHost('127.0.0.1:8080'), '127.0.0.1');
    assert.equal(siteHost('Example.COM.'), 'example.com');
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

  it('the field is cleared only if it still holds what was added (adding can wait on a permission prompt)', async () => {
    /** @type {(value: unknown) => void} */
    let granted = () => {};
    const { input, type } = card({ add: () => new Promise((resolve) => { granted = resolve; }) });
    await type('example.com');
    input.value = 'next.example.org'; // Typed while Chrome asks.
    granted(true);
    await new Promise((resolve) => setTimeout(resolve));
    assert.equal(input.value, 'next.example.org');
  });

  it('the focus stays in the list across a redraw: the row after a removed one, the last, then the way to add', async () => {
    const { document, type, input } = card();
    await type('a.com');
    await type('b.com');
    await type('c.com');
    const buttons = () => /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('#sites li button')]);
    const focusedLabel = () => document.activeElement?.getAttribute('aria-label');
    buttons()[1].focus();
    buttons()[1].click(); // Remove b.com: the focus was on a button that's gone.
    assert.equal(focusedLabel(), 'Remove “c.com”');
    buttons()[1].click();
    assert.equal(focusedLabel(), 'Remove “a.com”');
    buttons()[0].click();
    assert.equal(document.activeElement, input);
    // A redraw while the focus is elsewhere leaves it there.
    await type('d.com');
    input.focus();
    await type('e.com');
    assert.equal(document.activeElement, input);
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
