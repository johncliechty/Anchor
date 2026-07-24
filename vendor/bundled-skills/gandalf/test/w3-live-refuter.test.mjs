// Gandalf advisor — Wave W3 canaries: the LIVE cross-family refuter orchestration.
//
// The PROOF that the live refuter (runtime/live-refuter.mjs) mints a claim-bound commission into the
// SAME per-run ledger applySeamPass resolves against, so a genuinely cross-family-refuted, SURVIVING
// elevation reaches GROUNDED with cross_model:true — while every honest-HALT path (refuter error /
// empty / a self-review route / an over-budget request) refuses to manufacture a cross-family grant.
//
// A STUB role-routed agent injects a known {defeater, survived} (or throws / abstains) so the full
// mint→gate path runs with ZERO subprocesses — NO live `agy` call (that is the separate human live proof).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCommissionLedger } from '../seam/commission-ledger.mjs';
import {
  isCrossFamilyRefutation,
  computeResultDigest,
  hasNoIndependentRefutationStamp,
  RefuterBudgetHalt,
  REFUTER_BUDGET_R,
} from '../seam/refute.mjs';
import { applySeamPass } from '../runtime/seam-pass.mjs';
import { assertIncrement1Conformant } from './harness.mjs';
import {
  runLiveRefutation,
  assertCrossFamilyRouting,
  familyFromDriver,
  SelfRefutationHalt,
  DEFAULT_REFUTER_ROUTES,
} from '../runtime/live-refuter.mjs';

// The concrete named defeater the stub refuter ATTEMPTS (a falsifying observation, never a confidence word).
const DEFEATER =
  'A replay benchmark on the production workload that reproduces a lost acked write after a mid-flush crash.';

/** A high-value elevation that FIRES the refuter (value_if_true:high) carrying its own named defeater
 *  (what_would_refute_it) but NO tier / NO provenance — exactly the raw shape the model emits. */
function firingElevation(over = {}) {
  return {
    id: 'e-live',
    value_if_true: 'high',
    rung: 'CORROBORATED',
    reasoning: 'A vetted SITUATE frame the author should adopt: ordered durable commit then apply.',
    verdict: 'adopt the WAL recovery ordering',
    what_would_refute_it:
      'A replay benchmark on the production workload showing the WAL ordering still loses the last acked ' +
      'write after a mid-flush crash.',
    ...over,
  };
}

function draftWith(elevations) {
  return {
    reasoning: 'A deep-think advisor pass emitting high-value elevations for live cross-family refutation.',
    verdict: 'grade against the live cross-family refuter',
    findings: [],
    nitpicks: [],
    elevations,
  };
}

const CROSS_FAMILY_ROUTES = { refuter: { driver: 'gemini-cli', model: 'Gemini 3.1 Pro (High)' }, default: { driver: 'claude' } };

// === POSITIVE: a fired elevation → claim-bound provenance minted into the run ledger → GROUNDED ======
test('W3 positive: a fired elevation gets a claim-bound provenance minted into the run ledger → reaches GROUNDED + cross_model:true', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-pos' });
  const calls = [];
  const agent = async (_prompt, opts) => { calls.push(opts); return { defeater: DEFEATER, survived: true, verdict: 'the claim survived the replay attempt' }; };

  const { draft, dispatch } = await runLiveRefutation(draftWith([firingElevation()]), {
    agent, ledger, routes: CROSS_FAMILY_ROUTES, drafterFamily: 'claude', refuterFamily: 'gemini',
  });

  // dispatched exactly once, under the refuter role, and minted a commission.
  assert.equal(calls.length, 1, 'the refuter was dispatched exactly once (one firing elevation)');
  assert.equal(calls[0].role, 'refuter', 'the dispatch used the refuter role');
  assert.equal(dispatch[0].minted, true, 'a commission was minted for the surviving refutation');

  // the minted provenance authenticates against the SAME ledger (claim-bound + family-distinct + digest-matched).
  const bound = draft.elevations[0];
  assert.ok(bound.refutation_provenance, 'the elevation carries the minted refutation_provenance');
  assert.equal(isCrossFamilyRefutation(bound, ledger.resolveCommission), true, 'the genuine refutation derives cross-family eligible');

  // grade against the SAME ledger's resolver → DERIVED GROUNDED + cross_model:true.
  const out = applySeamPass(draft, { resolveCommission: ledger.resolveCommission });
  assert.equal(out.cross_model, true, 'a genuine ledger-bound cross-family refutation DERIVES cross_model:true');
  assert.equal(out.elevations[0].tier, 'GROUNDED', 'the surviving cross-family elevation reaches the GROUNDED tier');
  assert.equal(out.elevations[0].cross_family_refuted, true);
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the GROUNDED cross-family output is fully conformant');
});

// === SHARED LEDGER: a different-ledger resolver is a false negative (the minter↔gate MUST share ONE) ==
test('W3 shared-ledger invariant: a mint resolved by a DIFFERENT ledger is a false negative (minter and gate must share ONE ledger)', async () => {
  const mintLedger = createCommissionLedger({ secret: 'w3-mint' });
  const otherLedger = createCommissionLedger({ secret: 'w3-other' });
  const agent = async () => ({ defeater: DEFEATER, survived: true, verdict: 'survived' });

  const { draft } = await runLiveRefutation(draftWith([firingElevation()]), { agent, ledger: mintLedger, routes: CROSS_FAMILY_ROUTES });

  // SAME ledger → authentic → GROUNDED.
  const outSame = applySeamPass(draft, { resolveCommission: mintLedger.resolveCommission });
  assert.equal(outSame.cross_model, true);
  assert.equal(outSame.elevations[0].tier, 'GROUNDED');

  // DIFFERENT ledger → the id was never minted there → cannot authenticate → capped at PROMISING.
  const outOther = applySeamPass(draft, { resolveCommission: otherLedger.resolveCommission });
  assert.equal(outOther.cross_model, false, 'a split minter/gate ledger makes every genuine mint a false negative');
  assert.equal(outOther.elevations[0].tier, 'PROMISING');
  assert.equal(outOther.elevations[0].cross_family_refuted, false);
});

// === HONEST-HALT: the refuter THROWS (agy down / non-attested) ⇒ SPECULATIVE, cross_model:false =======
test('W3 honest-HALT: a refuter that THROWS (agy down / non-attested) leaves the elevation SPECULATIVE + cross_model:false', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-throw' });
  const agent = async () => {
    throw new Error('Gemini attestation/transport failed: unattested_model — refuse to return a non-attested cross-family result');
  };

  const { draft, dispatch } = await runLiveRefutation(draftWith([firingElevation()]), { agent, ledger, routes: CROSS_FAMILY_ROUTES });
  assert.equal(dispatch[0].minted, false, 'no commission is minted when the refuter fails');
  assert.ok(!draft.elevations[0].refutation_provenance, 'no provenance is attached on a refuter failure');

  const out = applySeamPass(draft, { resolveCommission: ledger.resolveCommission });
  assert.equal(out.cross_model, false, 'a failed refuter can never lift cross_model');
  assert.equal(out.elevations[0].tier, 'SPECULATIVE', 'the elevation floors to the honest SPECULATIVE tier');
  assert.ok(hasNoIndependentRefutationStamp(out.elevations[0]), 'it carries the no-independent-refutation stamp');
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

// === HONEST-HALT: the refuter ABSTAINS / returns no explicit survived ⇒ survived NEVER defaulted true ==
test('W3 honest-HALT: a refuter that abstains (no explicit survived boolean) stays SPECULATIVE — survived is never defaulted true', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-empty' });
  // the gemini-cli ABSTAIN shape — no boolean survived, no named defeater.
  const agent = async () => ({ answerable: 'no', note: 'unparseable after one retry', findings: [] });

  const { draft, dispatch } = await runLiveRefutation(draftWith([firingElevation()]), { agent, ledger, routes: CROSS_FAMILY_ROUTES });
  assert.equal(dispatch[0].minted, false, 'an abstain mints nothing (survived is not an explicit boolean)');

  const out = applySeamPass(draft, { resolveCommission: ledger.resolveCommission });
  assert.equal(out.cross_model, false);
  assert.equal(out.elevations[0].tier, 'SPECULATIVE');
  assert.ok(hasNoIndependentRefutationStamp(out.elevations[0]));
});

// === ROUTING GUARD: a refuter role resolving to the DRAFTER family HALTs (never self-review) ==========
test('W3 routing guard: a refuter role resolving to the DRAFTER family (claude) HALTs — never self-review', async () => {
  // the pure guard: an explicit claude refuter route HALTs.
  assert.throws(
    () => assertCrossFamilyRouting({ routes: { refuter: { driver: 'claude' }, default: { driver: 'claude' } }, drafterFamily: 'claude' }),
    SelfRefutationHalt,
  );
  // routes.default = claude with NO refuter route also HALTs (the refuter role would fall to the drafter).
  assert.throws(
    () => assertCrossFamilyRouting({ routes: { default: { driver: 'claude' } }, drafterFamily: 'claude' }),
    SelfRefutationHalt,
  );
  // an empty/unknown driver fails CLOSED.
  assert.throws(() => assertCrossFamilyRouting({ routes: { refuter: {} }, drafterFamily: 'claude' }), SelfRefutationHalt);

  // via runLiveRefutation (async): it REJECTS before dispatching any refuter.
  const ledger = createCommissionLedger({ secret: 'w3-guard' });
  let dispatched = false;
  const agent = async () => { dispatched = true; return { defeater: DEFEATER, survived: true }; };
  await assert.rejects(
    runLiveRefutation(draftWith([firingElevation()]), {
      agent, ledger, routes: { refuter: { driver: 'claude' }, default: { driver: 'claude' } }, drafterFamily: 'claude',
    }),
    SelfRefutationHalt,
  );
  assert.equal(dispatched, false, 'the guard HALTs BEFORE any refuter dispatch (no self-review call is ever made)');

  // the valid cross-family route passes the guard and resolves to the non-drafter (gemini) family.
  assert.equal(assertCrossFamilyRouting({ routes: DEFAULT_REFUTER_ROUTES, drafterFamily: 'claude' }), 'gemini');
  assert.equal(familyFromDriver('gemini-cli'), 'gemini');
  assert.equal(familyFromDriver('claude'), 'claude');
});

// === REFUTED: a landed defeater (survived:false) drops the elevation (only-REFUTED-drops) =============
test('W3 refuted: a refuter whose named defeater LANDS (survived:false) drops the elevation (only-REFUTED-drops)', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-refuted' });
  const agent = async () => ({ defeater: DEFEATER, survived: false, verdict: 'the replay reproduced the lost write — the claim breaks' });

  const { draft, dispatch } = await runLiveRefutation(draftWith([firingElevation()]), { agent, ledger, routes: CROSS_FAMILY_ROUTES });
  assert.equal(dispatch[0].minted, true, 'the refutation is recorded (an independent refuter genuinely ran)');
  assert.equal(draft.elevations[0].rung, 'REFUTED', 'a landed defeater marks the elevation REFUTED');

  const out = applySeamPass(draft, { resolveCommission: ledger.resolveCommission });
  assert.equal(out.elevations.length, 0, 'the refuted elevation drops from the output');
  assert.equal(out.cross_model, false);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
});

// === BOUNDED BUDGET: more firing elevations than R HALTs (no silent drop) =============================
test('W3 bounded budget: more firing elevations than R HALTs (no silent drop of the excess)', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-budget' });
  const agent = async () => ({ defeater: DEFEATER, survived: true });
  const elevs = [];
  for (let i = 0; i < REFUTER_BUDGET_R + 1; i++) elevs.push(firingElevation({ id: `e-${i}` }));

  await assert.rejects(
    runLiveRefutation(draftWith(elevs), { agent, ledger, routes: CROSS_FAMILY_ROUTES }),
    RefuterBudgetHalt,
  );
});

// === MINT/GATE IDENTITY + PURITY: the mint binds the SAME identity the gate reads; input is untouched ==
test('W3 mint/gate identity: the commission is claim-bound to the exact elevation the gate reads, and the input draft is not mutated', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-identity' });
  const agent = async () => ({ defeater: DEFEATER, survived: true, verdict: 'survived' });

  const input = draftWith([firingElevation()]);
  const snapshot = JSON.parse(JSON.stringify(input));
  const { draft } = await runLiveRefutation(input, { agent, ledger, routes: CROSS_FAMILY_ROUTES });

  // PURITY: the input draft is untouched (no provenance leaks back onto the caller's object).
  assert.deepEqual(input, snapshot, 'runLiveRefutation does not mutate the input draft');

  // The ledger tuple's digest equals a recompute over the bound elevation's identity + the refuter content.
  const bound = draft.elevations[0];
  const prov = bound.refutation_provenance;
  const resolved = ledger.resolveCommission(prov.refuter_commission_id);
  assert.ok(resolved, 'the minted commission authenticates against the shared ledger');
  const recomputed = computeResultDigest({ elevation: bound, defeater: prov.defeater, survived: prov.survived, verdict: prov.verdict ?? null });
  assert.equal(resolved.result_digest, recomputed, 'the ledger digest is claim-bound to the exact elevation identity the gate recomputes');

  // A copied provenance pasted onto a DIFFERENT-identity elevation is rejected (replay protection carries through).
  const fabricated = { ...firingElevation({ id: 'e-fabricated', reasoning: 'a different fabricated claim that never earned a refutation' }), refutation_provenance: { ...prov } };
  assert.equal(isCrossFamilyRefutation(fabricated, ledger.resolveCommission), false, 'the claim-binding rejects a copied provenance on a different elevation');
});

// === B3 (2026-07-11): refuters dispatch CONCURRENTLY under the bounded cap =========================
// Pre-fix, the for-await loop serialized independent refuter calls — N × tens of seconds of avoidable
// wall-clock on every real Heavy run. The pool must genuinely overlap calls, respect the cap, keep
// output order by INDEX, and keep one bad refuter from sinking the batch.
test('B3: firing elevations dispatch concurrently (cap respected, order deterministic, per-item failure isolated)', async () => {
  const ledger = createCommissionLedger({ secret: 'w3-b3' });
  const N = 4;
  process.env.GANDALF_REFUTER_CONCURRENCY = '2';
  try {
    let inFlight = 0, peak = 0;
    const started = [];
    const agent = async (_prompt, opts) => {
      inFlight++; peak = Math.max(peak, inFlight);
      started.push(opts.label);
      await new Promise((r) => setTimeout(r, 20)); // hold the slot so overlap is observable
      inFlight--;
      if (opts.label === 'refuter:e-2') throw new Error('simulated agy failure');
      return { defeater: DEFEATER, survived: true, verdict: 'survived the attempt' };
    };
    const elevations = Array.from({ length: N }, (_, i) => firingElevation({ id: `e-${i}` }));
    const { draft, dispatch } = await runLiveRefutation(draftWith(elevations), {
      agent, ledger, routes: CROSS_FAMILY_ROUTES, drafterFamily: 'claude', refuterFamily: 'gemini',
      budget: N,
    });

    assert.ok(peak >= 2, `refuters overlapped (peak in-flight ${peak}) — the serial loop is gone`);
    assert.ok(peak <= 2, `the GANDALF_REFUTER_CONCURRENCY cap held (peak ${peak})`);
    assert.equal(dispatch.length, N);
    // Output order is by INDEX regardless of completion order.
    assert.deepEqual(dispatch.map((d) => d.id), ['e-0', 'e-1', 'e-2', 'e-3']);
    assert.deepEqual(draft.elevations.map((e) => e.id), ['e-0', 'e-1', 'e-2', 'e-3']);
    // The failed refuter stayed an honest SPECULATIVE floor; the others minted.
    assert.equal(dispatch[2].minted, false, 'the failed refuter minted nothing');
    assert.match(dispatch[2].reason, /simulated agy failure/);
    for (const k of [0, 1, 3]) assert.equal(dispatch[k].minted, true, `e-${k} minted normally`);
  } finally {
    delete process.env.GANDALF_REFUTER_CONCURRENCY;
  }
});
