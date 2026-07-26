// P2 2026-07-25 — --attest-wave-proven (F-AT-1: journals 0043/0044/0045, 0074) +
// gateScopePaths (0035 monorepo inventory scoping). Hermetic temp projects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { attestWaveProven } from '../bin/project-engine.mjs';
import { gateScopePaths } from '../bin/wave-engine.mjs';
import { newCheckpoint, writeCheckpointAtomic } from '../bin/foreman-lib.mjs';

function project({ halted = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-attest-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.foreman'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'calc.js'), 'export const add = (a, b) => a + b;\n');
  fs.writeFileSync(path.join(dir, 'test', 'base.test.mjs'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" +
    "import { add } from '../src/calc.js';\ntest('add', () => { assert.equal(add(1, 2), 3); });\n");
  const cp = newCheckpoint({ plan_path: 'PLAN.md', total_waves: 1, reviewer_count: 1 });
  cp.current_wave = 1;
  cp.status = halted ? 'halted' : 'running';
  cp.last_verdict = 'HALT';
  cp.pending_action = 'vacuous-GREEN HALT: doc-only second pass';
  writeCheckpointAtomic(path.join(dir, 'foreman-checkpoint.json'), cp);
  return dir;
}
const cleanup = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } };

test('attest: green gate + live ledger files ⇒ GO by attestation; checkpoint advances; record written', async () => {
  const dir = project();
  try {
    fs.writeFileSync(path.join(dir, '.foreman', 'wave-1-proven.json'),
      JSON.stringify({ files: ['src/calc.js'] }, null, 2));
    const r = await attestWaveProven(path.join(dir, 'foreman-checkpoint.json'), {
      projectDir: dir, testCommand: 'node --test', log: () => {},
    });
    assert.equal(r.attested, true, r.reason);
    assert.equal(r.terminal, true);
    const rec = JSON.parse(fs.readFileSync(path.join(dir, '.foreman', 'wave-1-attested.json'), 'utf8'));
    assert.match(rec.attested_by, /human-operator/);
    assert.ok(rec.gate.pass >= 1, 'the gate genuinely re-ran GREEN at attest time');
    const cp = JSON.parse(fs.readFileSync(path.join(dir, 'foreman-checkpoint.json'), 'utf8'));
    assert.equal(cp.status, 'done');
    assert.equal(cp.last_verdict, 'GO');
  } finally { cleanup(dir); }
});

test('attest REFUSES: no proven ledger; missing ledger file; RED gate — attest never overrides the gate', async () => {
  // No ledger.
  let dir = project();
  try {
    const r = await attestWaveProven(path.join(dir, 'foreman-checkpoint.json'), {
      projectDir: dir, testCommand: 'node --test', log: () => {} });
    assert.equal(r.attested, false);
    assert.match(r.reason, /no proven ledger/);
  } finally { cleanup(dir); }
  // Ledger names a ghost file.
  dir = project();
  try {
    fs.writeFileSync(path.join(dir, '.foreman', 'wave-1-proven.json'), JSON.stringify({ files: ['src/ghost.js'] }));
    const r = await attestWaveProven(path.join(dir, 'foreman-checkpoint.json'), {
      projectDir: dir, testCommand: 'node --test', log: () => {} });
    assert.equal(r.attested, false);
    assert.match(r.reason, /missing on disk/);
  } finally { cleanup(dir); }
  // RED gate.
  dir = project();
  try {
    fs.writeFileSync(path.join(dir, '.foreman', 'wave-1-proven.json'), JSON.stringify({ files: ['src/calc.js'] }));
    fs.writeFileSync(path.join(dir, 'test', 'base.test.mjs'),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fail', () => { assert.equal(1, 2); });\n");
    const r = await attestWaveProven(path.join(dir, 'foreman-checkpoint.json'), {
      projectDir: dir, testCommand: 'node --test', log: () => {} });
    assert.equal(r.attested, false);
    assert.match(r.reason, /not GREEN/);
  } finally { cleanup(dir); }
});

test('gateScopePaths extracts existing file/dir tokens from a scoped gate command; inert otherwise', () => {
  const dir = project();
  try {
    assert.deepEqual(gateScopePaths('node --test test/base.test.mjs', dir), ['test/base.test.mjs']);
    assert.deepEqual(gateScopePaths('python -m pytest test -v', dir), ['test']);
    assert.deepEqual(gateScopePaths('node --test test/nope.test.mjs', dir), [], 'non-existent tokens derive no scope');
    assert.deepEqual(gateScopePaths('npm test', dir), [], 'no path tokens ⇒ full inventory');
  } finally { cleanup(dir); }
});
