// Gandalf advisor — Wave 7: Increment-1 INTEGRATION (the committed Gandalf v1 SHIP milestone).
//
// Wave 7 done-when (this file's half): `node --test test/*.test.mjs` exits 0 with ALL Increment-1
// canaries (B1, B3, B5, B6, B8, B9, B-honesty, B-ceiling) + their discriminating negatives passing
// over ONE fully-integrated Gandalf v1 output. The per-wave suites already prove each canary in
// isolation; this suite proves they hold TOGETHER on a single real advisor output (the integration)
// and that the umbrella gate `assertIncrement1Conformant` is the canary set expressed as one call.
//
// PRINCIPLE-D: every canary here is deterministic SHAPE / RUNG-CONSISTENCY; label/semantic TRUTH is
// the advisory layer's job (proven isolated in principle-d-meta-isolation.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertIncrement1Conformant,
  assertConformant,
  assertDiagnoseSeam,
  assertSituateSeam,
  assertCeiling,
  assertRefutationSeam,
  assertAnticipateSeam,
  assertScoreLabelSeam,
} from './harness.mjs';
import {
  gandalfV1FullOutput,
  emptyConformantOutput,
  // discriminating negatives, one per Increment-1 canary:
  diagnoseFindingNoProvenance,            // B5
  situateFindingSelfCorroborated,         // SITUATE cap
  outputElevationGrounded,                // B-ceiling
  elevationConfidenceWordDefeater,        // B-honesty
  anticipateFindingRegretField,           // B3
  anticipateFindingPresentTense,          // B9
  findingIdeationDivergent,               // B1
  outputSilentDegradation,                // B6
  outputLegMissingRiskLabel,              // B8
} from './fixtures.mjs';

// === the integration: the WHOLE Increment-1 canary set is GREEN over one v1 output ============
test('Increment-1 integration: a full Gandalf v1 output passes the ENTIRE canary set at once', () => {
  const out = gandalfV1FullOutput();
  // The umbrella gate (the canary set = the test suite) passes…
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the integrated v1 output passes every Increment-1 canary');
  // …and so does every constituent canary applied directly (the integration is not hiding a skip).
  assert.doesNotThrow(() => assertConformant(out), 'schema + reasoning-before-verdict + caps');
  assert.doesNotThrow(() => assertDiagnoseSeam(out), 'B5 diagnose-exclusive-to-core');
  assert.doesNotThrow(() => assertSituateSeam(out), 'SITUATE honesty cap');
  assert.doesNotThrow(() => assertCeiling(out), 'B-ceiling single-family ⇒ PROMISING');
  assert.doesNotThrow(() => assertRefutationSeam(out), 'B-honesty named-defeater + provenance');
  assert.doesNotThrow(() => assertAnticipateSeam(out), 'B3 + B9 bounded forward-looking premortem');
  assert.doesNotThrow(() => assertScoreLabelSeam(out), 'B1 + B6 + B8 score / label / synthesis');
});

test('Increment-1 integration: the v1 output exercises ALL THREE legs + both elevation paths', () => {
  const out = gandalfV1FullOutput();
  const kinds = out.findings.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ['anticipate', 'diagnose', 'situate'], 'all three legs are present (a real integration)');
  assert.deepEqual(out.risk_labels.map((r) => r.leg).sort(), ['anticipate', 'diagnose', 'situate'], 'every leg is synthesised');
  assert.equal(out.elevations.length, 2, 'both elevation paths present');
  assert.ok(out.elevations.some((e) => e.tier === 'PROMISING'), 'a refutation-survived PROMISING elevation');
  assert.ok(out.elevations.some((e) => e.tier === 'SPECULATIVE'), 'an honestly-stamped below-threshold SPECULATIVE elevation');
  assert.equal(out.cross_model, false, 'single-family substrate (the ceiling binds)');
});

// === the discriminating negatives: each canary still FAILS its planted violation in integration ==
// One negative per Increment-1 canary, asserted through the umbrella gate AND its constituent canary.
test('B5 negative: a diagnose finding with no gandalf_core provenance FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.findings.push(diagnoseFindingNoProvenance());
  assert.throws(() => assertIncrement1Conformant(out), /B5 diagnose-provenance/);
  assert.throws(() => assertDiagnoseSeam(out), /B5 diagnose-provenance/);
});

test('SITUATE-cap negative: a self-CORROBORATED situate finding FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.findings.push(situateFindingSelfCorroborated());
  assert.throws(() => assertIncrement1Conformant(out), /B-situate/);
  assert.throws(() => assertSituateSeam(out), /B-situate/);
});

test('B-ceiling negative: a GROUNDED elevation on a single-family run FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.elevations.push(outputElevationGrounded().elevations[0]); // a GROUNDED elevation on cross_model:false
  assert.throws(() => assertIncrement1Conformant(out), /B-ceiling/);
  assert.throws(() => assertCeiling(out), /B-ceiling/);
});

test('B-honesty negative: a confidence-word "refutation" FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.elevations.push(elevationConfidenceWordDefeater());
  assert.throws(() => assertIncrement1Conformant(out), /B-honesty/);
  assert.throws(() => assertRefutationSeam(out), /B-honesty/);
});

test('B3 negative: an Oranges-engine regret field on an anticipation FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.findings.push(anticipateFindingRegretField());
  assert.throws(() => assertIncrement1Conformant(out), /B3 bounded-premortem/);
  assert.throws(() => assertAnticipateSeam(out), /B3 bounded-premortem/);
});

test('B9 negative: a present-tense anticipation FAILS the integrated gate', () => {
  const out = gandalfV1FullOutput();
  out.findings.push(anticipateFindingPresentTense());
  assert.throws(() => assertIncrement1Conformant(out), /B9 forward-looking/);
  assert.throws(() => assertAnticipateSeam(out), /B9 forward-looking/);
});

test('B1 negative: a divergent/brainstorm ideate-class finding FAILS the integrated gate', () => {
  // The umbrella's schema layer rejects an out-of-enum ideation KIND first (also a FAIL), so to prove
  // B1 itself fires in integration use a SCHEMA-VALID finding smuggling an idea-generation FIELD.
  const out = gandalfV1FullOutput();
  out.findings.push({
    id: 'i-smuggled-ideation',
    kind: 'situate',
    rung: 'UNVERIFIED',
    reasoning: 'A situate-shaped finding that smuggles in open-ended idea generation.',
    verdict: 'a burst of novel extensions masquerading as a frame',
    new_ideas: ['bolt on a marketplace', 'add a gamified streak'],
  });
  assert.throws(() => assertIncrement1Conformant(out), /B1 zero-ideation/);
  assert.throws(() => assertScoreLabelSeam(out), /B1 zero-ideation/);

  // And the canonical ideate-KIND negative is ALSO rejected by the integrated gate (at the schema layer).
  const out2 = gandalfV1FullOutput();
  out2.findings.push(findingIdeationDivergent());
  assert.throws(() => assertIncrement1Conformant(out2), /schema-conformance|B1 zero-ideation/);
});

test('B6 negative: a silent per-item degradation FAILS the integrated gate', () => {
  // outputSilentDegradation is a self-contained output with a degraded diagnose finding under a
  // top-level degraded:false — feed it through the umbrella directly (it is schema-conformant).
  const out = outputSilentDegradation();
  assert.throws(() => assertIncrement1Conformant(out), /B6 no-silent-degradation/);
  assert.throws(() => assertScoreLabelSeam(out), /B6 no-silent-degradation/);
});

test('B8 negative: a present leg absent from risk_labels FAILS the integrated gate', () => {
  const out = outputLegMissingRiskLabel(); // anticipate leg present but unlabelled
  assert.throws(() => assertIncrement1Conformant(out), /B8 honest-synthesis/);
  assert.throws(() => assertScoreLabelSeam(out), /B8 honest-synthesis/);
});

test('the umbrella is a pure SHAPE gate: an empty conformant output passes, a non-object throws', () => {
  assert.doesNotThrow(() => assertIncrement1Conformant(emptyConformantOutput()), 'an empty conformant output trivially passes');
  assert.throws(() => assertIncrement1Conformant(null), /not an object|schema-conformance/);
});
