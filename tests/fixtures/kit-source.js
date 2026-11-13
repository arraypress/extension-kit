/**
 * The kit's own source served to a test page, so a page in Playwright's Chromium imports the
 * real modules (`/src/index.js`) and links the real stylesheet.
 *
 * @module tests/fixtures/kit-source
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * A file under `src/` for a request's path, for `serve`'s routes.
 *
 * @param {string} pathname - The path asked for: `/src/index.js`.
 * @returns {Promise<{body: Buffer, type: string} | undefined>} The file as JavaScript or CSS; undefined (a 404) for a path outside `src/` or a file that isn't there.
 * @example
 * site = await serve(async (pathname) => (pathname === '/' ? PAGE : kitSource(pathname)));
 */
export async function kitSource(pathname) {
  const file = path.join(SRC, path.normalize(pathname.replace(/^\/src\//, '')));
  if (!file.startsWith(SRC)) return undefined;
  const body = await readFile(file).catch(() => undefined);
  if (!body) return undefined;
  return { body, type: file.endsWith('.css') ? 'text/css' : 'text/javascript' };
}
