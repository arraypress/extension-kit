/**
 * A guard against copied code: run jscpd over a repository with its
 * `.jscpd.json` and fail on any clone, except the deliberate ones listed,
 * each with its reason, in `.jscpd-allowlist.json`:
 *
 *     { "allow": [{ "files": ["test/a.js", "test/b.js"], "reason": "…" }] }
 *
 * A clone is allowed when both of its files are in one entry. jscpd is the
 * caller's (a devDependency), passed in as its `runJscpd`, so this package
 * needs none.
 *
 * @module build/duplication
 */
export type Clone = {
    /**
     * First file, relative to the scan's folder.
     */
    first: string;
    /**
     * Second file (may equal `first`).
     */
    second: string;
    /**
     * How many lines it spans.
     */
    lines: number;
    /**
     * "a.js:10-20 ~ b.js:30-40", for messages.
     */
    where: string;
};
export type AllowEntry = {
    /**
     * Files whose clones of each other are allowed.
     */
    files: string[];
    /**
     * Why the copy stays.
     */
    reason: string;
};
export type RunJscpd = (args: readonly string[], options: {
    cwd: string;
    encoding: 'utf8';
}) => {
    status: number | null;
    stderr: string;
    error?: Error;
};
/**
 * One clone from jscpd's JSON report, reduced to where it is.
 *
 * @typedef {object} Clone
 * @property {string} first First file, relative to the scan's folder.
 * @property {string} second Second file (may equal `first`).
 * @property {number} lines How many lines it spans.
 * @property {string} where "a.js:10-20 ~ b.js:30-40", for messages.
 */
/**
 * One deliberate exception.
 *
 * @typedef {object} AllowEntry
 * @property {string[]} files Files whose clones of each other are allowed.
 * @property {string} reason Why the copy stays.
 */
/**
 * jscpd's `runJscpd` (from the `jscpd` package): spawns its binary.
 *
 * @typedef {(args: readonly string[], options: {cwd: string, encoding: 'utf8'}) => {status: number | null, stderr: string, error?: Error}} RunJscpd
 */
/**
 * The clones jscpd's JSON report lists.
 *
 * @param {{duplicates?: {firstFile: {name: string, start: number, end: number}, secondFile: {name: string, start: number, end: number}, lines: number}[]}} report
 *   The parsed `jscpd-report.json`.
 * @returns {Clone[]} One entry per clone.
 */
export declare function clonesFromReport(report: {
    duplicates?: {
        firstFile: {
            name: string;
            start: number;
            end: number;
        };
        secondFile: {
            name: string;
            start: number;
            end: number;
        };
        lines: number;
    }[];
}): Clone[];
/**
 * The clones no allowlist entry covers.
 *
 * @param {readonly Clone[]} clones - What jscpd found.
 * @param {readonly AllowEntry[]} allow - The deliberate exceptions.
 * @returns {Clone[]} The clones to fail on.
 * @example
 * disallowedClones(clones, [{ files: ['a.js', 'b.js'], reason: 'fixtures' }]);
 */
export declare function disallowedClones(clones: readonly Clone[], allow: readonly AllowEntry[]): Clone[];
/**
 * Run jscpd in `cwd` (it reads `.jscpd.json` there) and report clones the
 * allowlist doesn't cover.
 *
 * @param {object} options - How to run.
 * @param {RunJscpd} options.runJscpd - From the `jscpd` package.
 * @param {string} [options.cwd] - The repository. Default the current folder.
 * @returns {Promise<Clone[]>} The disallowed clones; empty means clean.
 * @throws {Error} When jscpd can't run.
 */
export declare function findDisallowedClones({ runJscpd, cwd }: {
    runJscpd: RunJscpd;
    cwd?: string;
}): Promise<Clone[]>;
