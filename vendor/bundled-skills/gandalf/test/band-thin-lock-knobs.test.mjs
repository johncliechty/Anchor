// B2 W1 / LOCK CONTRACT L1 + L3-E5 — multi-source lock precedence + knobs fingerprint.
// Hermetic matrix via injected env + explicit args into resolveGandalfBand / lock predicate.
// Expected numerics come ONLY from live knobsForSkill — never plan-embedded literals.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveGandalfBand,
  isGandalfBandLocked,
  pickGandalfDepth,
  pickGandalfTier,
  knobsForSkill,
} from '../runtime/triage-band.mjs';

/** Clean env for hermetic isolation (no ambient GANDALF_* / FOUNDRY_TRIAGE_*). */
function cleanEnv(extra = {}) {
  return {
    ...extra,
    // Prevent accidental inheritance if callers merge process.env later.
  };
}

/** Assert knobs fingerprint equals knobsForSkill for the resolved depth (no parallel tables). */
function assertKnobsFingerprint(got, depthToken, tierToken = undefined) {
  const expected = knobsForSkill('gandalf', depthToken, tierToken);
  assert.ok(expected, `knobsForSkill('gandalf', ${depthToken}) must resolve`);
  assert.equal(typeof expected.shards, 'number', 'shards must be numeric');
  assert.ok(Number.isFinite(expected.shards), 'shards must be finite');
  assert.equal(typeof expected.fusionPasses, 'number', 'fusionPasses must be numeric');
  assert.ok(Number.isFinite(expected.fusionPasses), 'fusionPasses must be finite');
  assert.equal(got.shards, expected.shards, 'shards fingerprint');
  assert.equal(got.fusionPasses, expected.fusionPasses, 'fusionPasses fingerprint');
  assert.equal(got.depth, expected.depth, 'depth stamp');
}

// ─── Explicit depth matrix (LITE | FULL | SPIKE-FIRST) ───────────────────────

for (const depth of ['LITE', 'FULL', 'SPIKE-FIRST']) {
  test(`L1 explicit depth=${depth}: source=explicit; knobs fingerprint knobsForSkill`, () => {
    const env = cleanEnv();
    assert.equal(isGandalfBandLocked({ depth, env }), true);
    const band = resolveGandalfBand({ depth, env, allowDefault: false });
    assert.equal(band.source, 'explicit');
    assert.ok(band.lock, 'locked path must carry a lock record');
    assertKnobsFingerprint(band.knobs, depth);
  });
}

// ─── Each of four envs alone ─────────────────────────────────────────────────

test('L1 env-only GANDALF_DEPTH=LITE: locked + explicit + fingerprint', () => {
  const env = cleanEnv({ GANDALF_DEPTH: 'LITE' });
  assert.equal(isGandalfBandLocked({ env }), true);
  const band = resolveGandalfBand({ env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assertKnobsFingerprint(band.knobs, 'LITE');
});

test('L1 env-only FOUNDRY_TRIAGE_DEPTH=FULL: production lock predicate + fingerprint', () => {
  const env = cleanEnv({ FOUNDRY_TRIAGE_DEPTH: 'FULL' });
  assert.equal(
    isGandalfBandLocked({ env }),
    true,
    'FOUNDRY_TRIAGE_DEPTH alone must satisfy production lock predicate',
  );
  assert.equal(pickGandalfDepth({ env }), 'FULL');
  const band = resolveGandalfBand({ env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assertKnobsFingerprint(band.knobs, 'FULL');
});

test('L1 env-only GANDALF_TIER=Standard: locked via tier path; source=explicit', () => {
  const env = cleanEnv({ GANDALF_TIER: 'Standard' });
  assert.equal(isGandalfBandLocked({ env }), true);
  const band = resolveGandalfBand({ env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assert.ok(band.lock, 'tier-only path must lock');
  // Depth comes from recommendation when only tier is set; still fingerprints that depth.
  assertKnobsFingerprint(band.knobs, band.knobs.depth, 'Standard');
});

test('L1 env-only FOUNDRY_TRIAGE_TIER=Heavy: production lock predicate + source=explicit', () => {
  const env = cleanEnv({ FOUNDRY_TRIAGE_TIER: 'Heavy' });
  assert.equal(
    isGandalfBandLocked({ env }),
    true,
    'FOUNDRY_TRIAGE_TIER alone must satisfy production lock predicate',
  );
  assert.equal(pickGandalfTier({ env }), 'Heavy');
  const band = resolveGandalfBand({ env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assert.ok(band.lock);
  assertKnobsFingerprint(band.knobs, band.knobs.depth, 'Heavy');
});

// ─── Precedence conflicts ────────────────────────────────────────────────────

test('L1 CLI --depth=LITE wins over GANDALF_DEPTH=FULL', () => {
  const env = cleanEnv({ GANDALF_DEPTH: 'FULL' });
  assert.equal(pickGandalfDepth({ depth: 'LITE', env }), 'LITE');
  const band = resolveGandalfBand({ depth: 'LITE', env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assertKnobsFingerprint(band.knobs, 'LITE');
});

test('L1 GANDALF_DEPTH=LITE wins over FOUNDRY_TRIAGE_DEPTH=FULL', () => {
  const env = cleanEnv({
    GANDALF_DEPTH: 'LITE',
    FOUNDRY_TRIAGE_DEPTH: 'FULL',
  });
  assert.equal(pickGandalfDepth({ env }), 'LITE');
  const band = resolveGandalfBand({ env, allowDefault: false });
  assert.equal(band.source, 'explicit');
  assertKnobsFingerprint(band.knobs, 'LITE');
});

// ─── Fail-closed: incompatible / unknown / empty ─────────────────────────────

test('L1 incompatible depth+tier (invalid tier) hard-fails — no advisory soft-pick', () => {
  const env = cleanEnv();
  assert.throws(
    () => resolveGandalfBand({
      depth: 'LITE',
      tier: 'NOT_A_TIER',
      env,
      allowDefault: true, // even with allowDefault, lock input must not soft-pick
    }),
    (err) => err != null,
  );
});

test('L1 unknown depth token hard-fails (fail-closed, never invent FULL)', () => {
  const env = cleanEnv({ GANDALF_DEPTH: 'NOPE-BAND' });
  assert.equal(isGandalfBandLocked({ env }), true, 'unknown token still triggers lock path');
  assert.throws(
    () => resolveGandalfBand({ env, allowDefault: true }),
    (err) => err != null,
  );
});

test('L1 empty/whitespace sources are not a lock (leave unlocked)', () => {
  const env = cleanEnv({
    GANDALF_DEPTH: '   ',
    FOUNDRY_TRIAGE_DEPTH: '',
    GANDALF_TIER: '\t',
    FOUNDRY_TRIAGE_TIER: '',
  });
  assert.equal(isGandalfBandLocked({ depth: '', tier: null, env }), false);
  assert.equal(pickGandalfDepth({ env }), null);
  assert.equal(pickGandalfTier({ env }), null);
});

// ─── Table integrity: LITE / FULL / SPIKE-FIRST numerics present ──────────────

test('L1 missing/non-numeric shards or fusionPasses for LITE|FULL|SPIKE-FIRST fails', () => {
  for (const depth of ['LITE', 'FULL', 'SPIKE-FIRST']) {
    const knobs = knobsForSkill('gandalf', depth);
    assert.ok(knobs, `mapping must have gandalf/${depth}`);
    assert.equal(typeof knobs.shards, 'number', `${depth}.shards numeric`);
    assert.ok(Number.isFinite(knobs.shards) && knobs.shards > 0, `${depth}.shards finite > 0`);
    assert.equal(typeof knobs.fusionPasses, 'number', `${depth}.fusionPasses numeric`);
    assert.ok(
      Number.isFinite(knobs.fusionPasses) && knobs.fusionPasses > 0,
      `${depth}.fusionPasses finite > 0`,
    );
  }
});

// ─── Unlocked path never claims source=explicit ──────────────────────────────

test('L1 no lock inputs: not locked; source is never explicit', () => {
  const env = cleanEnv();
  assert.equal(isGandalfBandLocked({ env }), false);
  const band = resolveGandalfBand({ env, allowDefault: true });
  assert.notEqual(band.source, 'explicit');
});
