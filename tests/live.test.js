/**
 * A live checker's command line and proxy addresses. `exitPoint` asks real services, so it's
 * checked by the live checkers that use it, not here.
 *
 * @module tests/live
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveOptions, parseProxy } from '../src/testing/index.js';

const usage = 'Usage: npm run live -- [options]';

describe('parseProxy', () => {
  it('splits out the user and password, and hides the password', () => {
    assert.deepEqual(parseProxy('http://me:s%40cret@uk.example:8080'), {
      proxy: { server: 'http://uk.example:8080', username: 'me', password: 's@cret' },
      label: 'http://me:•••@uk.example:8080',
    });
    assert.deepEqual(parseProxy('socks5://127.0.0.1:1080'), { proxy: { server: 'socks5://127.0.0.1:1080' }, label: 'socks5://127.0.0.1:1080' });
    assert.equal(parseProxy('uk.example:3128').proxy.server, 'http://uk.example:3128');
  });
});

describe('parseLiveOptions', () => {
  it('the defaults', () => {
    assert.deepEqual(parseLiveOptions([], {}, { usage }), {
      only: [], categories: [], concurrency: 3, proxy: null, proxyLabel: '', locale: 'en-GB', timezone: 'Europe/London', out: '', help: false,
    });
    assert.equal(parseLiveOptions([], {}, { usage, concurrency: 4, locale: 'en-US' }).locale, 'en-US');
  });

  it('reads every option, with = or a space, commas listing several, bare words as --only', () => {
    const options = parseLiveOptions(['--only=amazon,ikea', 'etsy', '--category', 'shops', '--concurrency', '4', '--out', '/tmp/x', '--locale', 'de-DE', '--timezone=Europe/Berlin'], {}, { usage });
    assert.deepEqual(options.only, ['amazon', 'ikea', 'etsy']);
    assert.deepEqual(options.categories, ['shops']);
    assert.equal(options.concurrency, 4);
    assert.equal(options.out, '/tmp/x');
    assert.equal(options.locale, 'de-DE');
    assert.equal(options.timezone, 'Europe/Berlin');
  });

  it('takes the proxy from --proxy, else HTTPS_PROXY', () => {
    assert.equal(parseLiveOptions([], { HTTPS_PROXY: 'http://a:b@p.example:1' }, { usage }).proxyLabel, 'http://a:•••@p.example:1');
    assert.equal(parseLiveOptions(['--proxy', 'socks5://h:9'], { HTTPS_PROXY: 'http://x:1' }, { usage }).proxy?.server, 'socks5://h:9');
  });

  it('refuses an unknown option (with the usage), a missing value, or too many at once', () => {
    assert.throws(() => parseLiveOptions(['--nope'], {}, { usage }), /Unknown option --nope\n\nUsage/);
    assert.throws(() => parseLiveOptions(['--only'], {}, { usage }), /--only needs a value/);
    assert.throws(() => parseLiveOptions(['--concurrency', '9'], {}, { usage }), /1 to 8/);
    assert.throws(() => parseLiveOptions(['--concurrency', '5'], {}, { usage, maxConcurrency: 4 }), /1 to 4/);
    assert.equal(parseLiveOptions(['-h'], {}, { usage }).help, true);
  });
});
