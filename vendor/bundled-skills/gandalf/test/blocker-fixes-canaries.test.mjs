// Gandalf advisor — adversarial-review BLOCKER-fix canaries.
//
// Two holes an adversarial review found in the cross-family gate, each pinned here:
//
//   • BLOCKER 1 — INCOMPLETE CLAIM-BINDING (a replay variant). elevationIdentity() once bound only
//     {id, reasoning, what_would_refute_it}, OMITTING the substantive payload (verdict/severity/
//     value_if_true). A drafter could take a genuinely-refuted elevation A (+ its valid commission)
//     and build B with the SAME id/reasoning/what_would_refute_it but a FABRICATED verdict + inflated
//     severity → the digest still matched → B inherited GROUNDED under a malicious verdict. The fix
//     binds verdict/severity/value_if_true into the identity, so B's recomputed digest no longer
//     matches the ledger tuple. CANARY: B is rejected (digest mismatch); A still passes (no false neg).
//
//   • BLOCKER 2 — RISK-LABEL LAUNDERING (run-level flag lifts the whole draft). composeRiskLabels()
//     once read the global output.cross_model to lift EVERY leg's tier ceiling, so one genuine
//     cross-family elevation flipped the flag and laundered every unrelated/fabricated finding's risk
//     label up to GROUNDED. The fix keys each leg off its OWN cross_family_refuted (findings carry no
//     commission provenance ⇒ never cross-family). CANARY: one genuine cross-family elevation reaches
//     GROUNDED, but the fabricated findings' risk labels stay at PROMISING and the fabricated
//     elevations stay SPECULATIVE — nothing launders up.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCommissionLedger } from '../seam/commission-ledger.mjs';
import { computeResultDigest, isCrossFamilyRefutation } from '../seam/refute.mjs';
import { applySeamPass } from '../runtime/seam-pass.mjs';
import { assertIncrement1Conformant } from './harness.mjs';
import { rawDraftFull } from './runtime-fixtures.mjs';

const NAMED_DEFEATER =
  'A replay benchmark on the production workload showing the WAL ordering still loses the last acked write after a mid-flush crash.';
const REFUTER_VERDICT = 'the claim survived the attempted replay defeater';

/** Build a GENUINE, family-distinct, digest-bound cross-family elevation: its ledger digest is
 *  claim-bound to the elevation's FULL identity (id + reasoning + named defeater + payload
 *  verdict/severity/value_if_true) via computeResultDigest, and minted into `led`. */
function buildGenuineElevation(led, over = {}) {
  const elevation = {
    id: 'e-genuine-xfam',
    tier: 'GROUNDED', // ASKS for the cross-family tier — the gate decides if it earns it
    value_if_true: 'high',
    severity: 'major',
    rung: 'CORROBORATED',
    reasoning: 'A vetted SITUATE frame the author should adopt: ordered durable commit then apply.',
    verdict: 'adopt the WAL recovery ordering (the genuine, refuted claim)',
    what_would_refute_it: NAMED_DEFEATER,
    ...over,
  };
  const digest = computeResultDigest({
    elevation,
    defeater: elevation.what_would_refute_it,
    survived: true,
    verdict: REFUTER_VERDICT,
  });
  const id = led.mintCommission({ drafter_family: 'claude', refuter_family: 'gemini', result_digest: digest });
  elevation.refutation_provenance = {
    kind: 'independent-named-defeater',
    defeater: elevation.what_would_refute_it,
    survived: true,
    verdict: REFUTER_VERDICT,
    drafter_family: 'claude',
    refuter_family: 'gemini',
    result_digest: digest,
    refuter_commission_id: id,
  };
  return elevation;
}

// === CANARY 1: identity-completeness (BLOCKER 1) ==================================================
test('identity-completeness: a valid provenance copied onto B with a DIFFERENT verdict (+ inflated severity) is rejected; A still passes', () => {
  const led = createCommissionLedger({ secret: 'canary-identity-completeness' });

  // A: a genuine cross-family refutation, digest claim-bound to A's FULL identity.
  const A = buildGenuineElevation(led);
  assert.equal(isCrossFamilyRefutation(A, led.resolveCommission), true, 'A with its own claim-bound provenance passes (no false negative)');

  // B: SAME {id, reasoning, what_would_refute_it} — but a FABRICATED verdict and INFLATED severity,
  // with A's ENTIRE provenance envelope (same commission-id, same ledger digest, same defeater) pasted on.
  const B = {
    ...A,
    verdict: 'a FABRICATED, malicious verdict smuggled under A\'s valid cross-family proof',
    severity: 'critical', // inflated from A's 'major'
    refutation_provenance: { ...A.refutation_provenance },
  };

  // Because the identity now binds verdict + severity, the gate recomputes B's digest over B's identity —
  // which no longer matches A's ledger tuple ⇒ the replay is rejected.
  assert.equal(
    isCrossFamilyRefutation(B, led.resolveCommission),
    false,
    "A's commission is bound to A's payload identity — a fabricated verdict / inflated severity cannot ride A's proof"
  );

  // Sanity: A is genuinely unchanged and still authenticates (the binding did not over-reject).
  assert.equal(isCrossFamilyRefutation(A, led.resolveCommission), true, 'A remains a genuine cross-family refutation');
});

// === CANARY 2: laundering (BLOCKER 2) ============================================================
test('laundering: ONE genuine cross-family elevation reaches GROUNDED, but fabricated findings/elevations do NOT launder up', () => {
  const led = createCommissionLedger({ secret: 'canary-laundering' });

  // A representative draft with three real legs (diagnose/situate/anticipate) + un-refuted elevations …
  const draft = rawDraftFull();
  // … plus ONE genuine cross-family elevation (the only item that earns GROUNDED) …
  draft.elevations.push(buildGenuineElevation(led));
  // … plus a FABRICATED high-value elevation with NO valid provenance (asks GROUNDED, earns nothing).
  draft.elevations.push({
    id: 'e-fabricated',
    tier: 'GROUNDED',
    value_if_true: 'high',
    rung: 'CORROBORATED',
    reasoning: 'A fabricated claim that never earned an independent cross-family refutation.',
    verdict: 'a fabricated suggestion masquerading as cross-family',
    what_would_refute_it: 'some named-sounding defeater with no minted commission behind it',
  });

  const out = applySeamPass(draft, { resolveCommission: led.resolveCommission });

  // The run-level indicator is honestly true (≥1 genuine cross-family refutation occurred) …
  assert.equal(out.cross_model, true, 'the genuine cross-family refutation honestly sets the run-level cross_model');

  // … the genuine elevation — and ONLY it — reaches GROUNDED.
  const genuine = out.elevations.find((e) => e.id === 'e-genuine-xfam');
  assert.ok(genuine, 'the genuine elevation is present');
  assert.equal(genuine.tier, 'GROUNDED', 'the genuine cross-family elevation reaches GROUNDED');
  assert.equal(genuine.cross_family_refuted, true);

  // Every OTHER elevation (the un-refuted + the fabricated) stays at the honest SPECULATIVE floor.
  for (const e of out.elevations) {
    if (e.id === 'e-genuine-xfam') continue;
    assert.equal(e.tier, 'SPECULATIVE', `elevation '${e.id}' earns no cross-family origin ⇒ stays SPECULATIVE (never GROUNDED)`);
    assert.notEqual(e.tier, 'GROUNDED');
  }

  // THE FIX: the fabricated findings' risk labels do NOT launder up off the run-level flag — every
  // findings leg stays at its un-refuted PROMISING ceiling (findings carry no commission provenance).
  assert.ok(out.risk_labels.length >= 1, 'the reported legs are labelled');
  for (const r of out.risk_labels) {
    assert.equal(r.tier, 'PROMISING', `risk_label leg '${r.leg}' stays at the un-refuted PROMISING ceiling — it cannot launder to GROUNDED`);
    assert.notEqual(r.tier, 'GROUNDED');
  }

  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the mixed genuine/fabricated output is fully conformant');
});
