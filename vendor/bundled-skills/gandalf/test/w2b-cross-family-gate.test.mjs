// Gandalf advisor — Wave W2b canaries: the anti-overclaim RUNTIME cross-family gate.
//
// The PROOF that `cross_model:true` and the cross-family (GROUNDED) tier are DERIVED at the runtime
// seam from a genuine ledger-bound, family-distinct, digest-matched refutation — NEVER from the
// `--cross-model` caller flag or a self-asserted envelope field. Every canary here is an ADVERSARIAL
// negative (a forged / self-family / digest-mismatch / meta-isolated attempt CANNOT reach the tier)
// plus the one positive (a genuinely-minted cross-family refutation CAN).
//
// The gate under test:
//   • seam/refute.isCrossFamilyRefutation  — DERIVES eligibility from the injected ledger resolver;
//   • seam/refute.vetElevationRefutation   — stamps the derived `cross_family_refuted`;
//   • runtime/seam-pass.applySeamPass       — derives the top-level `cross_model` + the per-elevation
//                                             ceiling from that flag, never from the caller intent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCommissionLedger } from '../seam/commission-ledger.mjs';
import {
  computeResultDigest,
  vetElevationRefutation,
  isCrossFamilyRefutation,
} from '../seam/refute.mjs';
import { applySeamPass } from '../runtime/seam-pass.mjs';
import { assertIncrement1Conformant } from './harness.mjs';
import { rawDraftFull } from './runtime-fixtures.mjs';

const DEFEATER =
  'A replay benchmark on the production workload showing the WAL ordering still loses the last acked write after a mid-flush crash.';
const OTHER_DEFEATER =
  'A profiler trace showing the hot path is allocation-bound, not lock-bound, so the frame does not apply.';

/** Build a high-value elevation REQUESTING the GROUNDED (cross-family) tier, carrying a refutation
 *  provenance whose commission-id the ledger will (or will not) authenticate. `mintDefeater` is the
 *  content the LEDGER entry is bound to; `envelopeDefeater` is the content the elevation PRESENTS —
 *  a mismatch is the digest-mismatch attack. `forgedId` bypasses minting (an unminted/forged id). */
function buildGroundedElevation({
  led,
  drafter = 'fable-5',
  refuter = 'gemini',
  envelopeDefeater = DEFEATER,
  mintDefeater = DEFEATER,
  survived = true,
  verdict = null,
  forgedId = null,
}) {
  // The elevation IDENTITY (id + reasoning + named defeater) is fixed FIRST, so the ledger digest can be
  // CLAIM-BOUND to it exactly as the runtime mint path would bind it (the gate re-derives over the same
  // identity). This is what makes a copied provenance fail on a DIFFERENT elevation (the REPLAY canary).
  const elevation = {
    id: 'e-xfam',
    tier: 'GROUNDED', // the elevation ASKS for the cross-family tier — the gate decides if it earns it
    value_if_true: 'high',
    rung: 'CORROBORATED',
    reasoning: 'A SITUATE-derived frame that a refuter attacked with a concrete named defeater.',
    verdict: 'a suggestion offered as surviving an independent cross-family named-defeater refutation',
    what_would_refute_it: envelopeDefeater,
  };
  // The ledger binds the digest over the elevation's identity + the MINT refuter content.
  const mintDigest = computeResultDigest({ elevation, defeater: mintDefeater, survived, verdict });
  const id = forgedId ?? led.mintCommission({ drafter_family: drafter, refuter_family: refuter, result_digest: mintDigest });
  elevation.refutation_provenance = {
    kind: 'independent-named-defeater',
    defeater: envelopeDefeater,
    survived,
    verdict,
    drafter_family: drafter,
    refuter_family: refuter,
    result_digest: mintDigest, // the (copied) ledger digest — the gate re-derives from identity+content anyway
    refuter_commission_id: id,
  };
  return elevation;
}

function draftWith(elevation) {
  return {
    reasoning: 'A deep-think advisor pass emitting one high-value elevation for honest cross-family grading.',
    verdict: 'one elevation to grade against the cross-family gate',
    findings: [],
    nitpicks: [],
    elevations: [elevation],
  };
}

// === POSITIVE: a genuine minted, family-distinct, digest-matching refutation REACHES GROUNDED ======
test('W2b positive: a genuine ledger-bound family-distinct digest-matched refutation reaches GROUNDED + sets cross_model:true', () => {
  const led = createCommissionLedger({ secret: 'w2b-positive' });
  const elevation = buildGroundedElevation({ led }); // drafter fable-5 ≠ refuter gemini, digest matches, real id

  // seam-level: the deriver says YES.
  assert.equal(isCrossFamilyRefutation(elevation, led.resolveCommission), true, 'a genuine cross-family refutation is derived eligible');
  const vetted = vetElevationRefutation(elevation, { resolveCommission: led.resolveCommission });
  assert.equal(vetted.cross_family_refuted, true, 'the vet seam stamps the derived cross-family flag');

  // runtime-level: the tier reaches GROUNDED and the top-level stamp is DERIVED true.
  const out = applySeamPass(draftWith(elevation), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, true, 'a genuine cross-family refutation DERIVES cross_model:true');
  assert.equal(out.elevations.length, 1);
  assert.equal(out.elevations[0].tier, 'GROUNDED', 'the elevation reaches the cross-family GROUNDED tier');
  assert.equal(out.elevations[0].cross_family_refuted, true);
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the GROUNDED cross-family output is fully conformant');
});

// === FORGED / UNMINTED id: cannot reach GROUNDED and does not lift cross_model =====================
test('W2b canary: a forged / unminted commission-id CANNOT reach GROUNDED and leaves cross_model:false', () => {
  const led = createCommissionLedger({ secret: 'w2b-forged' });
  led.mintCommission({ drafter_family: 'fable-5', refuter_family: 'gemini', result_digest: 'a'.repeat(64) }); // ledger non-empty, but this id is unrelated
  const elevation = buildGroundedElevation({ led, forgedId: 'gcl1.forged.forged' }); // never minted here

  assert.equal(isCrossFamilyRefutation(elevation, led.resolveCommission), false, 'a forged id resolves to null ⇒ not cross-family');

  const out = applySeamPass(draftWith(elevation), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, false, 'a forged commission-id can NEVER manufacture cross_model:true');
  assert.equal(out.elevations[0].tier, 'PROMISING', 'the forged attempt is capped at the single-family PROMISING ceiling');
  assert.equal(out.elevations[0].cross_family_refuted, false);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

// === SELF-FAMILY provenance (drafter === refuter, validly minted): cannot reach cross-family ========
test('W2b canary: a self-family (drafter === refuter) provenance — even validly minted — CANNOT reach cross-family', () => {
  const led = createCommissionLedger({ secret: 'w2b-selffamily' });
  const elevation = buildGroundedElevation({ led, drafter: 'fable-5', refuter: 'fable-5' }); // same family, real id, digest matches

  assert.equal(isCrossFamilyRefutation(elevation, led.resolveCommission), false, 'a same-family refutation earns no independent origin');

  const out = applySeamPass(draftWith(elevation), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, false, 'a same-family refutation cannot cross the single-family ceiling');
  assert.equal(out.elevations[0].tier, 'PROMISING', 'capped at PROMISING (drafter and refuter are the same family)');
  assert.equal(out.elevations[0].cross_family_refuted, false);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

// === DIGEST-MISMATCH provenance: the ledger entry is bound to DIFFERENT content ⇒ cannot reach ======
test('W2b canary: a digest-mismatch provenance (ledger bound to different content) CANNOT reach cross-family', () => {
  const led = createCommissionLedger({ secret: 'w2b-digest' });
  // The ledger binds a digest over OTHER_DEFEATER, but the elevation PRESENTS DEFEATER — the gate
  // re-derives the digest from the presented content and finds it does not match the ledger tuple.
  const elevation = buildGroundedElevation({ led, envelopeDefeater: DEFEATER, mintDefeater: OTHER_DEFEATER });

  assert.equal(isCrossFamilyRefutation(elevation, led.resolveCommission), false, 'the recomputed content digest does not match the ledger digest');

  const out = applySeamPass(draftWith(elevation), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, false, 'a borrowed/replayed ledger id (wrong content) cannot manufacture cross_model:true');
  assert.equal(out.elevations[0].tier, 'PROMISING', 'capped at PROMISING (the ledger digest binds different content)');
  assert.equal(out.elevations[0].cross_family_refuted, false);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

// === META-ISOLATION: a single-family run (no ledger-bound provenance anywhere) can NEVER cross ======
test('W2b META-ISOLATION: a single-family run with NO ledger-bound provenance can NEVER produce cross_model:true or GROUNDED', () => {
  const led = createCommissionLedger({ secret: 'w2b-meta' });
  // rawDraftFull carries three legs and two elevations, NONE of which has a ledger-bound refutation.
  // Assert at the applySeamPass/runtime level (not merely a fixture) that no path yields cross-family —
  // and that even SETTING the caller intent flag cannot manufacture it.
  const outDefault = applySeamPass(rawDraftFull(), { resolveCommission: led.resolveCommission });
  const outIntent = applySeamPass(rawDraftFull(), { cross_model: true, resolveCommission: led.resolveCommission });

  for (const out of [outDefault, outIntent]) {
    assert.equal(out.cross_model, false, 'no ledger-bound refutation anywhere ⇒ cross_model is DERIVED false');
    for (const e of out.elevations) {
      assert.notEqual(e.tier, 'GROUNDED', `elevation '${e.id}' can never reach GROUNDED in a single-family run`);
    }
    for (const r of out.risk_labels) {
      assert.notEqual(r.tier, 'GROUNDED', `risk_label leg '${r.leg}' can never reach GROUNDED in a single-family run`);
    }
    assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the meta-isolated output stays fully conformant');
  }
  // The intent flag is recorded ONLY as intent — it never becomes the stamp.
  assert.equal(outIntent.cross_model_requested, true, 'the --cross-model flag records INTENT only');
  assert.equal(outIntent.cross_model, false, 'INTENT ≠ the derived stamp');
});

// === REPLAY (cross-elevation): a commission minted for elevation A CANNOT authenticate a fabricated B =
// The adversarial-review hole: the digest once hashed ONLY the refuter output {defeater, survived,
// verdict} — NOT the elevation being refuted — so a drafter could copy a legitimately-minted
// commission_id + provenance off a REAL cross-family refutation of finding A and paste it onto a
// FABRICATED finding B; the ledger resolved, families differed, and the copied digest matched ⇒ B
// falsely authenticated as cross-family. The claim-binding (elevationIdentity inside computeResultDigest)
// closes it: the gate re-derives the digest over B's OWN identity, which no longer matches A's ledger tuple.
test('W2b REPLAY canary: a provenance minted for elevation A CANNOT authenticate a fabricated elevation B', () => {
  const led = createCommissionLedger({ secret: 'w2b-replay' });

  // A: a GENUINE, family-distinct, digest-bound cross-family refutation of a real finding.
  const elevationA = buildGroundedElevation({ led });
  assert.equal(isCrossFamilyRefutation(elevationA, led.resolveCommission), true, 'A is a genuine cross-family refutation (no false-negative)');

  // B: a FABRICATED finding (DIFFERENT id + reasoning) onto which the attacker pastes A's provenance
  // VERBATIM — same commission_id, same ledger digest, even the same copied defeater text.
  const elevationB = {
    id: 'e-fabricated-B',
    tier: 'GROUNDED',
    value_if_true: 'high',
    rung: 'CORROBORATED',
    reasoning: 'A DIFFERENT, fabricated claim that never earned an independent cross-family refutation.',
    verdict: 'a fabricated suggestion masquerading as cross-family via a copied commission-id',
    what_would_refute_it: elevationA.what_would_refute_it,          // copy the defeater text too …
    refutation_provenance: { ...elevationA.refutation_provenance }, // … and the ENTIRE provenance envelope
  };

  // The claim-bound digest re-derives over B's identity (id + reasoning) ⇒ mismatch ⇒ the replay fails.
  assert.equal(isCrossFamilyRefutation(elevationB, led.resolveCommission), false, "A's commission is bound to A's identity — it cannot authenticate B");

  const out = applySeamPass(draftWith(elevationB), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, false, 'a replayed commission-id can NEVER manufacture cross_model:true on B');
  assert.equal(out.elevations[0].tier, 'PROMISING', 'the fabricated B is capped at the single-family PROMISING ceiling — it cannot reach GROUNDED');
  assert.equal(out.elevations[0].cross_family_refuted, false);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

test('W2b REPLAY no-false-negative: elevation A with its OWN claim-bound provenance still reaches GROUNDED', () => {
  const led = createCommissionLedger({ secret: 'w2b-replay-pos' });
  const elevationA = buildGroundedElevation({ led });
  assert.equal(isCrossFamilyRefutation(elevationA, led.resolveCommission), true, 'the claim-binding does not reject a genuine refutation');
  const out = applySeamPass(draftWith(elevationA), { resolveCommission: led.resolveCommission });
  assert.equal(out.cross_model, true, 'A on its OWN elevation still derives cross_model:true');
  assert.equal(out.elevations[0].tier, 'GROUNDED', 'A still reaches the cross-family GROUNDED tier');
  assert.equal(out.elevations[0].cross_family_refuted, true);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});
