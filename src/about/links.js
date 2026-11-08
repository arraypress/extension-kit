/**
 * The links on an extension's About card ("Get help", "Report an issue",
 * "Privacy policy"), kept in the extension's GitHub repository: the README,
 * Issues and PRIVACY.md. The repository must be public before the extension
 * is published, or these links show GitHub's 404; the build helpers'
 * `repositoryReminder` says so at package time.
 *
 * @module about/links
 */

/**
 * @typedef {object} AboutLinks
 * @property {string} help "Get help with …": the README.
 * @property {string} reportIssue "Report an issue": GitHub Issues.
 * @property {string} privacyPolicy "Privacy policy": PRIVACY.md on the main branch.
 */

/**
 * The About card's links for a GitHub repository.
 *
 * @param {string} repository - The repository's address, no trailing slash.
 * @returns {Readonly<AboutLinks>} The three links.
 * @example
 * githubAboutLinks('https://github.com/arraypress/upright').reportIssue;
 * // 'https://github.com/arraypress/upright/issues'
 */
export function githubAboutLinks(repository) {
  return Object.freeze({
    help: `${repository}#readme`,
    reportIssue: `${repository}/issues`,
    privacyPolicy: `${repository}/blob/main/PRIVACY.md`,
  });
}

/**
 * Whether a link is a placeholder: its host is one reserved for examples
 * (RFC 2606), or a subdomain of one. A `mailto:` link or a real domain isn't.
 *
 * @param {string} url - An absolute URL.
 * @returns {boolean} True for example.com, example.org, example.net and their subdomains.
 * @throws {TypeError} When `url` isn't an absolute URL.
 * @example
 * isPlaceholder('https://www.example.org/help'); // true
 * isPlaceholder('https://notexample.com/');      // false
 */
export function isPlaceholder(url) {
  return /(^|\.)example\.(com|org|net)$/.test(new URL(url).hostname);
}
