// Gandalf advisor — Wave 5 canaries: ANTICIPATE (the Oranges-lens bounded premortem).
//
// Wave 5 done-when: a bounded premortem (subject_cardinality==1; each anticipation = a populated,
// well-formed `future_state_condition` + `enabling_assumption`); B3 + B9 pass and their negatives
// FAIL; the advisory cross-path-cost flag is wired ISOLATED (never in the gate). Each canary
// verifies a precise SHAPE/RUNG-CONSISTENCY invariant; label/semantic TRUTH stays the advisory
// layer's job (PRINCIPLE-D).
//
// The two frozen scenarios:
//   • Given an anticipate finding with a regret/counterfactual-cost field OR subject_cardinality>1,
//     when B3 runs, then it FAILS (Crucible's Oranges engine → route to a Crucible commission).
//   • Given a present-tense anticipate finding (no populated future-state + enabling assumption),
//     when B9 runs, then it FAILS.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertBoundedPremortem,
  assertForwardLooking,
  assertAnticipateSeam,
  assertReasoningBeforeVerdict,
  assertSchemaConformant,
} from './harness.mjs';
import {
  ANTICIPATE_KIND,
  BOUNDED_SUBJECT_CARDINALITY,
  ORANGES_ENGINE_FIELDS,
  hasOrangesEngineField,
  isForwardLookingAnticipation,
  composeAnticipation,
  commissionCrucible,
  CRUCIBLE_KIND,
  CROSS_PATH_COST_SIGNALS,
  flagCrossPathCostReasoning,
} from '../seam/anticipate.mjs';
import {
  emptyConformantOutput,
  anticipateFindingConformant,
  anticipateFindingRegretField,
  anticipateFindingMultiSubject,
  anticipateFindingPresentTense,
  anticipateFindingCrossPathProse,
} from './fixtures.mjs';

// === B3: premortem ≠ Crucible's Oranges-engine (scenario 1) ===============================
test('B3: a bounded conformant premortem passes; a regret/counterfactual-cost field FAILS', () => {
  // Given a bounded, forward-looking anticipation (cardinality 1, no regret field), B3 passes.
  assert.doesNotThrow(
    () => assertBoundedPremortem(anticipateFindingConformant()),
    'a bounded single-effort premortem with no Oranges-engine field must pass B3'
  );
  // Given an anticipate finding with a counterfactual-cost FIELD, B3 FAILS (route to Crucible).
  assert.throws(
    () => assertBoundedPremortem(anticipateFindingRegretField()),
    /B3 bounded-premortem: .*counterfactual_cost/,
    'a regret/counterfactual-cost field is Crucible\'s engine — it must FAIL B3'
  );
});

test('B3: subject_cardinality > 1 FAILS (a multi-path read is Crucible\'s engine)', () => {
  assert.throws(
    () => assertBoundedPremortem(anticipateFindingMultiSubject()),
    /B3 bounded-premortem: .*subject_cardinality/,
    'subject_cardinality > 1 is a multi-path read — it must FAIL B3'
  );
});

test('B3: every named Oranges-engine field is forbidden on an anticipate finding', () => {
  for (const f of ORANGES_ENGINE_FIELDS) {
    const finding = anticipateFindingConformant();
    finding[f] = 'cross-path cost pricing smuggled in via this field';
    assert.throws(
      () => assertBoundedPremortem(finding),
      new RegExp(`B3 bounded-premortem: .*'${f}'`),
      `the Oranges-engine field '${f}' must FAIL B3`
    );
  }
});

test('B3: a non-anticipate finding is not gated; a non-object throws', () => {
  assert.doesNotThrow(
    () => assertBoundedPremortem({ id: 'd', kind: 'diagnose', counterfactual_cost: 'x' }),
    'B3 only gates anticipate findings'
  );
  assert.throws(() => assertBoundedPremortem(null), /not an object/);
  assert.throws(() => assertBoundedPremortem([]), /not an object/);
});

// === B9: an anticipation is a not-yet-present future-state (scenario 2) ====================
test('B9: a forward-looking anticipation passes; a present-tense one FAILS', () => {
  assert.doesNotThrow(
    () => assertForwardLooking(anticipateFindingConformant()),
    'a populated future_state_condition + enabling_assumption must pass B9'
  );
  assert.throws(
    () => assertForwardLooking(anticipateFindingPresentTense()),
    /B9 forward-looking: .*present-tense/,
    'a present-tense finding (no future-state + enabling assumption) must FAIL B9'
  );
});

test('B9: missing EITHER the future-state condition or the enabling assumption FAILS', () => {
  const noFuture = anticipateFindingConformant();
  delete noFuture.future_state_condition;
  assert.throws(() => assertForwardLooking(noFuture), /B9 forward-looking/, 'no future_state_condition ⇒ FAIL');

  const noAssumption = anticipateFindingConformant();
  delete noAssumption.enabling_assumption;
  assert.throws(() => assertForwardLooking(noAssumption), /B9 forward-looking/, 'no enabling_assumption ⇒ FAIL');

  const emptyFuture = anticipateFindingConformant();
  emptyFuture.future_state_condition = '   ';
  assert.throws(() => assertForwardLooking(emptyFuture), /B9 forward-looking/, 'an empty future_state_condition ⇒ FAIL');
});

test('B9: a non-anticipate finding is not gated; a non-object throws', () => {
  assert.doesNotThrow(() => assertForwardLooking({ id: 's', kind: 'situate' }), 'B9 only gates anticipate findings');
  assert.throws(() => assertForwardLooking(null), /not an object/);
  assert.throws(() => assertForwardLooking([]), /not an object/);
});

// === the seam over a whole output =========================================================
test('assertAnticipateSeam: an honest output passes; one dishonest anticipation FAILS the seam', () => {
  const ok = emptyConformantOutput();
  ok.findings.push(anticipateFindingConformant());
  assert.doesNotThrow(() => assertAnticipateSeam(ok), 'a bounded, forward-looking anticipation ⇒ seam passes');

  const badB3 = emptyConformantOutput();
  badB3.findings.push(anticipateFindingRegretField());
  assert.throws(() => assertAnticipateSeam(badB3), /B3 bounded-premortem/, 'a regret field ⇒ seam FAILS on B3');

  const badB9 = emptyConformantOutput();
  badB9.findings.push(anticipateFindingPresentTense());
  assert.throws(() => assertAnticipateSeam(badB9), /B9 forward-looking/, 'a present-tense finding ⇒ seam FAILS on B9');

  assert.doesNotThrow(() => assertAnticipateSeam(emptyConformantOutput()), 'zero anticipate findings ⇒ trivially passes');
});

// The conformant anticipation is consistent with the other gates (shape + key order).
test('the conformant anticipation is schema-conformant and reasoning-before-verdict', () => {
  const out = emptyConformantOutput();
  out.findings.push(anticipateFindingConformant());
  assert.doesNotThrow(() => assertSchemaConformant(out), 'the anticipation keeps the committed output shape');
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(anticipateFindingConformant(), '$.findings[0]'));
});

// === the predicates and the compose seam =================================================
test('hasOrangesEngineField / isForwardLookingAnticipation: the B3 + B9 cores', () => {
  assert.equal(BOUNDED_SUBJECT_CARDINALITY, 1);
  assert.ok(!hasOrangesEngineField(anticipateFindingConformant()), 'a clean premortem has no Oranges-engine field');
  assert.ok(hasOrangesEngineField(anticipateFindingRegretField()), 'a counterfactual-cost field is detected');
  assert.ok(hasOrangesEngineField(anticipateFindingMultiSubject()), 'subject_cardinality > 1 is detected');
  assert.ok(isForwardLookingAnticipation(anticipateFindingConformant()), 'a populated future-state is forward-looking');
  assert.ok(!isForwardLookingAnticipation(anticipateFindingPresentTense()), 'a present-tense finding is not forward-looking');
});

test('composeAnticipation: mints a bounded, forward-looking, reasoning-before-verdict finding', () => {
  const f = composeAnticipation({
    id: 'a-composed',
    future_state_condition: 'the index rebuild blocks writes once the table crosses 1e9 rows',
    enabling_assumption: 'the table keeps growing and the rebuild stays online-but-blocking',
  });
  assert.equal(f.kind, ANTICIPATE_KIND);
  assert.equal(f.subject_cardinality, BOUNDED_SUBJECT_CARDINALITY);
  assert.equal(f.rung, 'UNVERIFIED', 'an anticipation about a not-yet-present future is honestly UNVERIFIED');
  assert.doesNotThrow(() => assertBoundedPremortem(f), 'a composed anticipation passes B3');
  assert.doesNotThrow(() => assertForwardLooking(f), 'a composed anticipation passes B9');
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(f, '$.findings[0]'), 'reasoning precedes verdict');
  // Defence in depth: compose refuses to carry an Oranges-engine field, and requires the fields.
  assert.throws(() => composeAnticipation({ id: 'x', enabling_assumption: 'y' }), /future_state_condition/);
  assert.throws(() => composeAnticipation({ id: 'x', future_state_condition: 'y' }), /enabling_assumption/);
});

test('commissionCrucible: mints a typed Crucible commission envelope for a cross-path-cost task', () => {
  const c = commissionCrucible({ question: 'Price the counterfactual cost across plans A/B/C and refute to convergence.' });
  assert.equal(c.skill, CRUCIBLE_KIND);
  assert.ok(c.question.length > 0);
  assert.equal(c.crucible_commission_id, null, 'honor-system commission-id in Increment 1');
  assert.throws(() => commissionCrucible({ question: '' }), /non-empty question/);
});

// === the ADVISORY cross-path-cost flag is ISOLATED from the gate (PRINCIPLE-D) =============
test('the advisory cross-path-cost flag is ISOLATED: the gate PASSES a cross-path-prose finding the advisory layer flags', () => {
  const finding = anticipateFindingCrossPathProse();

  // The DETERMINISTIC GATE is blind to cross-path reasoning carried only in prose: a schema-clean
  // anticipation (cardinality 1, no regret field, populated forward-looking fields) PASSES B3 + B9.
  assert.doesNotThrow(() => assertBoundedPremortem(finding), 'cross-path PROSE is not a B3 syntactic violation');
  assert.doesNotThrow(() => assertForwardLooking(finding), 'the finding is still forward-looking ⇒ passes B9');
  const out = emptyConformantOutput();
  out.findings.push(finding);
  assert.doesNotThrow(() => assertAnticipateSeam(out), 'the full anticipate seam passes — the gate never consults the advisory flag');

  // The ADVISORY layer (PRINCIPLE-D, isolated) is what catches the residual and routes it out.
  const advisory = flagCrossPathCostReasoning(finding);
  assert.equal(advisory.advisory, true);
  assert.equal(advisory.flagged, true, 'the advisory layer flags the cross-path prose');
  assert.equal(advisory.route_to, CRUCIBLE_KIND, 'the advisory recommendation is to route to a Crucible commission');
  assert.ok(advisory.signals.length > 0, 'the advisory flag reports the prose signals it matched');
});

test('flagCrossPathCostReasoning: a clean premortem is NOT flagged; the flag never throws', () => {
  const clean = flagCrossPathCostReasoning(anticipateFindingConformant());
  assert.equal(clean.flagged, false, 'a clean bounded premortem is not flagged');
  assert.equal(clean.route_to, null);
  // Pure / never throws, even on junk.
  assert.doesNotThrow(() => flagCrossPathCostReasoning(null));
  assert.doesNotThrow(() => flagCrossPathCostReasoning([]));
  assert.equal(flagCrossPathCostReasoning(null).flagged, false);
  assert.ok(Array.isArray(CROSS_PATH_COST_SIGNALS) && CROSS_PATH_COST_SIGNALS.length > 0);
});
