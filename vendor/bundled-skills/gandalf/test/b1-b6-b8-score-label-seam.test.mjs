// Gandalf advisor — Wave 6 canaries: SCORE / LABEL / SYNTHESIS (serves NS4, NS6).
//
// Wave 6 done-when: dual-axis (value-if-true × groundedness) scoring; tiered honest labels (only
// REFUTED drops; single-family ceiling PROMISING); honest synthesis; B1 + B6 + B8 pass and their
// negatives FAIL. Each canary verifies a precise SHAPE/RUNG-CONSISTENCY invariant; label/semantic
// TRUTH stays the advisory layer's job (PRINCIPLE-D).
//
// The three frozen scenarios:
//   • Given any divergent/brainstorm "ideate"-class finding, when B1 runs, then it FAILS (ideation
//     is Jumper's).
//   • Given a per-finding `degraded:true` with top-level `degraded:false`, when B6 runs, then it FAILS.
//   • Given a leg absent from `risk_labels`, OR a risk_label whose rung exceeds its leg's envelope
//     rung, when B8 runs, then it FAILS.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoIdeation,
  assertNoIdeationSeam,
  assertNoSilentDegradation,
  assertHonestSynthesis,
  assertScoreLabelSeam,
  assertCeiling,
  assertSchemaConformant,
} from './harness.mjs';
import {
  VALUE_AXIS,
  GROUNDEDNESS_AXIS,
  COLLAPSED_SCORE_FIELDS,
  scoreDualAxis,
  isDualAxisScore,
  isCollapsedScore,
  TIER_CEILING_SINGLE_FAMILY,
  DROP_RUNG,
  dropsFromOutput,
  labelTier,
  LEGS,
  legsPresent,
  legEnvelopeRung,
  composeRiskLabels,
  IDEATION_KINDS,
  IDEATION_FIELDS,
  isIdeationFinding,
  degradedItems,
  hasSilentDegradation,
} from '../seam/score-label.mjs';
import {
  emptyConformantOutput,
  diagnoseFindingCoreProvenanced,
  situateFindingCappedConformant,
  anticipateFindingConformant,
  findingIdeationDivergent,
  elevationDualAxisScored,
  collapsedScore,
  outputSilentDegradation,
  outputHonestDegradation,
  outputHonestSynthesis,
  outputLegMissingRiskLabel,
  outputRiskLabelRungExceedsEnvelope,
} from './fixtures.mjs';

// === B1: zero ideation (scenario 1) =======================================================
test('B1: a grounded finding passes; a divergent/brainstorm ideate-class finding FAILS', () => {
  // A grounded diagnose/situate/anticipate finding is NOT ideation ⇒ passes B1.
  assert.doesNotThrow(() => assertNoIdeation(diagnoseFindingCoreProvenanced()), 'a grounded diagnosis is not ideation');
  assert.doesNotThrow(() => assertNoIdeation(anticipateFindingConformant()), 'a grounded anticipation is not ideation');
  // A divergent/brainstorm ideate-class finding FAILS B1 (ideation is Jumper's).
  assert.throws(
    () => assertNoIdeation(findingIdeationDivergent()),
    /B1 zero-ideation: .*ideate-class/,
    'a divergent/brainstorm ideate-class finding must FAIL B1'
  );
});

test('B1: an ideation KIND alone FAILS, and every named ideation FIELD FAILS', () => {
  for (const kind of IDEATION_KINDS) {
    assert.throws(
      () => assertNoIdeation({ id: `k-${kind}`, kind, rung: 'UNVERIFIED', reasoning: 'r', verdict: 'v' }),
      /B1 zero-ideation/,
      `the ideation kind '${kind}' must FAIL B1`
    );
  }
  for (const field of IDEATION_FIELDS) {
    const finding = diagnoseFindingCoreProvenanced();
    finding.kind = 'situate'; // a non-ideation kind…
    finding[field] = 'a smuggled-in burst of open-ended idea generation'; // …but an idea-generation field
    assert.throws(
      () => assertNoIdeation(finding),
      /B1 zero-ideation/,
      `the ideation field '${field}' must FAIL B1`
    );
  }
});

test('B1: a non-object throws; the seam gates findings AND elevations', () => {
  assert.throws(() => assertNoIdeation(null), /not an object/);
  assert.throws(() => assertNoIdeation([]), /not an object/);

  // The seam catches an ideation finding…
  const badFinding = emptyConformantOutput();
  badFinding.findings.push(findingIdeationDivergent());
  assert.throws(() => assertNoIdeationSeam(badFinding), /B1 zero-ideation/, 'an ideation finding FAILS the seam');

  // …and an ideation drift that lands in an elevation (a suggestion surface).
  const badElevation = emptyConformantOutput();
  badElevation.elevations.push({ id: 'e-brainstorm', tier: 'SPECULATIVE', value_if_true: 'low', reasoning: 'r', verdict: 'v', brainstorm: ['x', 'y'] });
  assert.throws(() => assertNoIdeationSeam(badElevation), /B1 zero-ideation/, 'an ideation elevation FAILS the seam');

  assert.doesNotThrow(() => assertNoIdeationSeam(emptyConformantOutput()), 'zero ideation ⇒ trivially passes');
});

test('isIdeationFinding: the B1 core predicate is pure and never throws', () => {
  assert.ok(isIdeationFinding(findingIdeationDivergent()), 'a divergent ideate-class finding is detected');
  assert.ok(!isIdeationFinding(diagnoseFindingCoreProvenanced()), 'a grounded diagnosis is not ideation');
  assert.equal(isIdeationFinding(null), false);
  assert.equal(isIdeationFinding([]), false);
});

// === B6: no silent degradation (scenario 2) ===============================================
test('B6: a per-item degraded:true under a top-level degraded:false FAILS', () => {
  assert.throws(
    () => assertNoSilentDegradation(outputSilentDegradation()),
    /B6 no-silent-degradation/,
    'a silent per-finding degradation must FAIL B6'
  );
});

test('B6: an honest degradation (top level owns it) passes; a clean output passes', () => {
  assert.doesNotThrow(
    () => assertNoSilentDegradation(outputHonestDegradation()),
    'when the top level surfaces the degradation, it is not silent ⇒ passes'
  );
  assert.doesNotThrow(() => assertNoSilentDegradation(emptyConformantOutput()), 'no degradation anywhere ⇒ passes');
  assert.throws(() => assertNoSilentDegradation(null), /not an object/);
});

test('hasSilentDegradation / degradedItems: the B6 cores are pure', () => {
  assert.ok(hasSilentDegradation(outputSilentDegradation()), 'a silent per-item degradation is detected');
  assert.ok(!hasSilentDegradation(outputHonestDegradation()), 'a top-level-owned degradation is not silent');
  assert.equal(degradedItems(outputSilentDegradation()).length, 1, 'one degraded item collected');
  assert.equal(degradedItems(emptyConformantOutput()).length, 0);
  assert.equal(hasSilentDegradation(null), false);
});

// === B8: honest synthesis (scenario 3) ====================================================
test('B8: an honestly-synthesised output passes (every leg labelled, rung ≤ envelope)', () => {
  const out = outputHonestSynthesis();
  assert.doesNotThrow(() => assertHonestSynthesis(out), 'every present leg is labelled within its envelope ⇒ passes B8');
  assert.doesNotThrow(() => assertCeiling(out), 'the single-family labels stay at the PROMISING ceiling');
  assert.doesNotThrow(() => assertSchemaConformant(out), 'the synthesised output keeps the committed shape');
});

test('B8: a leg present in the findings but absent from risk_labels FAILS', () => {
  assert.throws(
    () => assertHonestSynthesis(outputLegMissingRiskLabel()),
    /B8 honest-synthesis: leg 'anticipate' .*absent from risk_labels/,
    'an unlabelled present leg must FAIL B8'
  );
});

test('B8: a risk_label whose rung exceeds its leg\'s envelope rung FAILS', () => {
  assert.throws(
    () => assertHonestSynthesis(outputRiskLabelRungExceedsEnvelope()),
    /B8 honest-synthesis: .*leg 'diagnose' is stamped rung OBSERVED but the leg's evidential envelope is CLAIMED/,
    'a synthesis that out-claims its leg\'s envelope must FAIL B8'
  );
});

test('B8: an output with no legs trivially passes; a non-object throws', () => {
  assert.doesNotThrow(() => assertHonestSynthesis(emptyConformantOutput()), 'no legs ⇒ trivially passes');
  assert.throws(() => assertHonestSynthesis(null), /not an object/);
});

test('legsPresent / legEnvelopeRung: the B8 cores', () => {
  const out = outputHonestSynthesis();
  assert.deepEqual(legsPresent(out), ['diagnose', 'situate'], 'present legs are reported in LEGS order');
  assert.equal(legEnvelopeRung(out, 'diagnose'), 'CLAIMED', 'the diagnose envelope is its strongest finding rung');
  assert.equal(legEnvelopeRung(out, 'anticipate'), null, 'a leg with no finding has no envelope');
  assert.deepEqual(LEGS, ['diagnose', 'situate', 'anticipate']);
});

// === SCORE: dual-axis, never collapsed ====================================================
test('scoreDualAxis: mints two SEPARATE axes (value-if-true × groundedness), never collapsed', () => {
  const score = scoreDualAxis(elevationDualAxisScored());
  assert.equal(score.value_if_true, 'high', 'the value axis is preserved');
  assert.equal(score.groundedness, 'CLAIMED', 'the groundedness axis is the evidence rung');
  assert.ok(isDualAxisScore(score), 'a well-formed dual-axis score is recognised');
  assert.ok(!isCollapsedScore(score), 'a dual-axis score carries no collapsed scalar');
  // The two axes are genuinely independent — neither is derivable from the other.
  assert.deepEqual(Object.keys(score), ['value_if_true', 'groundedness']);
  assert.ok(VALUE_AXIS.includes(score.value_if_true) && GROUNDEDNESS_AXIS.includes(score.groundedness));
});

test('SCORE: a collapsed single-scalar score is flagged and rejected', () => {
  const collapsed = collapsedScore();
  assert.ok(isCollapsedScore(collapsed), 'a `priority` scalar collapses the two axes');
  assert.ok(!isDualAxisScore(collapsed), 'a collapsed score is NOT a valid dual-axis score');
  for (const f of COLLAPSED_SCORE_FIELDS) {
    assert.ok(isCollapsedScore({ value_if_true: 'high', groundedness: 'CLAIMED', [f]: 1 }), `the collapse field '${f}' is flagged`);
  }
  // scoreDualAxis refuses to score an item off the axes.
  assert.throws(() => scoreDualAxis({ value_if_true: 'huge', rung: 'CLAIMED' }), /value axis/);
  assert.throws(() => scoreDualAxis({ value_if_true: 'high', rung: 'SOLID' }), /groundedness rung/);
});

// === LABEL: tiered, honest (only REFUTED drops; single-family ceiling PROMISING) ============
test('LABEL: only the REFUTED drops; everything above is kept and labelled', () => {
  assert.equal(DROP_RUNG, 'REFUTED');
  assert.ok(dropsFromOutput({ rung: 'REFUTED' }), 'a REFUTED finding drops');
  for (const rung of ['UNVERIFIED', 'CLAIMED', 'CORROBORATED', 'OBSERVED']) {
    assert.ok(!dropsFromOutput({ rung }), `a ${rung} finding is kept (only REFUTED drops)`);
  }
  const refuted = labelTier({ rung: 'REFUTED', tier: 'PROMISING' });
  assert.equal(refuted.dropped, true, 'the REFUTED is dropped');
  assert.equal(refuted.tier, null);
});

test('LABEL: the single-family ceiling caps a tier at PROMISING (GROUNDED unreachable)', () => {
  assert.equal(TIER_CEILING_SINGLE_FAMILY, 'PROMISING');
  const capped = labelTier({ rung: 'CORROBORATED', tier: 'GROUNDED' }, { cross_model: false });
  assert.equal(capped.dropped, false);
  assert.equal(capped.tier, 'PROMISING', 'a single-family GROUNDED request is capped at the PROMISING ceiling');
  const xfam = labelTier({ rung: 'CORROBORATED', tier: 'GROUNDED' }, { cross_model: true });
  assert.equal(xfam.tier, 'GROUNDED', 'cross-family runs are not capped by the single-family ceiling');
  assert.throws(() => labelTier(null), /not an object/);
});

test('composeRiskLabels: mints honest, envelope-bounded, ceiling-capped labels for every leg', () => {
  const out = outputHonestSynthesis();
  out.risk_labels = []; // re-derive the synthesis from the findings
  out.risk_labels = composeRiskLabels(out);
  assert.deepEqual(out.risk_labels.map((r) => r.leg), ['diagnose', 'situate'], 'one label per present leg');
  assert.ok(out.risk_labels.every((r) => r.tier === 'PROMISING'), 'single-family ⇒ PROMISING ceiling');
  assert.ok(out.risk_labels.every((r) => r.rung === 'CLAIMED'), 'each label carries its leg envelope rung');
  // The composed synthesis passes the B8 + B-ceiling gates by construction.
  assert.doesNotThrow(() => assertHonestSynthesis(out), 'composed labels pass B8');
  assert.doesNotThrow(() => assertCeiling(out), 'composed labels honour the single-family ceiling');
});

// === the umbrella seam (B1 + B6 + B8 over a whole output) ==================================
test('assertScoreLabelSeam: an honest output passes; each dishonest output FAILS its canary', () => {
  assert.doesNotThrow(() => assertScoreLabelSeam(outputHonestSynthesis()), 'an honest synthesis passes all three');
  assert.doesNotThrow(() => assertScoreLabelSeam(emptyConformantOutput()), 'an empty output trivially passes');

  const ideation = emptyConformantOutput();
  ideation.findings.push(findingIdeationDivergent());
  assert.throws(() => assertScoreLabelSeam(ideation), /B1 zero-ideation/, 'an ideation finding ⇒ seam FAILS on B1');

  assert.throws(() => assertScoreLabelSeam(outputSilentDegradation()), /B6 no-silent-degradation/, 'a silent degradation ⇒ seam FAILS on B6');
  assert.throws(() => assertScoreLabelSeam(outputLegMissingRiskLabel()), /B8 honest-synthesis/, 'a missing leg label ⇒ seam FAILS on B8');
  assert.throws(() => assertScoreLabelSeam(outputRiskLabelRungExceedsEnvelope()), /B8 honest-synthesis/, 'an out-claiming label ⇒ seam FAILS on B8');
});
