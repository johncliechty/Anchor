// Gandalf advisor — Wave 3 canaries: SITUATE compose + B-ceiling.
//
// Wave 3 done-when: S0-abstract → firing gate → commission researchPrime (the bare trio
// `agent()` seam) → structure-map (≥2 relational correspondences, answer-first) → outside-view
// base rate; B-ceiling passes and its negative FAILS; same-family commission gets NO
// independent-origin credit. Each canary verifies a precise SHAPE/RUNG-CONSISTENCY invariant;
// label/semantic TRUTH stays the advisory layer's job (PRINCIPLE-D).
//
// The two frozen scenarios:
//   • Given a cross_model:false run, when an elevation is stamped GROUNDED, then B-ceiling
//     FAILS (max achievable tier is PROMISING).
//   • Given a SITUATE finding whose facts are unverified, when scored, then it is capped
//     (no self-CORROBORATED; unverifiable → needs_verification handoff).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCeiling,
  assertTierCeiling,
  assertSituateScoreCeiling,
  assertSituateSeam,
  assertReasoningBeforeVerdict,
} from './harness.mjs';
import {
  SITUATE_KIND,
  PERSONA_FAMILY,
  MIN_CORRESPONDENCES,
  MIN_FIRING_STAKES,
  SITUATE_SELF_MAX_RUNG,
  shouldFireSituate,
  abstractEffort,
  isWellFormedStructureMap,
  commissionResearchPrime,
  independentOriginCredit,
  composeSituate,
  needsVerificationHandoff,
} from '../seam/situate.mjs';
import {
  emptyConformantOutput,
  structureMapWellFormed,
  structureMapTooFewCorrespondences,
  structureMapNotAnswerFirst,
  situateFindingCappedConformant,
  situateFindingSelfCorroborated,
  situateFindingUnverifiedNoHandoff,
  outputElevationPromising,
  outputElevationGrounded,
} from './fixtures.mjs';

// === B-ceiling: the wave's headline scenario =============================================
test('B-ceiling: a single-family PROMISING elevation passes; a GROUNDED one FAILS', () => {
  // Given a cross_model:false run with a PROMISING elevation, B-ceiling passes.
  assert.doesNotThrow(
    () => assertCeiling(outputElevationPromising()),
    'a PROMISING elevation on a single-family run is at the ceiling and must pass'
  );
  // Given a cross_model:false run with a GROUNDED elevation, B-ceiling FAILS.
  assert.throws(
    () => assertCeiling(outputElevationGrounded()),
    /B-ceiling: .*GROUNDED.*cross_model:false/,
    'a GROUNDED stamp on a single-family run must FAIL (max achievable tier is PROMISING)'
  );
});

test('B-ceiling: the ceiling does NOT bite on a cross_model:true run', () => {
  const out = outputElevationGrounded();
  out.cross_model = true; // a genuine cross-family run CAN reach GROUNDED
  assert.doesNotThrow(() => assertCeiling(out), 'GROUNDED is reachable once the run crosses model families');
});

test('B-ceiling: a GROUNDED risk_label on a single-family run also FAILS', () => {
  const out = emptyConformantOutput(); // cross_model:false
  out.risk_labels.push({ leg: 'situate', tier: 'GROUNDED', rung: 'CORROBORATED' });
  assert.throws(() => assertCeiling(out), /B-ceiling/, 'a GROUNDED risk_label is over the single-family ceiling');
});

test('assertTierCeiling: exactly-at-ceiling (PROMISING) passes, one tier above (GROUNDED) fails', () => {
  assert.doesNotThrow(() => assertTierCeiling({ tier: 'PROMISING' }, { cross_model: false }));
  assert.doesNotThrow(() => assertTierCeiling({ tier: 'SPECULATIVE' }, { cross_model: false }));
  assert.throws(() => assertTierCeiling({ tier: 'GROUNDED' }, { cross_model: false }), /B-ceiling/);
  // An item with no tier, or a non-single-family run, is not gated.
  assert.doesNotThrow(() => assertTierCeiling({ id: 'x' }, { cross_model: false }));
  assert.doesNotThrow(() => assertTierCeiling({ tier: 'GROUNDED' }, { cross_model: true }));
});

// === SITUATE cap: the wave's second scenario ============================================
test('SITUATE cap: an honestly-capped situate finding passes; a self-CORROBORATED one FAILS', () => {
  // Given a SITUATE finding with unverified facts, capped at CLAIMED with a handoff, it passes.
  assert.doesNotThrow(
    () => assertSituateScoreCeiling(situateFindingCappedConformant()),
    'a situate finding capped at CLAIMED with a needs_verification handoff must pass'
  );
  // Given a same-family situate finding stamped CORROBORATED, the cap FAILS it.
  assert.throws(
    () => assertSituateScoreCeiling(situateFindingSelfCorroborated()),
    /no self-CORROBORATED/,
    'a same-family situate finding stamped CORROBORATED must FAIL — no independent-origin credit'
  );
});

test('SITUATE cap: unverified facts with NO needs_verification handoff FAILS', () => {
  assert.throws(
    () => assertSituateScoreCeiling(situateFindingUnverifiedNoHandoff()),
    /needs_verification handoff/,
    'an unverifiable situate finding with no researchPrime handoff must FAIL'
  );
});

test('SITUATE cap: an independent-origin (cross-family) commission MAY reach CORROBORATED', () => {
  const f = situateFindingSelfCorroborated();
  f.independent_origin = true; // a genuine cross-family commission earns the credit
  f.facts_verified = true;
  assert.doesNotThrow(() => assertSituateScoreCeiling(f), 'CORROBORATED is legitimate once origin is independent');
});

test('SITUATE cap: a non-situate finding is not gated by the SITUATE cap', () => {
  const diagnose = { id: 'd1', kind: 'diagnose', rung: 'CORROBORATED', reasoning: 'r', verdict: 'v' };
  const untyped = { id: 'u1', rung: 'CORROBORATED', reasoning: 'r', verdict: 'v' };
  assert.doesNotThrow(() => assertSituateScoreCeiling(diagnose));
  assert.doesNotThrow(() => assertSituateScoreCeiling(untyped));
});

test('assertSituateSeam: an output with a capped situate finding passes; a self-CORROBORATED one FAILS', () => {
  const ok = emptyConformantOutput();
  ok.findings.push(situateFindingCappedConformant());
  assert.doesNotThrow(() => assertSituateSeam(ok), 'all situate findings honestly capped ⇒ seam passes');

  const bad = emptyConformantOutput();
  bad.findings.push(situateFindingSelfCorroborated());
  assert.throws(() => assertSituateSeam(bad), /B-situate/, 'one self-CORROBORATED situate finding ⇒ seam FAILS');

  assert.doesNotThrow(() => assertSituateSeam(emptyConformantOutput()), 'zero situate findings ⇒ trivially passes');
});

// === the SITUATE compose pipeline (S0 → firing gate → commission → structure-map → outside-view) ===
test('firing gate: commissions only when warranted (central claim + better-in-class frame + stakes ≥ medium)', () => {
  const warranted = { central_load_bearing_claim: 'X carries the design', better_in_class_frame: 'field Y solved this', stakes: 'high' };
  assert.ok(shouldFireSituate(warranted), 'all three conditions present ⇒ fire');
  assert.equal(MIN_FIRING_STAKES, 'medium');
  // Each missing condition independently suppresses firing.
  assert.ok(!shouldFireSituate({ ...warranted, central_load_bearing_claim: '' }), 'no central claim ⇒ no fire');
  assert.ok(!shouldFireSituate({ ...warranted, better_in_class_frame: '' }), 'no better-in-class frame ⇒ no fire');
  assert.ok(!shouldFireSituate({ ...warranted, stakes: 'low' }), 'stakes below medium ⇒ no fire');
  assert.ok(!shouldFireSituate(null), 'no context ⇒ no fire');
});

test('S0-abstract: lifts a non-empty effort to a structural skeleton; rejects empty', () => {
  const a = abstractEffort('a durable queue that acks after flush');
  assert.equal(a.stage, 'S0-abstract');
  assert.ok(a.skeleton.length > 0);
  assert.throws(() => abstractEffort(''), /non-empty effort/);
});

test('structure-map: ≥2 answer-first relational correspondences pass; degenerate maps fail', () => {
  assert.equal(MIN_CORRESPONDENCES, 2);
  assert.ok(isWellFormedStructureMap(structureMapWellFormed()));
  assert.ok(!isWellFormedStructureMap(structureMapTooFewCorrespondences()), '< 2 correspondences ⇒ not well-formed');
  assert.ok(!isWellFormedStructureMap(structureMapNotAnswerFirst()), 'correspondences before answer ⇒ not answer-first');
  // A surface-attribute (non-relational) correspondence is rejected.
  const surface = { answer: 'a', correspondences: [{ a: 1 }, { b: 2 }] };
  assert.ok(!isWellFormedStructureMap(surface), 'correspondences lacking source/target relations ⇒ not well-formed');
  assert.ok(!isWellFormedStructureMap(null));
});

test('commission researchPrime (bare agent() seam): same-family earns NO independent origin', () => {
  // Given a cross_model:false run, the commission is same-family ⇒ no independent-origin credit.
  const sameFamily = commissionResearchPrime({ question: 'How does field Y frame this?', cross_model: false });
  assert.equal(sameFamily.skill, 'researchPrime');
  assert.equal(sameFamily.origin_family, PERSONA_FAMILY);
  assert.equal(sameFamily.independent_origin, false);
  assert.ok(!independentOriginCredit(sameFamily), 'same-family commission gets no independent-origin credit');
  // A genuine cross-family commission DOES earn the credit.
  const crossFamily = commissionResearchPrime({ question: 'q', cross_model: true });
  assert.ok(independentOriginCredit(crossFamily));
  assert.throws(() => commissionResearchPrime({ question: '' }), /non-empty question/);
});

test('composeSituate: assembles a capped, provenanced situate finding from the pipeline stages', () => {
  const finding = composeSituate({
    id: 's-pipeline',
    abstraction: abstractEffort('a durable queue that acks after flush'),
    commission: commissionResearchPrime({ question: 'How does WAL frame this?', cross_model: false }),
    structure_map: structureMapWellFormed(),
    outside_view_base_rate: 'WAL-style designs recover correctly in ~95% of comparable systems.',
    reasoning: 'Structure-mapped to write-ahead logging.',
    verdict: 'best-in-class frame: WAL recovery ordering',
    facts_verified: false,
  });
  assert.equal(finding.kind, SITUATE_KIND);
  // Same-family + unverified ⇒ rung capped at CLAIMED, NOT CORROBORATED.
  assert.equal(finding.rung, SITUATE_SELF_MAX_RUNG);
  assert.equal(finding.independent_origin, false);
  assert.ok(needsVerificationHandoff(finding), 'unverified facts ⇒ a researchPrime handoff is attached');
  // The assembled finding survives both the SITUATE cap and reasoning-before-verdict.
  assert.doesNotThrow(() => assertSituateScoreCeiling(finding));
  assert.doesNotThrow(() => assertReasoningBeforeVerdict(finding, '$.findings[0]'));
  // The pipeline rejects an incomplete run (a degenerate structure-map).
  assert.throws(
    () =>
      composeSituate({
        id: 's-bad',
        abstraction: abstractEffort('x'),
        commission: commissionResearchPrime({ question: 'q', cross_model: false }),
        structure_map: structureMapTooFewCorrespondences(),
        outside_view_base_rate: 'present',
      }),
    /≥2 answer-first relational correspondences/
  );
  // And a missing outside-view base rate.
  assert.throws(
    () =>
      composeSituate({
        id: 's-bad2',
        abstraction: abstractEffort('x'),
        commission: commissionResearchPrime({ question: 'q', cross_model: false }),
        structure_map: structureMapWellFormed(),
        outside_view_base_rate: '',
      }),
    /outside-view base rate/
  );
});

test('composeSituate: a cross-family commission lifts the rung to CORROBORATED (and needs no handoff)', () => {
  const finding = composeSituate({
    id: 's-independent',
    abstraction: abstractEffort('x'),
    commission: commissionResearchPrime({ question: 'q', cross_model: true }),
    structure_map: structureMapWellFormed(),
    outside_view_base_rate: 'present',
    facts_verified: true,
  });
  assert.equal(finding.independent_origin, true);
  assert.equal(finding.rung, 'CORROBORATED');
  assert.ok(!needsVerificationHandoff(finding), 'verified, independent-origin facts need no handoff');
  assert.doesNotThrow(() => assertSituateScoreCeiling(finding));
});
