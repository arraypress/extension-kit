/**
 * Chrome's permission prompt, played in an extension page for an e2e test: Playwright can't
 * click Chrome's own prompt. From Topicless' and Better Screenshots' e2e helpers.
 *
 * @module testing/prompt
 */
/**
 * Stand in for Chrome's permission prompt in a page: each `chrome.permissions.request` is
 * recorded on `window.asked` (what was asked, and whether a click was behind it,
 * `navigator.userActivation.isActive`) and answered from `answers` (the next one; the last is
 * kept), as a person clicking “Allow” or “Deny” would. A request with no click behind it is
 * refused as Chrome refuses it (“This function must be called during a user gesture”) and takes
 * no answer. Runs in the page: give it to `page.evaluate` or `page.addInitScript`, so it takes
 * no closures.
 *
 * @param {boolean[]} answers - The answers, in order.
 * @example
 * await page.evaluate(playPermissionPrompt, [true]);
 * await page.click('#download');
 * const asked = await page.evaluate(() => window.asked); // [{ permissions: ['downloads'], origins: undefined, gesture: true }]
 */
export declare function playPermissionPrompt(answers: boolean[]): void;
