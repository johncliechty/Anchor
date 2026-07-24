// B2 W3 / LOCK CONTRACT L4 — exclusive unlock + GANDALF_MAX_SHARDS × depth matrix.
// Unlocked paths never silently thin via band knobs; MAX_SHARDS is never a triage lock.

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
  isGandalfBandUnlocked,
  assertGandalfSeatsFloor,
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

function makeCaptureRunner() {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    return 'captured';
  };
  return { calls, runner };
}

function multiDirPayload(dirs = 5) {
  const payload = {};
  const blob = 'x'.repeat(200);
  for (let i = 0; i < dirs; i++) {
    payload[`dir${i}/file.js`] = blob;
  }
  return payload;
}

// ─── Exclusive unlock predicate ──────────────────────────────────────────────

test('L4 exclusive unlock: no depth/tier and no four lock envs → unlocked', () => {
  const env = cleanEnv();
  assert.equal(isGandalfBandLocked({ env }), false);
  assert.equal(isGandalfBandUnlocked({ env }), true);
  // GANDALF_MAX_SHARDS alone is never a triage lock.
  const envCap = cleanEnv({ GANDALF_MAX_SHARDS: '64' });
  assert.equal(isGandalfBandLocked({ env: envCap }), false);
  assert.equal(isGandalfBandUnlocked({ env: envCap }), true);
});

test('L4 exclusive unlock: any one of six lock inputs → locked', () => {
  assert.equal(isGandalfBandUnlocked({ depth: 'LITE', env: cleanEnv() }), false);
  assert.equal(isGandalfBandUnlocked({ tier: 'Standard', env: cleanEnv() }), false);
  assert.equal(isGandalfBandUnlocked({ env: cleanEnv({ GANDALF_DEPTH: 'FULL' }) }), false);
  assert.equal(isGandalfBandUnlocked({ env: cleanEnv({ FOUNDRY_TRIAGE_DEPTH: 'LITE' }) }), false);
  assert.equal(isGandalfBandUnlocked({ env: cleanEnv({ GANDALF_TIER: 'Heavy' }) }), false);
  assert.equal(isGandalfBandUnlocked({ env: cleanEnv({ FOUNDRY_TRIAGE_TIER: 'Standard' }) }), false);
});

// ─── Unlocked → null band knobs into runMapReduce ────────────────────────────

test('L4 unlocked: resolveConsumeKnobs → maxShards/fusionPasses null; knobs null; source null', () => {
  const env = cleanEnv();
  const got = resolveConsumeKnobs({ env });
  assert.equal(got.locked, false);
  assert.equal(got.maxShards, null);
  assert.equal(got.fusionPasses, null);
  assert.equal(got.knobs, null);
  assert.equal(got.source, null);
});

test('L4 unlocked: runScaledAnalysis call object carries null maxShards/fusionPasses (pre-band)', async () => {
  const env = cleanEnv();
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'unlocked baseline',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxShards, null);
  assert.equal(calls[0].fusionPasses, null);
});

// ─── capGroupsToMaxShards(null|undefined) unchanged ──────────────────────────

test('L4 capGroupsToMaxShards(groups, null|undefined) leaves groups unchanged', () => {
  const groups = {
    '/a': ['a/1.js'],
    '/b': ['b/1.js'],
    '/c': ['c/1.js'],
    '/d': ['d/1.js'],
    '/e': ['e/1.js'],
  };
  assert.equal(Object.keys(capGroupsToMaxShards(groups, null)).length, 5);
  assert.equal(Object.keys(capGroupsToMaxShards(groups, undefined)).length, 5);
  // Identity: same key set
  assert.deepEqual(
    Object.keys(capGroupsToMaxShards(groups, null)).sort(),
    Object.keys(groups).sort(),
  );
});

// ─── High group count unthinned by LITE when unlocked ────────────────────────

test('L4 unlocked high group count: not thinned to LITE.shards; no band-thin cap log', async () => {
  const liteShards = knobsForSkill('gandalf', 'LITE').shards;
  const dirs = Math.max(5, liteShards + 3);
  const payload = multiDirPayload(dirs);
  const preGroups = Object.keys(groupPayloadByTopLevelDir(payload)).length;
  assert.ok(preGroups > liteShards, `fixture groups (${preGroups}) must exceed LITE.shards (${liteShards})`);

  const logs = [];
  const mapAgent = async (_prompt, opts) => {
    if (opts?.label?.startsWith('map-reduce-chunk-')) return `summary ${opts.label}`;
    return 'map-default';
  };
  const reduceAgent = async () => 'fused';

  await runMapReduce({
    payload,
    userObjective: 'unlocked no silent LITE thin',
    agent: mapAgent,
    reduceAgent,
    highContextLimit: 2,
    env: cleanEnv({ GANDALF_SKIP_SCOUT: 'true' }),
    maxShards: null,
    fusionPasses: null,
    log: (m) => logs.push(String(m)),
  });

  assert.ok(
    !logs.some((l) => l.includes('band-thin: capped shards')),
    'unlocked null maxShards must not emit band-thin shard cap (no silent LITE thin)',
  );
});

// ─── CLI omit --depth + no lock env → unlocked ───────────────────────────────

test('L4 CLI omit --depth and no depth/tier env → unlocked path (null call-object knobs)', async () => {
  const opts = parseArgs([
    '--analyze',
    '--project',
    '.',
    '--objective',
    'legacy omit depth',
  ]);
  assert.equal(opts.depth, null);
  assert.equal(opts.tier, null);

  const env = cleanEnv();
  assert.equal(isGandalfBandUnlocked({ depth: opts.depth, tier: opts.tier, env }), true);

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
  assert.equal(calls[0].maxShards, null);
  assert.equal(calls[0].fusionPasses, null);
});

// ─── Full L4 matrix: locked ± GANDALF_MAX_SHARDS ─────────────────────────────

test('L4 matrix locked + MAX_SHARDS unset: call object = knobs.shards/fusionPasses', async () => {
  const expected = knobsForSkill('gandalf', 'LITE');
  const env = cleanEnv();
  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'locked no max_shards',
    depth: 'LITE',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxShards, expected.shards);
  assert.equal(calls[0].fusionPasses, expected.fusionPasses);
  assertGandalfSeatsFloor(expected);
});

test('L4 matrix locked LITE + GANDALF_MAX_SHARDS higher than LITE.shards: lock knobs land (no expand)', async () => {
  const expected = knobsForSkill('gandalf', 'LITE');
  const env = cleanEnv({ GANDALF_MAX_SHARDS: String(expected.shards + 50) });
  // Env alone is not a lock; depth locks.
  assert.equal(isGandalfBandLocked({ depth: 'LITE', env }), true);
  const got = resolveConsumeKnobs({ depth: 'LITE', env });
  assert.equal(got.locked, true);
  assert.equal(got.maxShards, expected.shards);
  assert.equal(got.fusionPasses, expected.fusionPasses);
  assert.equal(got.source, 'explicit');

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
  assert.equal(calls[0].maxShards, expected.shards);
  assert.equal(calls[0].fusionPasses, expected.fusionPasses);
});

test('L4 matrix locked + GANDALF_MAX_SHARDS lower than lock: call object still lock knobs; env only tightens post-cap', async () => {
  const expected = knobsForSkill('gandalf', 'FULL');
  // Env tighter than FULL.shards — call object still carries lock knobs; map-reduce may min().
  const tight = Math.max(1, expected.shards - 1);
  const env = cleanEnv({ GANDALF_MAX_SHARDS: String(tight) });
  const got = resolveConsumeKnobs({ depth: 'FULL', env });
  assert.equal(got.maxShards, expected.shards, 'call-object maxShards is lock knobs, not env');
  assert.equal(got.fusionPasses, expected.fusionPasses, 'fusionPasses never replaced by env');

  const dirs = Math.max(5, expected.shards + 2);
  const payload = multiDirPayload(dirs);
  const logs = [];
  const mapAgent = async (_prompt, opts) => {
    if (opts?.label?.startsWith('map-reduce-chunk-')) return `summary ${opts.label}`;
    return 'map-default';
  };
  await runMapReduce({
    payload,
    userObjective: 'env tightens only',
    agent: mapAgent,
    reduceAgent: async () => 'fused',
    highContextLimit: 2,
    env,
    maxShards: expected.shards,
    fusionPasses: expected.fusionPasses,
    log: (m) => logs.push(String(m)),
  });
  // Post-cap must not expand past lock; when env is tighter, effective cap is min.
  const capLog = logs.find((l) => l.includes('band-thin: capped shards'));
  if (capLog) {
    assert.ok(
      capLog.includes(`maxShards=${tight}`) || capLog.includes(`maxShards=${expected.shards}`),
      `cap log should show lock or tightened cap, got: ${capLog}`,
    );
    // Never claim a cap above the lock.
    const m = /maxShards=(\d+)/.exec(capLog);
    if (m) {
      assert.ok(Number(m[1]) <= expected.shards, 'env must never expand past lock');
    }
  }
});

// ─── Full L4 matrix: unlocked ± GANDALF_MAX_SHARDS ───────────────────────────

test('L4 matrix unlocked + MAX_SHARDS unset: null band knobs; never source=explicit', async () => {
  const env = cleanEnv();
  const got = resolveConsumeKnobs({ env });
  assert.equal(got.locked, false);
  assert.equal(got.maxShards, null);
  assert.equal(got.fusionPasses, null);
  assert.equal(got.knobs, null);
  assert.notEqual(got.source, 'explicit');

  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'unlocked no max_shards',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  assert.equal(calls[0].maxShards, null);
  assert.equal(calls[0].fusionPasses, null);
});

test('L4 matrix unlocked + GANDALF_MAX_SHARDS set: null band knobs on call object; never source=explicit; legacy cap only inside runMapReduce', async () => {
  const env = cleanEnv({ GANDALF_MAX_SHARDS: '3' });
  assert.equal(isGandalfBandUnlocked({ env }), true);
  const got = resolveConsumeKnobs({ env });
  assert.equal(got.locked, false);
  assert.equal(got.maxShards, null, 'MAX_SHARDS is not a band knob on call object');
  assert.equal(got.fusionPasses, null);
  assert.equal(got.knobs, null);
  assert.notEqual(got.source, 'explicit');
  assert.equal(got.source, null);

  const { calls, runner } = makeCaptureRunner();
  await runScaledAnalysis({
    payload: { 'a/x.js': '1' },
    userObjective: 'unlocked legacy cap only',
    env,
    mapReduceRunner: runner,
    makeAgent: () => async () => 'stub',
  });
  // Call object still null — legacy cap is applied inside runMapReduce, not as band knobs.
  assert.equal(calls[0].maxShards, null);
  assert.equal(calls[0].fusionPasses, null);

  // Legacy-only cap does thin when env is set on unlocked path (not a band stamp).
  const payload = multiDirPayload(6);
  const logs = [];
  await runMapReduce({
    payload,
    userObjective: 'legacy env cap',
    agent: async (_p, opts) =>
      (opts?.label?.startsWith('map-reduce-chunk-') ? `summary ${opts.label}` : 'map'),
    reduceAgent: async () => 'fused',
    highContextLimit: 2,
    env,
    maxShards: null,
    fusionPasses: null,
    log: (m) => logs.push(String(m)),
  });
  assert.ok(
    logs.some((l) => l.includes('band-thin: capped shards') && l.includes('maxShards=3')),
    'unlocked + GANDALF_MAX_SHARDS applies legacy cap only (not knobsForSkill ceremony)',
  );
});

// ─── Safety floors on locked consume ─────────────────────────────────────────

test('L4/L5 locked consume refuses empty seats (production seats floor)', () => {
  // Guard unit: zeroed seats always refused.
  assert.throws(() => assertGandalfSeatsFloor({ seats: '' }), /seats floor/);
  // Live LITE/FULL/SPIKE knobs pass the floor.
  for (const depth of ['LITE', 'FULL', 'SPIKE-FIRST']) {
    assertGandalfSeatsFloor(knobsForSkill('gandalf', depth));
  }
});
