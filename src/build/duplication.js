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

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
export function clonesFromReport(report) {
  return (report.duplicates ?? []).map(({ firstFile: a, secondFile: b, lines }) => ({
    first: a.name,
    second: b.name,
    lines,
    where: `${a.name}:${a.start}-${a.end} ~ ${b.name}:${b.start}-${b.end}`,
  }));
}

/**
 * The clones no allowlist entry covers.
 *
 * @param {readonly Clone[]} clones - What jscpd found.
 * @param {readonly AllowEntry[]} allow - The deliberate exceptions.
 * @returns {Clone[]} The clones to fail on.
 * @example
 * disallowedClones(clones, [{ files: ['a.js', 'b.js'], reason: 'fixtures' }]);
 */
export function disallowedClones(clones, allow) {
  return clones.filter(({ first, second }) => !allow.some(({ files }) => files.includes(first) && files.includes(second)));
}

/**
 * Read a JSON file, or `fallback` when it doesn't exist.
 *
 * @template T
 * @param {string} file - The file.
 * @param {T} fallback - What a missing file reads as.
 * @returns {Promise<T>} The parsed JSON.
 */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return fallback;
    throw error;
  }
}

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
export async function findDisallowedClones({ runJscpd, cwd = process.cwd() }) {
  const out = await mkdtemp(path.join(tmpdir(), 'jscpd-'));
  try {
    // Absolute paths, made relative to the repository below: jscpd otherwise names each file
    // relative to the scanned folder it's in, so test/a.js and scripts/a.js would look the same.
    const run = runJscpd(['--reporters', 'json', '--output', out, '--silent', '--exit-code', '0', '--absolute'], { cwd, encoding: 'utf8' });
    if (run.error || run.status !== 0) throw run.error ?? new Error(`jscpd failed: ${run.stderr}`);
    /** @type {Parameters<typeof clonesFromReport>[0]} */
    const report = await readJson(path.join(out, 'jscpd-report.json'), {});
    for (const { firstFile, secondFile } of report.duplicates ?? []) {
      firstFile.name = path.relative(cwd, firstFile.name);
      secondFile.name = path.relative(cwd, secondFile.name);
    }
    /** @type {{allow?: AllowEntry[]}} */
    const allowlist = await readJson(path.join(cwd, '.jscpd-allowlist.json'), {});
    const allow = allowlist.allow ?? [];
    return disallowedClones(clonesFromReport(report), allow);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
