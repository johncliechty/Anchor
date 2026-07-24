// Suite entry point for `node --test test/`.
//
// Node v26 no longer expands a directory argument to `--test` into the test files inside it;
// it spawns the path as a single test entry (`node test/`), which resolves here via
// test/package.json's "main". This entry restores the pre-v26 behavior exactly: enumerate
// every *.test.mjs under test/ (recursively — mapreduce/ included) and run each in its own
// child process via node:test's programmatic runner, so per-file process isolation — the
// semantics every suite here was written and previously gated green under — is preserved.
//
// This file is runner plumbing only. It defines no tests, filters nothing, and skips nothing:
// a failure in any test file fails this entry, which fails the gate.

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

// We are ourselves a test-runner child; the inherited runner context must not leak into the
// inner run(), which manages its own for the processes it spawns.
delete process.env.NODE_TEST_CONTEXT;

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTestFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(full);
  }
  return files.sort();
}

const files = collectTestFiles(testDir);
if (files.length === 0) {
  console.error('test/index.mjs: no *.test.mjs files found — refusing a vacuous green');
  process.exit(1);
}

run({ files, concurrency: true })
  .on('test:fail', () => { process.exitCode = 1; })
  .compose(spec)
  .pipe(process.stdout);
