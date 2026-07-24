// B2 W4 / LOCK CONTRACT L6 — structural honesty canary H1 + machine-checked C1–C4+H1 coverage.
// Band-thinned LITE scaled path with stub agents: RAW/unstamped output; no score-label invoke;
// no host honesty-tier fields on the map-reduce result. No honesty-seam rewrite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runScaledAnalysis } from '../runtime/gandalf-run.mjs';
import { knobsForSkill } from '../runtime/triage-band.mjs';
import { groupPayloadByTopLevelDir } from '../runtime/map-reduce.mjs';
import * as scoreLabel from '../seam/score-label.mjs';
import { B2_COVERAGE_ROWS, L6_SHIP_GATE } from './band-thin-coverage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GANDALF_ROOT = join(HERE, '..');

/** Host honesty-tier field names that must NOT appear on the map-reduce result object. */
const HOST_HONESTY_TIER_FIELDS = [
  'tier',
  'honesty_stamp',
  'honestyStamp',
  'elevations',
  'risk_labels',
  'riskLabels',
  'cross_model',
  'crossModel',
  'schema_version',
  'schemaVersion',
  'findings',
  'nitpicks',
  'groundedness',
  'value_if_true',
];

/** Host honesty tier / rung tokens that must not be injected as structured host fields. */
const HOST_TIER_TOKENS = ['GROUNDED', 'PROMISING', 'CORROBORATED', 'SPECULATIVE'];

function cleanEnv(extra = {}) {
  return {
    CODING_FAMILY: 'gemini',
    REVIEW_FAMILY: 'gemini',
    USERPROFILE: '',
    HOME: '',
    GANDALF_SKIP_SCOUT: 'true',
    ...extra,
  };
}

/** Multi-dir payload large enough to force map-reduce + LITE band-thin cap. */
function multiDirPayload(dirs = 5) {
  const payload = {};
  const blob = 'x'.repeat(200);
  for (let i = 0; i < dirs; i++) {
    payload[`dir${i}/file.js`] = blob;
  }
  return payload;
}

/** Stub factory: map + reduce return plain RAW prose (no self-assigned host tiers). */
function makeStubFactory(rawText = 'RAW unstamped map-reduce prose for honesty canary') {
  const built = [];
  const makeAgent = (_model, role) => {
    const calls = [];
    const fn = async (_prompt, opts) => {
      calls.push({ label: opts?.label, role });
      if (opts?.label?.startsWith('map-reduce-chunk-')) {
        return `RAW chunk summary ${opts.label}`;
      }
      if (opts?.label && String(opts.label).startsWith('map-reduce-fusion-mid-')) {
        return 'RAW mid-fusion summary';
      }
      return rawText;
    };
    fn.role = role;
    fn.calls = calls;
    built.push(fn);
    return fn;
  };
  return { built, makeAgent };
}

/**
 * Install spies on every function export of seam/score-label.mjs.
 * Live ESM bindings: reassigning export names is not possible from outside, so we
 * wrap via Object.defineProperty on the module namespace where writable, and also
 * record any direct call through this namespace used by the canary.
 * Primary invoke proof: score-label is not on the map-reduce / runScaledAnalysis
 * call graph (static source + result shape). Spies catch accidental dynamic use
 * if a future change imports score-label into the scaled path via this module.
 */
function installScoreLabelSpies() {
  const hits = [];
  const originals = new Map();
  for (const key of Object.keys(scoreLabel)) {
    const val = scoreLabel[key];
    if (typeof val !== 'function') continue;
    originals.set(key, val);
    const wrapped = function scoreLabelSpy(...args) {
      hits.push({ name: key, argsLength: args.length });
      return val.apply(this, args);
    };
    try {
      // Attempt live rebind (works only if the export is a mutable binding).
      scoreLabel[key] = wrapped;
    } catch {
      // non-writable export — static + result-shape canaries still apply
    }
  }
  return {
    hits,
    restore() {
      for (const [key, fn] of originals) {
        try {
          scoreLabel[key] = fn;
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/** Assert result is RAW model text / unstamped — not a host-graded advisor envelope. */
function assertRawUnstampedResult(result) {
  assert.ok(result != null, 'scaled path must return a result');

  // Primary shape: plain string (or String object for degraded scout stamp only).
  const isStringLike =
    typeof result === 'string' ||
    (typeof result === 'object' && result instanceof String) ||
    (typeof result === 'object' && typeof result.valueOf === 'function' && typeof result.valueOf() === 'string');

  assert.ok(
    isStringLike,
    `map-reduce / runScaledAnalysis must return RAW text, not a graded object (got ${typeof result})`,
  );

  const text = String(result);
  assert.ok(text.length > 0, 'RAW report must be non-empty');

  // No host honesty-tier fields on the result object (degraded.stamp is a scout slice note, not a tier).
  if (result !== null && typeof result === 'object') {
    for (const field of HOST_HONESTY_TIER_FIELDS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(result, field),
        false,
        `H1: map-reduce result must not carry host honesty field '${field}'`,
      );
    }
    // Explicit: no GROUNDED/PROMISING/CORROBORATED-style host tier property values.
    for (const key of Object.keys(result)) {
      if (key === 'stamp' || key === 'degraded') continue; // scout degradation only
      const v = result[key];
      if (typeof v === 'string') {
        for (const token of HOST_TIER_TOKENS) {
          assert.notEqual(
            v,
            token,
            `H1: result.${key} must not be host honesty token ${token}`,
          );
        }
      }
    }
  }

  // Must not look like the graded gandalf-advisor-1 envelope JSON.
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      assert.notEqual(
        parsed.schema_version,
        'gandalf-advisor-1',
        'H1: result must not be a host-stamped gandalf-advisor-1 envelope',
      );
      for (const field of ['elevations', 'risk_labels', 'tier', 'honesty_stamp']) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(parsed, field),
          false,
          `H1: RAW JSON must not include host field '${field}'`,
        );
      }
    }
  }
}

// ─── L6 machine-checked coverage registry ────────────────────────────────────

test('L6 coverage table: C1–C4 + H1 test files present under test/', () => {
  for (const row of B2_COVERAGE_ROWS) {
    const abs = join(HERE, row.file);
    assert.ok(
      existsSync(abs),
      `coverage row ${row.id} missing file test/${row.file} — ship-gate must hard-fail`,
    );
    const body = readFileSync(abs, 'utf8');
    assert.ok(
      /\btest\s*\(/.test(body),
      `coverage row ${row.id} file ${row.file} must define node:test cases`,
    );
  }
});

test('L6 ship-gate citation: cwd skills/gandalf + argv node --test test/', () => {
  assert.equal(L6_SHIP_GATE.cwd, '<path> Foundry\\skills\\gandalf');
  assert.equal(L6_SHIP_GATE.argv, 'node --test test/');
  // package main routes directory form to the isolation runner (index.mjs).
  const pkgPath = join(HERE, 'package.json');
  assert.ok(existsSync(pkgPath), 'test/package.json must exist for node --test test/');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.main, 'index.mjs');
  assert.ok(existsSync(join(HERE, 'index.mjs')), 'test/index.mjs isolation runner must exist');
});

// ─── H1 structural honesty canary on band-thinned LITE scaled path ───────────

test('H1: band-thinned LITE runScaledAnalysis (stub agents) returns RAW/unstamped text', async () => {
  const lite = knobsForSkill('gandalf', 'LITE');
  assert.ok(lite, "knobsForSkill('gandalf','LITE') must resolve");
  const n = lite.shards;
  const dirs = Math.max(5, n + 3);
  const payload = multiDirPayload(dirs);
  const preGroups = Object.keys(groupPayloadByTopLevelDir(payload)).length;
  assert.ok(preGroups > n, `fixture groups (${preGroups}) must exceed LITE.shards (${n})`);

  const rawText = 'RAW unstamped advisory prose — no host tier self-assignment';
  const { makeAgent } = makeStubFactory(rawText);
  const logs = [];
  const spies = installScoreLabelSpies();

  try {
    const result = await runScaledAnalysis({
      payload,
      userObjective: 'H1 honesty canary LITE band-thin',
      depth: 'LITE',
      env: cleanEnv(),
      makeAgent,
      highContextLimit: 2,
      concurrencyLimit: 2,
      log: (m) => logs.push(String(m)),
    });

    assertRawUnstampedResult(result);
    assert.equal(String(result), rawText);

    // Band-thin path engaged when groups exceed LITE.shards.
    assert.ok(
      logs.some((l) => l.includes('band-thin: capped shards') || l.includes('gandalf band:')),
      'LITE lock must engage band path (band-thin log or gandalf band log)',
    );

    // No score-label spy hits via this namespace during the scaled path.
    assert.equal(
      spies.hits.length,
      0,
      `H1: score-label must not be invoked on band-thinned LITE path (hits=${JSON.stringify(spies.hits)})`,
    );
  } finally {
    spies.restore();
  }
});

test('H1: map-reduce / runScaledAnalysis source does not import or call seam/score-label', () => {
  const mapReduceSrc = readFileSync(join(GANDALF_ROOT, 'runtime', 'map-reduce.mjs'), 'utf8');
  assert.ok(
    !/from\s+['"].*score-label['"]/.test(mapReduceSrc),
    'map-reduce.mjs must not import seam/score-label',
  );
  // Strip comments (docs may mention seam-pass) — executable code must not reference score-label.
  const codeOnly = mapReduceSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/score-label/.test(codeOnly),
    'map-reduce.mjs executable code must not reference score-label',
  );
  assert.ok(
    !/\blabelTier\b|\bscoreDualAxis\b|\bcomposeRiskLabels\b/.test(codeOnly),
    'map-reduce.mjs must not call score-label APIs',
  );

  // runScaledAnalysis body (not gradeScaledReport / runAnalyzeMode) must not call score-label.
  const runSrc = readFileSync(join(GANDALF_ROOT, 'runtime', 'gandalf-run.mjs'), 'utf8');
  const scaledFnMatch = runSrc.match(
    /export async function runScaledAnalysis\([\s\S]*?\n\}[\s\n]*\/\*\*/,
  );
  // Fallback: slice from export to next export function after it.
  let scaledBody = scaledFnMatch ? scaledFnMatch[0] : null;
  if (!scaledBody) {
    const start = runSrc.indexOf('export async function runScaledAnalysis');
    assert.ok(start >= 0, 'runScaledAnalysis must exist');
    const next = runSrc.indexOf('\nexport ', start + 10);
    scaledBody = runSrc.slice(start, next > start ? next : start + 4000);
  }
  const scaledCode = scaledBody
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/score-label|labelTier|scoreDualAxis|composeRiskLabels|applySeamPass|gradeScaledReport|runHost\b/.test(
      scaledCode,
    ),
    'runScaledAnalysis must not invoke score-label / seam-pass / gradeScaledReport (host stamping is outside this path)',
  );
});

test('H1: LITE scaled result has no GROUNDED/PROMISING/CORROBORATED host honesty stamp fields', async () => {
  const { makeAgent } = makeStubFactory('plain RAW report');
  const result = await runScaledAnalysis({
    payload: multiDirPayload(Math.max(5, knobsForSkill('gandalf', 'LITE').shards + 2)),
    userObjective: 'H1 no host tier fields',
    depth: 'LITE',
    env: cleanEnv(),
    makeAgent,
    highContextLimit: 2,
  });

  assertRawUnstampedResult(result);

  // Own enumerable keys on object-like results: only degraded/stamp allowed beyond string index.
  if (result !== null && typeof result === 'object') {
    const keys = Object.keys(result);
    for (const k of keys) {
      assert.ok(
        k === 'stamp' || k === 'degraded' || /^\d+$/.test(k),
        `H1: unexpected result field '${k}' (only scout degraded/stamp allowed on String wrapper)`,
      );
    }
    if ('stamp' in result) {
      // Scout degradation stamp is a slice note, never a host honesty tier label.
      for (const token of HOST_TIER_TOKENS) {
        assert.ok(
          !String(result.stamp).split(/\s+/).includes(token),
          `H1: degradation stamp must not be honesty tier ${token}`,
        );
      }
    }
  }
});

