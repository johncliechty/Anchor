// Gandalf advisor — Wave 4 canaries: refutation discipline + B-honesty (the NS4 honesty spine).
//
// Wave 4 done-when: the INDEPENDENT named-defeater refuter for each high-value elevation;
// B-honesty passes and its negative FAILS; the bounded-refuter budget path is a NAMED canary.
// Each canary verifies a precise SHAPE/RUNG-CONSISTENCY invariant; label/semantic TRUTH stays
// the advisory layer's job (PRINCIPLE-D).
//
// The two frozen scenarios:
//   • Given an elevation whose `what_would_refute_it` is a self-rated confidence word (no named
//     concrete defeater + `refutation_provenance`), when B-honesty runs, then it FAILS /
//     auto-downgrades.
//   • Given independent refuters requested beyond budget R (=3, from prereg-constants.json),
//     when the cap is hit, then a canary asserts the run HALTS (no silent drop); findings below
//     the firing threshold ship SPECULATIVE with the "no independent refutation ran" stamp.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertHonestRefutation,
  assertRefutationSeam,
  assertCeiling,
  assertReasoningBeforeVerdict,
} from './harness.mjs';
import {
  REFUTER_BUDGET_R,
  REFUTER_FIRING_THRESHOLD,
  firesRefuter,
  isConfidenceWord,
  isNamedDefeater,
  composeRefutationProvenance,
  REFUTATION_PROVENANCE_KIND,
  NO_INDEPENDENT_REFUTATION_STAMP,
  SPECULATIVE_TIER,
  stampNoIndependentRefutation,
  hasNoIndependentRefutationStamp,
  vetElevationRefutation,
  RefuterBudgetHalt,
  assertRefuterBudget,
} from '../seam/refute.mjs';
import {
  emptyConformantOutput,
  elevationRefutedHonest,
  elevationConfidenceWordDefeater,
  elevationNamedDefeaterNoProvenance,
  elevationUnrefutedSpeculativeStamped,
  elevationSpeculativeNoStamp,
  elevationBelowThresholdSpeculative,
  elevationBelowThresholdPromising,
} from './fixtures.mjs';

// === B-honesty: the wave's headline scenario =============================================
test('B-honesty: an honestly-refuted elevation passes; a confidence-word "refutation" FAILS', () => {
  // Given a high-value elevation with a named concrete defeater + refutation_provenance, it passes.
  assert.doesNotThrow(
    () => assertHonestRefutation(elevationRefutedHonest()),
    'an elevation that survived an independent named-defeater refutation must pass'
  );
  // Given an elevation whose what_would_refute_it is a self-rated confidence word, B-honesty FAILS.
  assert.throws(
    () => assertHonestRefutation(elevationConfidenceWordDefeater()),
    /B-honesty: .*NAMED concrete defeater/,
    'a self-rated confidence word is not a refutation — it must FAIL (auto-downgrade to SPECULATIVE)'
  );
});

test('B-honesty: a named defeater with NO refutation_provenance FAILS (no independent refuter ran)', () => {
  assert.throws(
    () => assertHonestRefutation(elevationNamedDefeaterNoProvenance()),
    /B-honesty: .*refutation_provenance/,
    'a named defeater that no independent refuter actually tested must FAIL'
  );
});

test('B-honesty: the honest un-refuted floor passes; a silent un-stamped drop FAILS', () => {
  // A high-value elevation shipped SPECULATIVE WITH the stamp is the honest floor — it passes.
  assert.doesNotThrow(
    () => assertHonestRefutation(elevationUnrefutedSpeculativeStamped()),
    'a SPECULATIVE elevation carrying the "no independent refutation ran" stamp is honest and passes'
  );
  // The same finding stamped SPECULATIVE but WITHOUT the stamp is a silent drop — it FAILS.
  assert.throws(
    () => assertHonestRefutation(elevationSpeculativeNoStamp()),
    new RegExp(`B-honesty: .*${NO_INDEPENDENT_REFUTATION_STAMP}`),
    'a SPECULATIVE elevation with no honest stamp is a silent drop and must FAIL'
  );
});

test('B-honesty: a below-threshold elevation must ship SPECULATIVE; stamped above the floor FAILS', () => {
  // Below the firing threshold + SPECULATIVE + stamp ⇒ honest ⇒ passes.
  assert.doesNotThrow(
    () => assertHonestRefutation(elevationBelowThresholdSpeculative()),
    'a below-threshold finding shipped SPECULATIVE with the stamp is honest'
  );
  // Below the firing threshold but stamped PROMISING ⇒ over-claim ⇒ FAILS.
  assert.throws(
    () => assertHonestRefutation(elevationBelowThresholdPromising()),
    /B-honesty: .*below the refuter-firing threshold/,
    'a below-threshold finding earns no independent refuter and may not rise above SPECULATIVE'
  );
});

test('B-honesty: an item with no tier is not gated; a non-object throws', () => {
  assert.doesNotThrow(() => assertHonestRefutation({ id: 'x', value_if_true: 'high' }), 'no tier ⇒ not a tier-bearing elevation');
  assert.throws(() => assertHonestRefutation(null), /not an object/);
  assert.throws(() => assertHonestRefutation([]), /not an object/);
});

test('assertRefutationSeam: an honest output passes; one dishonest elevation FAILS the seam', () => {
  const ok = emptyConformantOutput();
  ok.elevations.push(elevationRefutedHonest());
  ok.elevations.push(elevationUnrefutedSpeculativeStamped());
  assert.doesNotThrow(() => assertRefutationSeam(ok), 'all elevations honestly refuted-or-stamped ⇒ seam passes');

  const bad = emptyConformantOutput();
  bad.elevations.push(elevationConfidenceWordDefeater());
  assert.throws(() => assertRefutationSeam(bad), /B-honesty/, 'one confidence-word "refutation" ⇒ seam FAILS');

  assert.doesNotThrow(() => assertRefutationSeam(emptyConformantOutput()), 'zero elevations ⇒ trivially passes');
});

// The honest, refuted elevation is consistent with the OTHER honesty gates too.
test('B-honesty: the honestly-refuted elevation also passes B-ceiling and reasoning-before-verdict', () => {
  const out = emptyConformantOutput(); // cross_model:false
  out.elevations.push(elevationRefutedHonest());
  assert.doesNotThrow(() => assertCeiling(out), 'PROMISING is at the single-family ceiling — B-ceiling passes');
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(elevationRefutedHonest(), '$.elevations[0]'));
});

// === the bounded-refuter budget: the NAMED canary (scenario 2) ===========================
test('bounded refuter budget: R is the frozen constant (=3); requesting beyond R HALTS (no silent drop)', () => {
  assert.equal(REFUTER_BUDGET_R, 3, 'R is the build-time frozen budget from prereg-constants.json');
  // At or under budget: allowed.
  assert.equal(assertRefuterBudget(0), 0);
  assert.equal(assertRefuterBudget(REFUTER_BUDGET_R), REFUTER_BUDGET_R, 'exactly R is within budget');
  // Over budget: the run HALTS — it does NOT silently take the first R.
  assert.throws(() => assertRefuterBudget(REFUTER_BUDGET_R + 1), RefuterBudgetHalt, 'over-budget must throw the HALT class');
  assert.throws(() => assertRefuterBudget(REFUTER_BUDGET_R + 1), /HALT/, 'the HALT is explicit (no silent drop)');
  // A bad argument is a programmer error, not a budget HALT.
  assert.throws(() => assertRefuterBudget(2.5), /non-negative integer/);
  assert.throws(() => assertRefuterBudget(-1), /non-negative integer/);
});

test('RefuterBudgetHalt carries the requested count and the budget for the orchestrator', () => {
  try {
    assertRefuterBudget(5);
    assert.fail('should have HALTed');
  } catch (e) {
    assert.ok(e instanceof RefuterBudgetHalt);
    assert.equal(e.requested, 5);
    assert.equal(e.budget, REFUTER_BUDGET_R);
  }
});

// === the refuter-firing threshold ========================================================
test('firesRefuter: fires on value_if_true ≥ high OR severity ≥ major; below ⇒ no refuter', () => {
  assert.equal(REFUTER_FIRING_THRESHOLD.value_if_true_at_least, 'high');
  assert.equal(REFUTER_FIRING_THRESHOLD.or_severity_at_least, 'major');
  assert.ok(firesRefuter({ value_if_true: 'high' }), 'high value fires');
  assert.ok(firesRefuter({ severity: 'major' }), 'major severity fires');
  assert.ok(firesRefuter({ severity: 'critical' }), 'critical severity fires');
  assert.ok(firesRefuter({ value_if_true: 'medium', severity: 'major' }), 'either axis fires');
  assert.ok(!firesRefuter({ value_if_true: 'medium', severity: 'minor' }), 'below both floors ⇒ no fire');
  assert.ok(!firesRefuter({ value_if_true: 'low' }), 'low value, no severity ⇒ no fire');
  assert.ok(!firesRefuter({}), 'nothing to fire on ⇒ no fire');
  assert.ok(!firesRefuter(null));
});

// === named concrete defeater vs self-rated confidence word ===============================
test('isConfidenceWord / isNamedDefeater: a self-rating is not a defeater; a concrete one is', () => {
  // Self-rated confidence words (whole value) are NOT named defeaters.
  for (const w of ['very confident', 'Likely', 'probably', 'I think', 'nothing', 'of course.']) {
    assert.ok(isConfidenceWord(w), `${JSON.stringify(w)} is a confidence self-rating`);
    assert.ok(!isNamedDefeater(w), `${JSON.stringify(w)} is not a named defeater`);
  }
  // A concrete falsifying observation IS a named defeater.
  const concrete = 'A benchmark on workload W showing tail latency regresses by >10%.';
  assert.ok(!isConfidenceWord(concrete));
  assert.ok(isNamedDefeater(concrete));
  // Empty / non-string ⇒ not a named defeater.
  assert.ok(!isNamedDefeater(''));
  assert.ok(!isNamedDefeater('   '));
  assert.ok(!isNamedDefeater(undefined));
});

// === composeRefutationProvenance: the typed independent named-defeater envelope ===========
test('composeRefutationProvenance: mints an independent named-defeater envelope; rejects a confidence word', () => {
  const prov = composeRefutationProvenance({
    defeater: 'A crash-injection test showing the last acked write is lost on replay.',
    survived: true,
  });
  assert.equal(prov.kind, REFUTATION_PROVENANCE_KIND);
  // W2b: the envelope no longer self-stamps `independent:true` — cross-family independence is DERIVED
  // at the vet seam against the unforgeable ledger, never asserted here.
  assert.equal(prov.independent, undefined, 'independence is DERIVED (ledger-bound), not self-stamped');
  assert.equal(prov.survived, true);
  assert.equal(prov.refuter_commission_id, null);
  assert.ok(prov.defeater.length > 0);
  // A bare confidence word cannot mint a provenance.
  assert.throws(() => composeRefutationProvenance({ defeater: 'very confident' }), /NAMED concrete defeater/);
  assert.throws(() => composeRefutationProvenance({ defeater: '' }), /NAMED concrete defeater/);
});

// === the auto-downgrade path (the "FAILS / auto-downgrades" done-when) =====================
test('vetElevationRefutation: keeps an honestly-refuted tier; auto-downgrades a confidence-word one', () => {
  // An honestly-refuted elevation keeps its tier (a fresh copy).
  const kept = vetElevationRefutation(elevationRefutedHonest());
  assert.equal(kept.tier, 'PROMISING');
  assert.doesNotThrow(() => assertHonestRefutation(kept), 'the kept elevation is still honest');

  // A confidence-word "refutation" is auto-downgraded to the stamped SPECULATIVE floor — and the
  // downgraded result then PASSES B-honesty (the over-claim is corrected, never silently dropped).
  const downgraded = vetElevationRefutation(elevationConfidenceWordDefeater());
  assert.equal(downgraded.tier, SPECULATIVE_TIER);
  assert.ok(hasNoIndependentRefutationStamp(downgraded));
  assert.doesNotThrow(() => assertHonestRefutation(downgraded), 'the auto-downgraded elevation is honest');

  // A named-defeater-but-no-provenance elevation is likewise auto-downgraded.
  const downgraded2 = vetElevationRefutation(elevationNamedDefeaterNoProvenance());
  assert.equal(downgraded2.tier, SPECULATIVE_TIER);
  assert.ok(hasNoIndependentRefutationStamp(downgraded2));
  assert.throws(() => vetElevationRefutation(null), /not an object/);
});

test('stampNoIndependentRefutation / hasNoIndependentRefutationStamp round-trip; reasoning-before-verdict survives', () => {
  const e = {
    id: 'e-rt',
    reasoning: 'reason first',
    verdict: 'then verdict',
    tier: 'PROMISING',
    value_if_true: 'high',
  };
  const stamped = stampNoIndependentRefutation(e);
  assert.equal(stamped.tier, SPECULATIVE_TIER);
  assert.equal(stamped.refutation_stamp, NO_INDEPENDENT_REFUTATION_STAMP);
  assert.ok(hasNoIndependentRefutationStamp(stamped));
  assert.ok(!hasNoIndependentRefutationStamp(e), 'the original is untouched (fresh object)');
  // Key order (reasoning before verdict) is preserved through the stamp.
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(stamped, '$.elevations[0]'));
  assert.throws(() => stampNoIndependentRefutation(null), /not an object/);
});
