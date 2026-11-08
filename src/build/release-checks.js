/**
 * Package-time reminders about the About card's links (about/links.js): a
 * loud warning while any is a placeholder, so a build with example.com links
 * can't ship by accident, and a reminder that GitHub links need a public
 * repository. Both only print: the zip is still fine for testing.
 *
 * @module build/release-checks
 */

import { isPlaceholder } from '../about/links.js';

/**
 * The warning to print while any link is a placeholder.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @returns {string | null} The warning, naming each placeholder, or null when every link is real.
 * @example
 * placeholderWarning({ help: 'https://example.com/help' });
 * // '!!!…\n!! WARNING: the About card still has placeholder links …\n!!   help: https://example.com/help\n…'
 */
export function placeholderWarning(links) {
  const left = Object.entries(links).filter(([, url]) => isPlaceholder(url));
  if (!left.length) return null;
  const bar = '!'.repeat(78);
  return [
    bar,
    '!! WARNING: the About card still has placeholder links (about-links.js):',
    ...left.map(([name, url]) => `!!   ${name}: ${url}`),
    '!! Don’t submit this zip to the Chrome Web Store. Set the real URLs and rerun `npm run package`.',
    bar,
  ].join('\n');
}

/**
 * The reminder to print when the links point into a repository: it has to be
 * public before the store listing goes live.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @param {string} repository - The repository's address.
 * @returns {string | null} The reminder, or null when no link is in the repository.
 */
export function repositoryReminder(links, repository) {
  return Object.values(links).some((url) => url.startsWith(repository))
    ? `Reminder: the About links point at ${repository}. Make the repository public before submitting to the Chrome Web Store.`
    : null;
}

/**
 * Print both, the warning on stderr: run last in `npm run package`, so it's
 * the thing on screen.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @param {string} repository - The repository's address.
 * @returns {void}
 */
export function printReleaseChecks(links, repository) {
  const warning = placeholderWarning(links);
  if (warning) console.warn(`\n${warning}\n`);
  const reminder = repositoryReminder(links, repository);
  if (reminder) console.log(`\n${reminder}\n`);
}
