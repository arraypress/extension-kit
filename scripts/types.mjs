/**
 * The type declarations (`src/**\/*.d.ts`) are generated from the JSDoc by
 * TypeScript and checked in, so consumers get types and the two can't
 * disagree.
 *
 *   node scripts/types.mjs          write them
 *   node scripts/types.mjs --check  fail if any is missing or stale
 *
 * @module scripts/types
 */

import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const work = await mkdtemp(path.join(tmpdir(), 'extension-kit-types-'));
const out = path.join(work, 'out');

/**
 * Every `.d.ts` under `dir`, relative to it.
 *
 * @param {string} dir - The folder.
 * @returns {Promise<string[]>} Sorted relative paths.
 */
async function declarations(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.d.ts'))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

try {
  // The repo's settings, narrowed to src/ and set to emit declarations only.
  const config = path.join(work, 'tsconfig.json');
  await writeFile(config, JSON.stringify({
    extends: path.join(root, 'tsconfig.json'),
    include: [path.join(src, '**/*.js')],
    compilerOptions: {
      noEmit: false, declaration: true, emitDeclarationOnly: true, rootDir: src, outDir: out,
      typeRoots: [path.join(root, 'node_modules', '@types')],
    },
  }));
  // Writing: the old declarations may be what's wrong, so emit regardless (tsc still writes them)
  // and let the type check that follows judge. Checking: any error fails.
  const { status } = spawnSync(path.join(root, 'node_modules', '.bin', 'tsc'), ['-p', config], { stdio: 'inherit' });
  if (status !== 0 && process.argv.includes('--check')) throw new Error('tsc failed');
  const fresh = await declarations(out);
  if (process.argv.includes('--check')) {
    const stale = [];
    for (const file of new Set([...fresh, ...(await declarations(src))])) {
      const [want, have] = await Promise.all([path.join(out, file), path.join(src, file)].map((f) => readFile(f, 'utf8').catch(() => null)));
      if (want !== have) stale.push(file);
    }
    if (stale.length) {
      console.error(`Stale type declarations (run npm run types): ${stale.join(', ')}`);
      process.exitCode = 1;
    }
  } else {
    await cp(out, src, { recursive: true });
    console.log(`Wrote ${fresh.length} declarations.`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
