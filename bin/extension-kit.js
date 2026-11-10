#!/usr/bin/env node
/**
 * The kit's command line, run from an extension's npm scripts:
 *
 *   extension-kit vendor <dir>                      copy the kit's browser half into <dir> (postinstall)
 *   extension-kit vendor <dir> <package> <path>...  copy files of an installed package into <dir>
 *                                                   (a path ending in / copies its contents)
 *   extension-kit vendor-check [dir]                fail when a copy in [dir] (default extension/vendor)
 *                                                   no longer matches the installed package
 *   extension-kit icons [dir]                       render [dir]/icon.svg (default extension/icons)
 *   extension-kit toolbar-icons [dir]               render the toolbar glyph (default extension/icons/toolbar)
 *   extension-kit duplication                       fail on copied code jscpd finds, less .jscpd-allowlist.json
 *
 * Playwright and jscpd are the extension's devDependencies, so they're resolved from there.
 *
 * @module bin/extension-kit
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { findDisallowedClones } from '../src/build/duplication.js';
import { renderIcons, renderToolbarIcons } from '../src/build/toolbar-icons.js';
import { checkVendored, vendorKit, vendorPackage } from '../src/build/vendor.js';

const USAGE = `Usage:
  extension-kit vendor <dir> [<package> <path>...]
  extension-kit vendor-check [dir]
  extension-kit icons [dir]
  extension-kit toolbar-icons [dir]
  extension-kit duplication`;

const [command, ...args] = process.argv.slice(2);
/** The extension's own `require`, for its devDependencies. */
const extensionRequire = createRequire(path.join(process.cwd(), 'package.json'));

if (command === 'vendor' && args.length === 1) {
  await vendorKit(path.resolve(args[0]));
  console.log(`extension-kit: copied into ${args[0]}`);
} else if (command === 'vendor' && args.length >= 3) {
  const [dir, name, ...files] = args;
  await vendorPackage(name, files, path.resolve(dir));
  console.log(`extension-kit: copied ${name} into ${dir}`);
} else if (command === 'vendor-check' && args.length <= 1) {
  const dir = args[0] ?? 'extension/vendor';
  const stale = await checkVendored(dir);
  for (const line of stale) console.error(line);
  if (stale.length) {
    console.error('\nThe vendored copies are out of date: run `npm run postinstall` (installing a package doesn\'t rerun it).');
    process.exitCode = 1;
  } else {
    console.log(`${dir} matches the installed packages.`);
  }
} else if ((command === 'icons' || command === 'toolbar-icons') && args.length <= 1) {
  const { chromium } = /** @type {typeof import('playwright')} */ (extensionRequire('playwright'));
  const render = command === 'icons' ? renderIcons : renderToolbarIcons;
  const dir = args[0] ?? (command === 'icons' ? 'extension/icons' : 'extension/icons/toolbar');
  for (const file of await render({ chromium, dir })) console.log(`wrote ${file}`);
} else if (command === 'duplication') {
  const { runJscpd } = extensionRequire('jscpd');
  const clones = await findDisallowedClones({ runJscpd });
  for (const clone of clones) console.error(`Copied code (${clone.lines} lines): ${clone.where}`);
  if (clones.length) {
    console.error(`\n${clones.length} clone(s). Move the shared code into one function, or list the pair with a reason in .jscpd-allowlist.json.`);
    process.exitCode = 1;
  } else {
    console.log('No copied code.');
  }
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
