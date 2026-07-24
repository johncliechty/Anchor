// Gandalf advisor — harness META-TEST (Wave 1 / GATE-0).
// Proves the canary harness itself works: the rung-gated, field-level assertions FAIL on a
// violating fixture and PASS on a conformant one. A harness that cannot tell the two apart
// would let every later canary pass vacuously, so this is the foundation's own gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNG_LADDER,
  TIER_LADDER,
  rungAtLeast,
  isPopulated,
  assertRungCeiling,
  assertReasoningBeforeVerdict,
  assertCaps,
  SCHEMA,
  CONSTANTS,
} from './harness.mjs';
import { findingRungConformant, findingRungViolation } from './fixtures.mjs';

// --- the wave's headline scenario: rung ceiling discriminates ---------------------------
test('rung ceiling: a conformant fixture passes, a violating fixture FAILS', () => {
  // Given a finding carrying a rung + a rung-gated field, when the harness asserts a
  // rung ceiling, then the conformant fixture passes and the violating fixture fails.
  assert.doesNotThrow(
    () => assertRungCeiling(findingRungConformant(), { field: 'corroborated_by', minRung: 'CORROBORATED' }),
    'conformant finding (rung CORROBORATED, field gated at CORROBORATED) must pass'
  );
  assert.throws(
    () => assertRungCeiling(findingRungViolation(), { field: 'corroborated_by', minRung: 'CORROBORATED' }),
    /rung-ceiling/,
    'violating finding (rung CLAIMED, field gated at CORROBORATED) must fail'
  );
});

test('rung ceiling: an absent gated field is not gated (no false positive)', () => {
  const f = { id: 'f', rung: 'UNVERIFIED', reasoning: 'r', verdict: 'v' };
  assert.doesNotThrow(() => assertRungCeiling(f, { field: 'corroborated_by', minRung: 'CORROBORATED' }));
});

test('rung ceiling: populating a gated field with NO rung FAILS', () => {
  const f = { id: 'f', corroborated_by: ['a', 'b'], reasoning: 'r', verdict: 'v' };
  assert.throws(() => assertRungCeiling(f, { field: 'corroborated_by', minRung: 'CORROBORATED' }), /no rung/);
});

test('rung ceiling: exactly-at-ceiling passes, one rung below fails', () => {
  const at = { id: 'a', rung: 'CORROBORATED', corroborated_by: ['x'], reasoning: 'r', verdict: 'v' };
  const below = { id: 'b', rung: 'CLAIMED', corroborated_by: ['x'], reasoning: 'r', verdict: 'v' };
  assert.doesNotThrow(() => assertRungCeiling(at, { field: 'corroborated_by', minRung: 'CORROBORATED' }));
  assert.throws(() => assertRungCeiling(below, { field: 'corroborated_by', minRung: 'CORROBORATED' }));
});

// --- ladder helpers --------------------------------------------------------------------
test('rungAtLeast respects the evidence ladder ordering', () => {
  assert.ok(rungAtLeast('OBSERVED', 'CLAIMED'));
  assert.ok(rungAtLeast('CLAIMED', 'CLAIMED'));
  assert.ok(!rungAtLeast('UNVERIFIED', 'CORROBORATED'));
  assert.throws(() => rungAtLeast('NONSENSE', 'CLAIMED'), /unknown rung/);
});

test('isPopulated treats empty string/array/object as unpopulated', () => {
  assert.ok(!isPopulated(undefined));
  assert.ok(!isPopulated(null));
  assert.ok(!isPopulated(''));
  assert.ok(!isPopulated('   '));
  assert.ok(!isPopulated([]));
  assert.ok(!isPopulated({}));
  assert.ok(isPopulated(['x']));
  assert.ok(isPopulated('x'));
  assert.ok(isPopulated(0));
  assert.ok(isPopulated(false));
});

// --- reasoning-before-verdict ----------------------------------------------------------
test('reasoning-before-verdict passes in order and FAILS when reversed', () => {
  assert.doesNotThrow(() => assertReasoningBeforeVerdict({ reasoning: 'r', verdict: 'v' }));
  const reversed = {};
  reversed.verdict = 'v';
  reversed.reasoning = 'r';
  assert.throws(() => assertReasoningBeforeVerdict(reversed), /before 'reasoning'/);
  assert.throws(() => assertReasoningBeforeVerdict({ verdict: 'v' }), /missing 'reasoning'/);
  assert.throws(() => assertReasoningBeforeVerdict({ reasoning: 'r' }), /missing 'verdict'/);
});

// --- caps ------------------------------------------------------------------------------
test('assertCaps fails when nitpick/elevation counts exceed the frozen caps', () => {
  const { max_nitpicks, max_elevations } = CONSTANTS.output_caps;
  const over = { nitpicks: Array.from({ length: max_nitpicks + 1 }, (_, i) => ({ id: `n${i}` })), elevations: [] };
  assert.throws(() => assertCaps(over), /nitpick cap exceeded/);
  const overE = { nitpicks: [], elevations: Array.from({ length: max_elevations + 1 }, (_, i) => ({ id: `e${i}` })) };
  assert.throws(() => assertCaps(overE), /elevation cap exceeded/);
  assert.doesNotThrow(() => assertCaps({ nitpicks: [], elevations: [] }));
});

// --- schema enums mirror the harness ladders (drift guard) -----------------------------
test('committed schema enums agree with the harness ladders', () => {
  assert.deepEqual(SCHEMA.properties.findings.items.properties.rung.enum, RUNG_LADDER);
  assert.deepEqual(SCHEMA.properties.elevations.items.properties.tier.enum, TIER_LADDER);
  assert.deepEqual(SCHEMA.properties.risk_labels.items.properties.tier.enum, TIER_LADDER);
});

// --- frozen constants are actually frozen in the committed file -------------------------
test('prereg-constants.json carries the frozen Wave-1 constants', () => {
  assert.equal(CONSTANTS.refuter_budget_R, 3);
  assert.equal(CONSTANTS.refuter_firing_threshold.value_if_true_at_least, 'high');
  assert.equal(CONSTANTS.refuter_firing_threshold.or_severity_at_least, 'major');
  assert.equal(CONSTANTS.spawn_caps.commission_depth, 1);
  assert.equal(CONSTANTS.spawn_caps.per_run_spawn_cap, 5);
  assert.equal(CONSTANTS.spawn_caps.skill_twice_in_commission_chain, 'HALT');
  assert.equal(CONSTANTS.substrate.cross_model, false);
});
