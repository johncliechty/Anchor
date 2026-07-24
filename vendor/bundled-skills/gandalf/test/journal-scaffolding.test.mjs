// Gandalf advisor — Wave 7: the journaling / anti-drift scaffolding canary.
//
// Wave 7 done-when (this file's half): "NORTH-STAR.md + journal/ + LESSONS.md scaffolding present
// (canary set = the test suite; anti-drift sleep gate documented)." This canary asserts the three
// scaffolding artifacts exist AND that the load-bearing anti-drift doctrine is actually written down
// (canary set = the test suite; the anti-drift sleep gate; PRINCIPLE-D advisory isolation).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(PROJECT, rel), 'utf8');

test('scaffolding present: NORTH-STAR.md + journal/ + LESSONS.md all exist', () => {
  assert.ok(existsSync(resolve(PROJECT, 'NORTH-STAR.md')), 'NORTH-STAR.md (the LOCKED anti-drift anchor) is present');
  assert.ok(existsSync(resolve(PROJECT, 'LESSONS.md')), 'LESSONS.md (the anti-drift ledger) is present');
  const journal = resolve(PROJECT, 'journal');
  assert.ok(existsSync(journal) && statSync(journal).isDirectory(), 'journal/ is a present directory');
  assert.ok(existsSync(resolve(journal, 'README.md')), 'journal/ carries its scaffolding README');
});

test('NORTH-STAR.md still carries the LOCKED North Star verbatim (the anti-drift anchor)', () => {
  const ns = read('NORTH-STAR.md');
  assert.match(ns, /LOCKED North Star/, 'the North Star is marked LOCKED');
  assert.match(ns, /deep-think advisor/, 'the verbatim North Star statement is present');
  assert.match(ns, /Parable-of-the-Oranges/, 'clause 3 (Oranges foresight) is present');
});

test('anti-drift sleep gate is DOCUMENTED (canary set = the test suite)', () => {
  const lessons = read('LESSONS.md');
  assert.match(lessons, /anti-drift sleep gate/i, 'the anti-drift sleep gate is documented by name');
  assert.match(lessons, /canary set\s*=\s*the test suite/i, 'the canary-set = test-suite identity is documented');
  assert.match(lessons, /node --test test\/\*\.test\.mjs/, 'the actual gate command is documented');
  assert.match(lessons, /GREEN/, 'the GREEN-before-sleep rule is documented');
  // PRINCIPLE-D advisory isolation is part of the documented doctrine.
  assert.match(lessons, /PRINCIPLE-D/, 'the PRINCIPLE-D advisory-isolation rule is documented');
});

test('journal/ scaffolding documents the per-cycle record + the never-a-gate invariant', () => {
  const j = read('journal/README.md');
  assert.match(j, /per-run journal/i, 'the journal purpose is documented');
  assert.match(j, /Sleep gate/i, 'the sleep-gate result is part of a journal entry');
  assert.match(j, /never a gate|never gating/i, 'the journal-is-a-record-not-a-gate invariant is documented');
});
