#!/usr/bin/env node
/**
 * The kit's command line, run from an extension's npm scripts:
 *
 *   extension-kit vendor <dir>   copy the browser half into <dir> (npm install runs it)
 *   extension-kit duplication    fail on copied code jscpd finds, less .jscpd-allowlist.json
 *
 * @module bin/extension-kit
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { findDisallowedClones } from '../src/build/duplication.js';
import { vendorKit } from '../src/build/vendor.js';

const [command, arg] = process.argv.slice(2);

if (command === 'vendor' && arg) {
  await vendorKit(path.resolve(arg));
  console.log(`extension-kit: copied into ${arg}`);
} else if (command === 'duplication') {
  // jscpd is the extension's devDependency, so resolve it from there.
  const { runJscpd } = createRequire(path.join(process.cwd(), 'package.json'))('jscpd');
  const clones = await findDisallowedClones({ runJscpd });
  for (const clone of clones) console.error(`Copied code (${clone.lines} lines): ${clone.where}`);
  if (clones.length) {
    console.error(`\n${clones.length} clone(s). Move the shared code into one function, or list the pair with a reason in .jscpd-allowlist.json.`);
    process.exitCode = 1;
  } else {
    console.log('No copied code.');
  }
} else {
  console.error('Usage: extension-kit vendor <dir> | extension-kit duplication');
  process.exitCode = 2;
}
