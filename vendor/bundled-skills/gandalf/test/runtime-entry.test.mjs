// Gandalf runtime host — Wave 2 canary: the thin runtime ENTRY CLI.
//
// Asserts the Wave-2 done-when (planning/runtime-host/IMPLEMENTATION-PLAN.md): spawn
// `node runtime/gandalf-run.mjs` as a CHILD PROCESS over a fixture via BOTH --input and stdin; assert
// the written output re-loads + assertIncrement1Conformant passes; stdin === --input output is
// byte-identical; malformed input → non-zero exit + an honest stderr reason + NO output file; and the
// RAW-DRAFT-CONTRACT.md exists and names every per-item field the seam pass consumes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import { assertIncrement1Conformant } from './harness.mjs';
import { rawDraftFull } from './runtime-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const CLI = resolve(PROJECT, 'runtime', 'gandalf-run.mjs');

/** Spawn the CLI with the given argv + optional stdin. Returns { status, stdout, stderr }. */
function runCli(args, stdin = undefined) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: stdin,
    encoding: 'utf8',
    cwd: PROJECT,
  });
}

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gandalf-run-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI --input <file> --output <file>: exit 0 and the output re-loads conformant', () => {
  withTmp((dir) => {
    const inPath = join(dir, 'draft.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(inPath, JSON.stringify(rawDraftFull()), 'utf8');

    const r = runCli(['--input', inPath, '--output', outPath]);
    assert.equal(r.status, 0, `exit 0; stderr was: ${r.stderr}`);
    assert.ok(existsSync(outPath), 'the output file was written');

    const out = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the written output passes the canary set');
    assert.equal(out.schema_version, 'gandalf-advisor-1');
  });
});

test('CLI stdin → stdout: byte-identical to the --input → --output path for the same fixture', () => {
  withTmp((dir) => {
    const inPath = join(dir, 'draft.json');
    const outPath = join(dir, 'out.json');
    const draft = JSON.stringify(rawDraftFull());
    writeFileSync(inPath, draft, 'utf8');

    const fileRun = runCli(['--input', inPath, '--output', outPath]);
    assert.equal(fileRun.status, 0, `--input path exit 0; stderr: ${fileRun.stderr}`);
    const fileOut = readFileSync(outPath, 'utf8');

    const stdinRun = runCli([], draft);
    assert.equal(stdinRun.status, 0, `stdin path exit 0; stderr: ${stdinRun.stderr}`);

    assert.equal(stdinRun.stdout, fileOut, 'stdin→stdout is byte-identical to --input→--output');
    // and the stdin output itself re-loads conformant
    assert.doesNotThrow(() => assertIncrement1Conformant(JSON.parse(stdinRun.stdout)));
  });
});

test('CLI malformed input (bad JSON) → non-zero exit + honest stderr + NO output file', () => {
  withTmp((dir) => {
    const outPath = join(dir, 'should-not-exist.json');
    const r = runCli(['--output', outPath], '{ this is not json');
    assert.notEqual(r.status, 0, 'malformed input must exit non-zero');
    assert.match(r.stderr, /malformed raw draft|not valid JSON/i, 'an honest reason is on stderr');
    assert.match(r.stderr, /no output written/i, 'stderr states nothing was written');
    assert.ok(!existsSync(outPath), 'NO output file was written on malformed input');
  });
});

test('CLI structurally-malformed draft (missing reasoning) → non-zero exit + no output file', () => {
  withTmp((dir) => {
    const outPath = join(dir, 'nope.json');
    // Missing `reasoning` is a genuine malformation (still fatal). NOTE: a missing item ARRAY is no
    // longer fatal — it is coerced to [] (lenient input); see runtime-robustness.test.mjs.
    const bad = JSON.stringify({ verdict: 'v', findings: [], nitpicks: [], elevations: [] });
    const r = runCli(['--output', outPath], bad);
    assert.notEqual(r.status, 0, 'a structurally-malformed draft must exit non-zero');
    assert.ok(!existsSync(outPath), 'no output file on a structurally-malformed draft');
  });
});

test('CLI unknown flag → non-zero exit (usage), no crash', () => {
  const r = runCli(['--frobnicate']);
  assert.notEqual(r.status, 0, 'an unknown flag exits non-zero');
  assert.match(r.stderr, /unknown argument/i);
});

test('RAW-DRAFT-CONTRACT.md exists and names every per-item field the seam pass consumes', () => {
  const contractPath = resolve(PROJECT, 'runtime', 'RAW-DRAFT-CONTRACT.md');
  assert.ok(existsSync(contractPath), 'runtime/RAW-DRAFT-CONTRACT.md is present');
  const md = readFileSync(contractPath, 'utf8');
  // top-level raw-draft fields
  for (const f of ['reasoning', 'verdict', 'findings', 'nitpicks', 'elevations']) {
    assert.match(md, new RegExp(`\\b${f}\\b`), `the contract names the top-level field '${f}'`);
  }
  // per-kind / per-item fields the seams read
  for (const f of [
    'diagnose', 'situate', 'anticipate',
    'future_state_condition', 'enabling_assumption',
    'abstraction', 'commission', 'structure_map', 'outside_view_base_rate',
    'value_if_true', 'what_would_refute_it', 'rung',
  ]) {
    assert.match(md, new RegExp(f.replace(/[_]/g, '[_]')), `the contract names the per-item field '${f}'`);
  }
  // the load-bearing instruction: the model does NOT self-assign tiers/stamps
  assert.match(md, /do\s*NOT\s*(self-assign|narrate)/i, 'the contract states the model does NOT self-assign tiers/stamps');
});
