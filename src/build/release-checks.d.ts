/**
 * Package-time reminders about the About card's links (about/links.js): a
 * loud warning while any is a placeholder, so a build with example.com links
 * can't ship by accident, and a reminder that GitHub links need a public
 * repository. Both only print: the zip is still fine for testing.
 *
 * @module build/release-checks
 */
/**
 * The warning to print while any link is a placeholder.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @returns {string | null} The warning, naming each placeholder, or null when every link is real.
 * @example
 * placeholderWarning({ help: 'https://example.com/help' });
 * // '!!!…\n!! WARNING: the About card still has placeholder links …\n!!   help: https://example.com/help\n…'
 */
export declare function placeholderWarning(links: Record<string, string>): string | null;
/**
 * The reminder to print when the links point into a repository: it has to be
 * public before the store listing goes live.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @param {string} repository - The repository's address.
 * @returns {string | null} The reminder, or null when no link is in the repository.
 */
export declare function repositoryReminder(links: Record<string, string>, repository: string): string | null;
/**
 * Print both, the warning on stderr: run last in `npm run package`, so it's
 * the thing on screen.
 *
 * @param {Record<string, string>} links - The About links by name.
 * @param {string} repository - The repository's address.
 * @returns {void}
 */
export declare function printReleaseChecks(links: Record<string, string>, repository: string): void;
