// Gandalf advisor — B5 canary: diagnose exclusive to the vetted core (Wave 2).
//
// Wave 2 done-when: the vetted diagnose core (PROTOCOL v2) is the SOLE diagnosis source;
// B5 passes and its discriminating negative FAILS. B5 verifies a precise SHAPE/PROVENANCE
// invariant (label/semantic TRUTH stays the advisory layer's job, PRINCIPLE-D): every
// kind:'diagnose' finding must carry vetted-core gandalf_core provenance and NO external
// commission id. A diagnose finding re-derived inline (or sourced from a commissioned
// skill) FAILS — which is what makes the vetted core the sole source at the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertDiagnoseCoreProvenance,
  assertDiagnoseSeam,
  assertReasoningBeforeVerdict,
} from './harness.mjs';
import {
  GANDALF_CORE_PROTOCOL,
  stampDiagnoseCoreProvenance,
  isDiagnoseCoreProvenanced,
} from '../seam/diagnose-core.mjs';
import {
  emptyConformantOutput,
  diagnoseFindingCoreProvenanced,
  diagnoseFindingNoProvenance,
  diagnoseFindingReDerivedInline,
  diagnoseFindingExternalCommission,
} from './fixtures.mjs';

// --- the wave's headline scenario: B5 passes conformant, FAILS the negative ---------------
test('B5: a vetted-core diagnose finding passes; one without gandalf_core provenance FAILS', () => {
  // Given a diagnose finding WITH gandalf_core provenance, B5 passes.
  assert.doesNotThrow(
    () => assertDiagnoseCoreProvenance(diagnoseFindingCoreProvenanced()),
    'a diagnose finding carrying vetted-core (PROTOCOL v2) provenance must pass B5'
  );
  // Given a diagnose finding WITHOUT gandalf_core provenance (re-derived inline), B5 FAILS.
  assert.throws(
    () => assertDiagnoseCoreProvenance(diagnoseFindingNoProvenance()),
    /B5 diagnose-provenance: .*no gandalf_core provenance/,
    'a diagnose finding with no gandalf_core provenance must FAIL B5'
  );
});

test('B5: a diagnose finding re-derived inline (foreign protocol) FAILS', () => {
  assert.throws(
    () => assertDiagnoseCoreProvenance(diagnoseFindingReDerivedInline()),
    /not the vetted core/,
    'a gandalf_core envelope naming a non-vetted protocol must FAIL B5'
  );
});

test('B5: a diagnose finding carrying an external commission id FAILS (diagnosis is exclusive to the core)', () => {
  assert.throws(
    () => assertDiagnoseCoreProvenance(diagnoseFindingExternalCommission()),
    /external commission id/,
    'a diagnose finding sourced from a commissioned skill must FAIL B5 even with core provenance present'
  );
});

// --- B5 only gates diagnose findings (no false positives on other legs) -------------------
test('B5: a non-diagnose finding is not gated by B5', () => {
  const situate = { id: 's1', kind: 'situate', rung: 'CLAIMED', reasoning: 'r', verdict: 'v' };
  const untyped = { id: 'u1', rung: 'CLAIMED', reasoning: 'r', verdict: 'v' };
  assert.doesNotThrow(() => assertDiagnoseCoreProvenance(situate));
  assert.doesNotThrow(() => assertDiagnoseCoreProvenance(untyped));
});

// --- the SOLE-source invariant at the output level ----------------------------------------
test('assertDiagnoseSeam: an output whose diagnose findings are all vetted-core passes; one un-provenanced FAILS', () => {
  const ok = emptyConformantOutput();
  ok.findings.push(diagnoseFindingCoreProvenanced());
  assert.doesNotThrow(() => assertDiagnoseSeam(ok), 'all diagnose findings vetted-core ⇒ seam passes');

  const bad = emptyConformantOutput();
  bad.findings.push(diagnoseFindingCoreProvenanced());
  bad.findings.push(diagnoseFindingNoProvenance()); // one inline-derived diagnosis slips in
  assert.throws(() => assertDiagnoseSeam(bad), /B5 diagnose-provenance/, 'one un-provenanced diagnose finding ⇒ seam FAILS');

  // An output with zero findings (the Wave-1 empty conformant output) trivially passes.
  assert.doesNotThrow(() => assertDiagnoseSeam(emptyConformantOutput()));
});

// --- the seam is the SOLE way to mint vetted-core provenance -------------------------------
test('the diagnose-core seam mints provenance that B5 accepts', () => {
  const raw = { id: 'd-raw', rung: 'CLAIMED', reasoning: 'because X', verdict: 'X is a defect' };
  const stamped = stampDiagnoseCoreProvenance(raw);
  assert.equal(stamped.kind, 'diagnose');
  assert.deepEqual(stamped.gandalf_core, { protocol: GANDALF_CORE_PROTOCOL });
  assert.ok(isDiagnoseCoreProvenanced(stamped));
  assert.doesNotThrow(() => assertDiagnoseCoreProvenance(stamped), 'a seam-stamped finding must pass B5');
  // The seam returns a fresh object (no mutation of the caller's finding).
  assert.equal(raw.gandalf_core, undefined);
  assert.equal(raw.kind, undefined);
});

test('the diagnose-core seam preserves reasoning-before-verdict key order', () => {
  const raw = { id: 'd', rung: 'CLAIMED', reasoning: 'r', verdict: 'v' };
  const stamped = stampDiagnoseCoreProvenance(raw);
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(stamped, '$.findings[0]'));
});

test('isDiagnoseCoreProvenanced is a pure predicate that rejects inline / foreign provenance', () => {
  assert.ok(!isDiagnoseCoreProvenanced(diagnoseFindingNoProvenance()));
  assert.ok(!isDiagnoseCoreProvenanced(diagnoseFindingReDerivedInline()));
  assert.ok(isDiagnoseCoreProvenanced(diagnoseFindingCoreProvenanced()));
  assert.ok(!isDiagnoseCoreProvenanced(null));
  // The bare-string provenance form (gandalf_core: 'PROTOCOL v2') is also accepted.
  assert.ok(isDiagnoseCoreProvenanced({ gandalf_core: 'PROTOCOL v2' }));
  assert.ok(!isDiagnoseCoreProvenanced({ gandalf_core: 'inline-v0' }));
});
