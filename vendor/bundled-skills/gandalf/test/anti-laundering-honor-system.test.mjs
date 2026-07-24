// Gandalf advisor — Wave 7: the anti-laundering HONOR-SYSTEM canary (WITHOUT-ledger ship-state).
//
// Wave 7 done-when scenario: "Given the WITHOUT-ledger ship-state, When v1 is assessed, Then the
// anti-laundering law runs as the honor-system checklist and a canary asserts B2′/B7′ stamped
// BLOCKED-this-cycle + non-gating."
//
// Two halves are proven here:
//   • STATUS — B2′/B7′ are stamped BLOCKED-this-cycle and gating:false, with the named external
//     precondition (the Phase-0 commission-id ledger, Increment 2) that would unblock them; and the
//     anti-laundering law is present as the honor-system checklist.
//   • NON-GATING (the honest gap, surfaced not hidden) — a FORGED / unresolvable commission-id rides
//     FREE through the deterministic gate: assertIncrement1Conformant PASSES on a v1 output carrying
//     a forged researchprime_commission_id, because in Increment 1 there is no ledger to resolve it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertIncrement1Conformant } from './harness.mjs';
import { gandalfV1FullOutput, gandalfV1ForgedCommissionIdHonorSystem } from './fixtures.mjs';
import {
  antiLaunderingStatus,
  contentBindingIsNonGating,
  resolveCommissionId,
  ANTI_LAUNDERING_CHECKLIST,
  SHIP_STATE_WITHOUT_LEDGER,
  COMMITTED_SHIP_STATE,
  BLOCKED_THIS_CYCLE,
  UNRESOLVABLE_NO_LEDGER,
  LEDGER_PRECONDITION,
} from '../seam/anti-laundering.mjs';

// === STATUS: B2′/B7′ stamped BLOCKED-this-cycle + non-gating ===================================
test('anti-laundering: the committed ship-state is WITHOUT-ledger', () => {
  assert.equal(COMMITTED_SHIP_STATE, SHIP_STATE_WITHOUT_LEDGER, 'Gandalf v1 ships on the honor-system path');
  assert.equal(antiLaunderingStatus().ship_state, SHIP_STATE_WITHOUT_LEDGER);
  assert.equal(antiLaunderingStatus().anti_laundering_law, 'honor-system');
});

test('anti-laundering: B2′ and B7′ are stamped BLOCKED-this-cycle and NON-GATING', () => {
  const s = antiLaunderingStatus();
  for (const [name, b] of [['B2′', s.B2_prime], ['B7′', s.B7_prime]]) {
    assert.equal(b.status, BLOCKED_THIS_CYCLE, `${name} is stamped BLOCKED-this-cycle`);
    assert.equal(b.gating, false, `${name} is NON-GATING in Increment 1`);
    assert.equal(b.unblocked_by, LEDGER_PRECONDITION, `${name} names the external precondition that unblocks it`);
  }
  assert.ok(contentBindingIsNonGating(), 'the content-binding canaries are non-gating this cycle');
});

test('anti-laundering: the honor-system checklist IS the anti-laundering law (every clause present)', () => {
  // The four named clauses of the law (MASTER-PLAN.md) are all present in the checklist.
  const laws = ANTI_LAUNDERING_CHECKLIST.map((c) => c.law).join(' | ');
  assert.match(laws, /carry rung at-or-below source/);
  assert.match(laws, /preserve the honesty_stamp/);
  assert.match(laws, /same-family ⇒ no independent origin/);
  assert.match(laws, /attribute, do not absorb/);
  // The clauses with a live machine canary are NOT honor-system-only; the ledger-dependent ones are.
  const honorOnly = ANTI_LAUNDERING_CHECKLIST.filter((c) => c.honor_system_only).map((c) => c.machine_canary);
  assert.ok(honorOnly.length >= 1, 'at least the ledger-dependent clauses are honor-system-only');
  assert.ok(honorOnly.every((m) => m.includes(BLOCKED_THIS_CYCLE)), 'honor-system-only clauses are exactly the BLOCKED-this-cycle ones');
});

test('anti-laundering: a commission-id is UNRESOLVABLE with no ledger (why B2′/B7′ cannot gate)', () => {
  const r = resolveCommissionId('rp-anything');
  assert.equal(r.resolvable, false, 'with no ledger, authenticity cannot be machine-resolved');
  assert.equal(r.outcome, UNRESOLVABLE_NO_LEDGER, 'the honest outcome is UNRESOLVABLE_NO_LEDGER, not a true/false verdict');
});

// === NON-GATING: a FORGED commission-id rides free through the deterministic gate ==============
test('anti-laundering (the honest gap): a FORGED commission-id PASSES the gate — B2′/B7′ are non-gating', () => {
  const forged = gandalfV1ForgedCommissionIdHonorSystem();
  // The forged id is actually present on the situate finding (the forgery is real)…
  const situate = forged.findings.find((f) => f.kind === 'situate');
  assert.match(situate.researchprime_commission_id, /FORGED/, 'the fixture carries a genuinely forged commission-id');
  // …and there is NO ledger to catch it, so the deterministic gate STILL passes (non-gating, honest).
  assert.doesNotThrow(
    () => assertIncrement1Conformant(forged),
    'in the WITHOUT-ledger ship-state a forged commission-id rides free — B2′/B7′ do not (and cannot) gate'
  );
  // Baseline: the un-forged v1 output also passes — the forgery did not change the gate outcome.
  assert.doesNotThrow(() => assertIncrement1Conformant(gandalfV1FullOutput()));
});
