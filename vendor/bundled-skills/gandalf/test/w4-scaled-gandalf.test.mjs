// W4 (2026-07-05) — Scaled-Gandalf wiring + phantom-model purge, DETERMINISTIC (stub agent, no live agy).
//
// Asserts the three W4 done-whens:
//   (a) NO `gemini-1.5` / API-style phantom id (`gemini-<digit>...`) survives as a live model selection
//       in any repaired source file — model ids must be agy LABELS via the TRIO_TIER ladder.
//   (b) a SMALL target takes the single-frontier-pass branch: ONE call on the HEAVY reduce agent,
//       NO scout, NO shard, and the map (STANDARD) agent is never called.
//   (c) a LARGE target invokes scout→map→reduce from the CLI entry (runScaledAnalysis) with a stubbed
//       pipeline agent — the bulk map/scout passes REQUEST the STANDARD label, the reduce/synthesis
//       pass REQUESTs the HEAVY label.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runScaledAnalysis, resolveScaledModels } from '../runtime/gandalf-run.mjs';
import { GEMINI_HEAVY_MODEL, GEMINI_STANDARD_MODEL } from 'fil<path>';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');

/** A stub agent FACTORY: each built agent is tagged with the model + role it was constructed for and
 *  records every (label, prompt) it is called with. Returns a plain-string report so the scout pass
 *  JSON-parse-fails → null → full-payload fallback (identical to the existing map-reduce test stub). */
function makeStubFactory() {
  const built = [];
  const makeAgent = (model, role) => {
    const calls = [];
    const fn = async (_prompt, opts) => {
      calls.push({ label: opts?.label });
      return `[${role}] report`;
    };
    fn.model = model;
    fn.role = role;
    fn.calls = calls;
    built.push(fn);
    return fn;
  };
  return { built, makeAgent };
}

test('W4(a): no gemini-1.5 / API-style phantom id remains as a live model selection', () => {
  const files = [
    'runtime/context-sizer.mjs',
    'runtime/scout.mjs',
    'runtime/map-reduce.mjs',
    'runtime/gandalf-run.mjs',
    'run-crucible.mjs',
    'generate-doc-trio.mjs',
  ];
  // `gemini-<digit>` catches every API-style id (gemini-1.5-pro, gemini-1.5-flash, gemini-3.1-pro, …)
  // WITHOUT matching the valid agy LABELS ("Gemini 3.1 Pro (High)" — space, not hyphen-digit), the
  // env var names (GEMINI_MODEL — underscore), or the driver import path (gemini-cli — hyphen-letter).
  const phantom = /gemini-\d/i;
  for (const rel of files) {
    const content = readFileSync(resolve(PROJECT, rel), 'utf8');
    assert.ok(!phantom.test(content), `${rel} must not contain a phantom API-style gemini-<digit> id`);
  }
});

test('W4: resolveScaledModels picks STANDARD for map and HEAVY for reduce when review/coding are Gemini', () => {
  // Pin families so the test does not depend on live ~/.anchor/model_prefs.json.
  const env = { CODING_FAMILY: 'gemini', REVIEW_FAMILY: 'gemini', USERPROFILE: '', HOME: '' };
  const { mapModel, reduceModel, mapDriver, reduceDriver } = resolveScaledModels(env);
  assert.equal(mapDriver, 'gemini-cli');
  assert.equal(reduceDriver, 'gemini-cli');
  assert.equal(mapModel, GEMINI_STANDARD_MODEL, 'bulk map/shard reads → the current STANDARD label');
  assert.equal(reduceModel, GEMINI_HEAVY_MODEL, 'reduce/synthesis → the frontier HEAVY label');
});

test('W4: resolveScaledModels follows Anchor-style grok prefs to grok-cli (no Gemini labels)', () => {
  const env = { CODING_FAMILY: 'grok', REVIEW_FAMILY: 'grok', USERPROFILE: '', HOME: '' };
  const { mapModel, reduceModel, mapDriver, reduceDriver } = resolveScaledModels(env);
  assert.equal(mapDriver, 'grok-cli');
  assert.equal(reduceDriver, 'grok-cli');
  assert.equal(mapModel, null);
  assert.equal(reduceModel, null);
});

test('W4(b): a SMALL target takes the single-frontier-pass branch (no scout, no shard)', async () => {
  const { built, makeAgent } = makeStubFactory();
  const payload = { 'src/helper.js': 'console.log("hi");' };

  const result = await runScaledAnalysis({
    payload,
    userObjective: 'Review helper.js',
    makeAgent,
    env: { CODING_FAMILY: 'gemini', REVIEW_FAMILY: 'gemini', USERPROFILE: '', HOME: '' },
    highContextLimit: 100, // payload ~a few tokens — well within limit → direct
  });

  const mapAgent = built.find((a) => a.role === 'map');
  const reduceAgent = built.find((a) => a.role === 'reduce');

  // Clever routing: map agent is STANDARD, reduce agent is HEAVY.
  assert.equal(mapAgent.model, GEMINI_STANDARD_MODEL);
  assert.equal(reduceAgent.model, GEMINI_HEAVY_MODEL);

  // A single frontier pass runs on the HEAVY reduce agent; the STANDARD map agent is never called.
  assert.equal(reduceAgent.calls.length, 1, 'exactly one frontier pass');
  assert.equal(reduceAgent.calls[0].label, 'map-reduce-direct');
  assert.equal(mapAgent.calls.length, 0, 'no bulk map work for a small target');

  // No scout and no shard anywhere.
  const allLabels = built.flatMap((a) => a.calls.map((c) => c.label));
  assert.ok(!allLabels.includes('scout-pass'), 'no scout ceremony for a small target');
  assert.ok(!allLabels.some((l) => String(l).startsWith('map-reduce-chunk-')), 'no sharding for a small target');

  assert.equal(result, '[reduce] report');
});

test('W4(c): a LARGE target invokes scout→map→reduce; map requests STANDARD, reduce requests HEAVY', async () => {
  const { built, makeAgent } = makeStubFactory();
  const payload = {
    'backend/server.js': 'app.listen(3000);',
    'frontend/index.js': 'ReactDOM.render();',
    'package.json': '{}',
  };

  const result = await runScaledAnalysis({
    payload,
    userObjective: 'Check for performance issues',
    makeAgent,
    env: { CODING_FAMILY: 'gemini', REVIEW_FAMILY: 'gemini', USERPROFILE: '', HOME: '' },
    highContextLimit: 2, // force escalation past the single-pass tier
    concurrencyLimit: 2,
  });

  const mapAgent = built.find((a) => a.role === 'map');
  const reduceAgent = built.find((a) => a.role === 'reduce');

  // Clever routing choice, verified per pass.
  assert.equal(mapAgent.model, GEMINI_STANDARD_MODEL, 'bulk map/scout reads request the STANDARD label');
  assert.equal(reduceAgent.model, GEMINI_HEAVY_MODEL, 'reduce/synthesis requests the HEAVY label');

  // The STANDARD map agent did the scout + every chunk map.
  const mapLabels = mapAgent.calls.map((c) => c.label);
  assert.ok(mapLabels.includes('scout-pass'), 'scout runs first, on the STANDARD map agent');
  const chunkLabels = mapLabels.filter((l) => String(l).startsWith('map-reduce-chunk-')).sort();
  assert.deepEqual(chunkLabels, [
    'map-reduce-chunk-/',
    'map-reduce-chunk-/backend',
    'map-reduce-chunk-/frontend',
  ]);

  // The HEAVY reduce agent did ONLY the synthesis — never bulk map/scout work.
  const reduceLabels = reduceAgent.calls.map((c) => c.label);
  assert.deepEqual(reduceLabels, ['map-reduce-synthesis']);
  assert.ok(!reduceLabels.includes('scout-pass'));
  assert.ok(!reduceLabels.some((l) => String(l).startsWith('map-reduce-chunk-')));

  assert.equal(result, '[reduce] report');
});
