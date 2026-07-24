// Gandalf runtime host — Wave 1 canary: the deterministic seam-pass composer.
//
// Asserts the Wave-1 done-when (planning/runtime-host/IMPLEMENTATION-PLAN.md):
//   • a full raw draft → applySeamPass → assertIncrement1Conformant PASSES;
//   • every output elevation is SPECULATIVE + carries the no-independent-refutation stamp;
//   • diagnose findings carry gandalf_core; anticipate findings have future_state_condition +
//     enabling_assumption + subject_cardinality === 1;
//   • a REFUTED finding/elevation is ABSENT (only-REFUTED-drops);
//   • risk_labels: one per present leg, each tier === PROMISING (single-family);
//   • a per-item degraded forces top-level degraded:true (B6);
//   • a malformed raw draft throws SeamPassInputError with NO partial output.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applySeamPass, SeamPassInputError, SCHEMA_VERSION } from '../runtime/seam-pass.mjs';
import { assertIncrement1Conformant } from './harness.mjs';
import {
  NO_INDEPENDENT_REFUTATION_STAMP,
  hasNoIndependentRefutationStamp,
} from '../seam/refute.mjs';
import { isDiagnoseCoreProvenanced } from '../seam/diagnose-core.mjs';
import { isForwardLookingAnticipation } from '../seam/anticipate.mjs';
import {
  rawDraftFull,
  rawDraftWithRefuted,
  rawDraftWithDegradedItem,
  rawDraftEmpty,
} from './runtime-fixtures.mjs';

test('a full raw draft seam-passes to an Increment-1-conformant output', () => {
  const out = applySeamPass(rawDraftFull());
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the seam-pass output must pass the full Increment-1 canary set');
  assert.equal(out.schema_version, SCHEMA_VERSION);
  assert.equal(out.cross_model, false, 'single-family by default');
  // reasoning precedes verdict in key order (the load-bearing invariant)
  const keys = Object.keys(out);
  assert.ok(keys.indexOf('reasoning') < keys.indexOf('verdict'), 'reasoning before verdict');
});

test('every output elevation is SPECULATIVE + carries the no-independent-refutation stamp (Tier-1 floor)', () => {
  const out = applySeamPass(rawDraftFull());
  assert.ok(out.elevations.length >= 2, 'both raw elevations survive (neither is REFUTED)');
  for (const e of out.elevations) {
    assert.equal(e.tier, 'SPECULATIVE', `elevation '${e.id}' is honestly SPECULATIVE (no independent refuter ran)`);
    assert.ok(hasNoIndependentRefutationStamp(e), `elevation '${e.id}' carries the no-independent-refutation stamp`);
    assert.equal(e.refutation_stamp, NO_INDEPENDENT_REFUTATION_STAMP);
  }
});

test('diagnose findings carry gandalf_core provenance; anticipate findings are bounded + forward-looking', () => {
  const out = applySeamPass(rawDraftFull());
  const diagnose = out.findings.filter((f) => f.kind === 'diagnose');
  assert.ok(diagnose.length >= 1, 'at least one diagnose finding survives');
  for (const d of diagnose) {
    assert.ok(isDiagnoseCoreProvenanced(d), `diagnose finding '${d.id}' carries gandalf_core (PROTOCOL v2)`);
  }
  const anticipate = out.findings.filter((f) => f.kind === 'anticipate');
  assert.ok(anticipate.length >= 1, 'at least one anticipate finding survives');
  for (const a of anticipate) {
    assert.equal(a.subject_cardinality, 1, 'bounded premortem cardinality 1');
    assert.ok(isForwardLookingAnticipation(a), 'populated future_state_condition + enabling_assumption');
    assert.ok(a.future_state_condition && a.future_state_condition.trim() !== '');
    assert.ok(a.enabling_assumption && a.enabling_assumption.trim() !== '');
  }
});

test('a REFUTED finding and a REFUTED elevation are ABSENT from the output (only-REFUTED-drops)', () => {
  const out = applySeamPass(rawDraftWithRefuted());
  const ids = [...out.findings, ...out.nitpicks, ...out.elevations].map((x) => x.id);
  assert.ok(!ids.includes('d-refuted'), 'the REFUTED finding dropped');
  assert.ok(!ids.includes('e-refuted'), 'the REFUTED elevation dropped');
  // the surviving non-REFUTED items remain
  assert.ok(out.findings.some((f) => f.id === 'd-1'), 'the surviving diagnose finding remains');
  assert.ok(out.elevations.some((e) => e.id === 'e-high'), 'the surviving high elevation remains');
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

test('risk_labels: exactly one entry per present leg, each tier === PROMISING (single-family)', () => {
  const out = applySeamPass(rawDraftFull());
  const legs = out.risk_labels.map((r) => r.leg);
  // the full draft reports all three legs
  assert.deepEqual([...legs].sort(), ['anticipate', 'diagnose', 'situate']);
  assert.equal(new Set(legs).size, legs.length, 'one entry per leg (no duplicate)');
  for (const r of out.risk_labels) {
    assert.equal(r.tier, 'PROMISING', `leg '${r.leg}' is capped at the single-family PROMISING ceiling`);
  }
});

test('a per-item degraded forces top-level degraded:true (B6 no silent degradation)', () => {
  const out = applySeamPass(rawDraftWithDegradedItem());
  assert.equal(out.degraded, true, 'the top level owns the per-item degradation');
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'an honestly-surfaced degradation still passes B6');
});

test('an empty raw draft produces the empty conformant output', () => {
  const out = applySeamPass(rawDraftEmpty());
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.elevations, []);
  assert.deepEqual(out.risk_labels, []);
  assert.equal(out.degraded, false);
});

test('genuinely malformed input throws SeamPassInputError with NO partial output', () => {
  // non-object inputs
  assert.throws(() => applySeamPass(null), SeamPassInputError);
  assert.throws(() => applySeamPass([]), SeamPassInputError);
  assert.throws(() => applySeamPass('nope'), SeamPassInputError);
  // missing reasoning (the headline a real read needs) still fails honestly
  assert.throws(() => applySeamPass({ verdict: 'v', findings: [], nitpicks: [], elevations: [] }), SeamPassInputError);
  // NOTE: imperfect-but-real model output is NO LONGER fatal — a missing item ARRAY is coerced to [],
  // a non-object item is skipped, and a half-formed anticipate is preserved as a GENERIC finding. That
  // input-leniency contract (the OUTPUT still passes the canary) is pinned in
  // test/runtime-robustness.test.mjs (the live-smoke lesson) — moved there, not dropped.
});

test('applySeamPass is PURE — it does not mutate the raw draft', () => {
  const raw = rawDraftFull();
  const snapshot = JSON.parse(JSON.stringify(raw));
  applySeamPass(raw);
  assert.deepEqual(raw, snapshot, 'the input raw draft is untouched');
});

test('W2b: the --cross-model INTENT flag never forces the stamp — cross_model is DERIVED, not caller-set', () => {
  // W2b anti-overclaim: the top-level cross_model stamp is DERIVED from a genuine ledger-bound,
  // family-distinct, digest-matched refutation — NEVER from the caller flag. rawDraftFull carries no
  // such provenance, so even with the intent flag SET the output stamp stays FALSE and every elevation
  // floats to the honest SPECULATIVE floor. The flag is recorded only as INTENT.
  const out = applySeamPass(rawDraftFull(), { cross_model: true });
  assert.equal(out.cross_model, false, 'the caller flag cannot manufacture cross_model — the stamp is derived');
  assert.equal(out.cross_model_requested, true, 'the flag is recorded only as INTENT, never as the stamp');
  for (const e of out.elevations) {
    assert.equal(e.tier, 'SPECULATIVE', 'no independent refuter ran ⇒ SPECULATIVE regardless of the flag');
    assert.ok(hasNoIndependentRefutationStamp(e));
  }
});
