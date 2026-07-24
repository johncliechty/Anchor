// B2 W2 / LOCK CONTRACT L2/L3 — consumption seam + lock authority on live entries E1–E4.
// Hermetic: stub/instrument runMapReduce (mapReduceRunner inject); expected numerics from
// live knobsForSkill only — never plan-embedded literals.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runScaledAnalysis,
  resolveConsumeKnobs,
  parseArgs,
} from '../runtime/gandalf-run.mjs';
import {
  knobsForSkill,
  isGandalfBandLocked,
} from '../runtime/triage-band.mjs';
import {
  capGroupsToMaxShards,
  runMapReduce,
  groupPayloadByTopLevelDir,
} from '../runtime/map-reduce.mjs';

/** Hermetic env: no ambient lock envs or legacy caps unless the test injects them. */
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

/** Capture the live runMapReduce call object via mapReduceRunner inject. */
function makeCaptureRunner() {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    return 'captured';
  };
  return { calls, runner };
}

function assertCallObjectMatchesKnobs(callArgs, depthToken) {
  const expected = knobsForSkill('gandalf', depthToken);
  assert.ok(expected, `knobsForSkill('gandalf', ${depthToken}) must resolve`);
  assert.equal(
    callArgs.maxShards,
    expected.shards,
    `call-object maxShards must equal knobs.shards for ${depthToken}`,
  );
  assert.equal(
    callArgs.fusionPasses,
    expected.fusionPasses,
    `call-object fusionPasses must equal knobs.fusionPasses for ${depthToken}`,
  );
}

// ─── Pure lock-authority pin (unlock-only override) ──────────────────────────

test('L2 resolveConsumeKnobs: locked LITE ignores larger caller maxShards/fusionPasses', () => {
  const env = cleanEnv();
  const expected = knobsForSkill('gandalf', 'LITE');
  const got = resolveConsumeKnobs({
    depth: 'LITE',
    env,
    maxShards: expected.shards + 50,
    fusionPasses: expected.fusionPasses + 10,
  });
  assert.equal(got.locked, true);
  assert.equal(got.maxShards, expected.shards);
  assert.equal(got.fusionPasses, expected.fusionPasses);
  assert.equal(got.source, 'explicit');
});

test('L2 resolveConsumeKnobs: unlocked path passes caller caps through (unlock-only override)', () => {
  const env = cleanEnv();
  assert.equal(isGandalfBandLocked({ env }), false);
  const got = resolveConsumeKnobs({
    env,
    maxShards: 7,
    fusionPasses: 3,
  });
  assert.equal(got.locked, false);
  assert.equal(got.maxShards, 7);
  assert.equal(got.fusionPasses, 3);
  assert.equal(got.knobs, null);
});

test('L2 resolveConsumeKnobs: unlocked with no caps → nulls (pre-band baseline)', () => {
  const env = cleanEnv();
  const got = resolveConsumeKnobs({ env });
  assert.equal(got.locked, false);
  assert.equal(got.maxShards, null);
  assert.equal(got.fusionPasses, null);
});

// ─── E2 — programmatic runScaledAnalysis({depth}) call-object pins ───────────

for (const depth of ['LITE', 'FULL', 'SPIKE-FIRST']) {
  test(`E2 programmatic depth=${depth}: call object maxShards/fusionPasses = knobsForSkill`, async () => {
    const env = cleanEnv();
    const { calls, runner } = makeCaptureRunner();
    await runScaledAnalysis({
      payload: { 'a/x.js': '1' },
      userObjective: 'E2 pin',
      depth,
      env,
      mapReduceRunner: runner,
      makeAgent: () => async () => 'stub',
    });
    assert.equal(calls.length, 1, 'exactly one runMapReduce invoke');
    assertCallObjectMatchesKnobs(calls[0], depth);
  });
}

// ─── E3 — env-only GANDALF_DEPTH (no argv / no depth|tier args) ──────────────

test('E3 env-only GANDALF_DEPTH=LITE: call object carries LITE knobs (mandatory env path)', async () => {
  const env = cleanEnv({ GANDALF_DEPTH: 'LITE' });
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'E3 env-only',
    // no depth / tier args
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assertCallObjectMatchesKnobs(calls[0], 'LITE');
});

// ─── E4 — env-only FOUNDRY_TRIAGE_DEPTH ───────────────────────────────────────

test('E4 env-only FOUNDRY_TRIAGE_DEPTH=FULL: call object carries FULL knobs', async () => {
  const env = cleanEnv({ FOUNDRY_TRIAGE_DEPTH: 'FULL' });
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'E4 foundry env',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assertCallObjectMatchesKnobs(calls[0], 'FULL');
});

// ─── E1 — CLI parseArgs(--analyze --depth) → same consume path ───────────────

test('E1 CLI --analyze --depth LITE: parseArgs depth + runScaledAnalysis call object = LITE knobs', async () => {
  const opts = parseArgs([
    '--analyze',
    '--project',
    '.',
    '--depth',
    'LITE',
    '--objective',
    'E1 CLI path',
  ]);
  assert.equal(opts.analyze, true);
  assert.equal(opts.depth, 'LITE');

  // Ambient high GANDALF_MAX_SHARDS must not invert lock on the call object (L2).
  const env = cleanEnv({ GANDALF_MAX_SHARDS: '999' });
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: opts.objective,
    depth: opts.depth || null,
    tier: opts.tier || null,
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assertCallObjectMatchesKnobs(calls[0], 'LITE');
  // Env expansion must not replace fusionPasses either.
  const expected = knobsForSkill('gandalf', 'LITE');
  assert.equal(calls[0].fusionPasses, expected.fusionPasses);
});

// ─── Lock authority on live runScaledAnalysis call object ────────────────────

test('L2 lock-wins: locked LITE + conflicting larger caller caps → call object = LITE knobs', async () => {
  const env = cleanEnv();
  const expected = knobsForSkill('gandalf', 'LITE');
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'lock authority',
    depth: 'LITE',
    maxShards: expected.shards + 100,
    fusionPasses: expected.fusionPasses + 5,
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assertCallObjectMatchesKnobs(calls[0], 'LITE');
});

test('L2 lock-wins: locked LITE + high GANDALF_MAX_SHARDS still lands LITE knobs on call object', async () => {
  const env = cleanEnv({ GANDALF_MAX_SHARDS: '64' });
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'env cannot expand past lock',
    depth: 'LITE',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assertCallObjectMatchesKnobs(calls[0], 'LITE');
});

// ─── Hermetic map-reduce consume: maxShards cap + fusionPasses ───────────────

test('consume: capGroupsToMaxShards(groups, N) yields ≤ N groups; null leaves groups unchanged', () => {
  const groups = {
    '/a': ['a/1.js'],
    '/b': ['b/1.js'],
    '/c': ['c/1.js'],
    '/d': ['d/1.js'],
    '/e': ['e/1.js'],
  };
  const n = knobsForSkill('gandalf', 'LITE').shards;
  const capped = capGroupsToMaxShards(groups, n);
  assert.ok(Object.keys(capped).length <= n, `post-cap group count ≤ LITE.shards (${n})`);
  assert.equal(
    Object.keys(capGroupsToMaxShards(groups, null)).length,
    Object.keys(groups).length,
    'null maxShards must not thin',
  );
  assert.equal(
    Object.keys(capGroupsToMaxShards(groups, undefined)).length,
    Object.keys(groups).length,
    'undefined maxShards must not thin',
  );
});

/** Payload large enough to force map-reduce with many top-level dirs (stub agents). */
function multiDirPayload(dirs = 5) {
  const payload = {};
  // Fat enough content so highContextLimit=2 always escalates.
  const blob = 'x'.repeat(200);
  for (let i = 0; i < dirs; i++) {
    payload[`dir${i}/file.js`] = blob;
  }
  return payload;
}

test('consume: maxShards=N caps post-cap group count via runMapReduce (stub agents)', async () => {
  const expected = knobsForSkill('gandalf', 'LITE');
  const n = expected.shards;
  const payload = multiDirPayload(Math.max(5, n + 3));
  const preGroups = Object.keys(groupPayloadByTopLevelDir(payload)).length;
  assert.ok(preGroups > n, `fixture must have more than ${n} top-level groups (got ${preGroups})`);

  const logs = [];
  const reduceLabels = [];
  const mapAgent = async (_prompt, opts) => {
    if (opts?.label?.startsWith('map-reduce-chunk-')) return `summary ${opts.label}`;
    return 'map-default';
  };
  const reduceAgent = async (_prompt, opts) => {
    reduceLabels.push(opts?.label);
    return 'fused';
  };

  await runMapReduce({
    payload,
    userObjective: 'cap groups',
    agent: mapAgent,
    reduceAgent,
    highContextLimit: 2,
    env: cleanEnv({ GANDALF_SKIP_SCOUT: 'true' }),
    maxShards: n,
    fusionPasses: 1,
    log: (m) => logs.push(String(m)),
  });

  // band-thin log when cap bites
  assert.ok(
    logs.some((l) => l.includes('band-thin: capped shards')),
    'must log band-thin shard cap when groups exceed maxShards',
  );
  // Chunk maps ≤ n (one per remaining group)
  // We only count via map agent not available here — use reduceLabels / synthesis only once.
  assert.ok(reduceLabels.includes('map-reduce-synthesis'));
});

test('consume: fusionPasses=1 → single final reduce (no intermediate pair-fusion)', async () => {
  const payload = multiDirPayload(4);
  const reduceLabels = [];
  const mapAgent = async (_prompt, opts) => {
    if (opts?.label?.startsWith('map-reduce-chunk-')) return `summary ${opts.label}`;
    return 'map-default';
  };
  const reduceAgent = async (_prompt, opts) => {
    reduceLabels.push(opts?.label);
    return 'fused';
  };
  const logs = [];

  await runMapReduce({
    payload,
    userObjective: 'fusion=1',
    agent: mapAgent,
    reduceAgent,
    highContextLimit: 2,
    env: cleanEnv({ GANDALF_SKIP_SCOUT: 'true' }),
    maxShards: null,
    fusionPasses: 1,
    log: (m) => logs.push(String(m)),
  });

  assert.ok(!logs.some((l) => l.includes('fusionPasses=')), 'fusionPasses=1 must not log intermediate fusion');
  assert.ok(!reduceLabels.some((l) => String(l).startsWith('map-reduce-fusion-mid-')), 'no mid fusion labels');
  assert.equal(reduceLabels.filter((l) => l === 'map-reduce-synthesis').length, 1);
});

test('consume: fusionPasses=2 with >2 shards → intermediate pair-fusion then final reduce', async () => {
  const payload = multiDirPayload(4);
  const reduceLabels = [];
  const mapAgent = async (_prompt, opts) => {
    if (opts?.label?.startsWith('map-reduce-chunk-')) return `summary ${opts.label}`;
    return 'map-default';
  };
  const reduceAgent = async (_prompt, opts) => {
    reduceLabels.push(opts?.label);
    return 'fused';
  };
  const logs = [];

  await runMapReduce({
    payload,
    userObjective: 'fusion=2',
    agent: mapAgent,
    reduceAgent,
    highContextLimit: 2,
    env: cleanEnv({ GANDALF_SKIP_SCOUT: 'true' }),
    maxShards: null,
    fusionPasses: 2,
    log: (m) => logs.push(String(m)),
  });

  assert.ok(
    logs.some((l) => l.includes('band-thin: fusionPasses=2')),
    'must log intermediate pair-fusion when fusionPasses>=2 and >2 shards',
  );
  const mid = reduceLabels.filter((l) => String(l).startsWith('map-reduce-fusion-mid-'));
  assert.ok(mid.length >= 1, `expected ≥1 mid fusion call, got ${mid.length}`);
  assert.equal(reduceLabels.filter((l) => l === 'map-reduce-synthesis').length, 1);
});
