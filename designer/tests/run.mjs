// tests/run.mjs — node entry. Loads lib + test files via eval into a shared scope.
// Usage: node tests/run.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const designerDir = path.dirname(here);

const LIB_FILES = [
  'lib/util.js',
  'lib/colorspace.js',
  'lib/oklab.js',
  'lib/cielab.js',
  'lib/jzazbz.js',
  'lib/conf.js',
  'lib/palette.js',
  'lib/metrics.js',
];

const TEST_FILES = [
  'tests/runner.js',
  'tests/util.test.js',
  'tests/oklab.test.js',
  'tests/cielab.test.js',
  'tests/jzazbz.test.js',
  'tests/conf.test.js',
  'tests/palette.test.js',
  'tests/metrics.test.js',
];

// Set up browser-like globals so lib files (which check `window`) attach to globalThis.
globalThis.window = globalThis;

function load(rel) {
  const src = fs.readFileSync(path.join(designerDir, rel), 'utf8');
  // indirect eval evaluates in global scope, so `var`/function declarations
  // become globals — required for runner.js to expose test/assertEq.
  (0, eval)(src);
}

for (const f of LIB_FILES) load(f);
for (const f of TEST_FILES) load(f);

const RESULTS = globalThis.RESULTS || [];
const total = RESULTS.length;
const passed = RESULTS.filter(r => r.ok).length;
const failed = RESULTS.filter(r => !r.ok);

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RESET = '\x1b[0m';

for (const r of RESULTS) {
  if (r.ok) console.log(`${GREEN}✓${RESET} ${DIM}${r.name}${RESET}`);
  else console.log(`${RED}✗ ${r.name}${RESET}\n    ${r.err}`);
}

console.log('');
if (failed.length === 0) {
  console.log(`${GREEN}${passed}/${total} passed${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}${failed.length}/${total} FAILED${RESET}  (${passed} passed)`);
  process.exit(1);
}
