// Gandalf advisor — shared canary fixtures (Wave 1 / GATE-0).
// NOT a *.test.mjs file, so `node --test test/*.test.mjs` does not execute it directly.
// Builder functions return FRESH objects so a test mutating one cannot bleed into another.

/** A minimal schema-conformant advisor output with zero findings/nitpicks/elevations.
 *  Key order places 'reasoning' before 'verdict' (the reasoning-before-verdict invariant). */
export function emptyConformantOutput() {
  return {
    schema_version: 'gandalf-advisor-1',
    cross_model: false,
    degraded: false,
    reasoning: 'No artifact was supplied, so there is nothing to diagnose, situate, or anticipate.',
    verdict: 'this is sound',
    findings: [],
    nitpicks: [],
    elevations: [],
    risk_labels: [],
  };
}

/** A finding that conforms to a rung ceiling: it populates a field gated at CORROBORATED
 *  while sitting on the CORROBORATED rung. assertRungCeiling(..) must PASS. */
export function findingRungConformant() {
  return {
    id: 'f-conformant',
    rung: 'CORROBORATED',
    reasoning: 'Two independent sources in the substrate agree on this claim.',
    verdict: 'corroborated by independent sources',
    corroborated_by: ['source-a', 'source-b'],
  };
}

/** A finding that VIOLATES a rung ceiling: it populates a field gated at CORROBORATED
 *  while sitting only on the CLAIMED rung. assertRungCeiling(..) must FAIL. */
export function findingRungViolation() {
  return {
    id: 'f-violation',
    rung: 'CLAIMED',
    reasoning: 'A single claim, asserted as if multiple sources corroborated it.',
    verdict: 'claimed',
    corroborated_by: ['source-a', 'source-b'],
  };
}

// --- Wave 2 / B5: diagnose exclusive to the vetted core ---------------------------------

/** A diagnose finding that carries valid vetted-core provenance (PROTOCOL v2) and no
 *  external commission id. B5 (assertDiagnoseCoreProvenance) must PASS. The provenance is
 *  shaped exactly as seam/diagnose-core.mjs `stampDiagnoseCoreProvenance` mints it. */
export function diagnoseFindingCoreProvenanced() {
  return {
    id: 'd-conformant',
    kind: 'diagnose',
    rung: 'CLAIMED',
    reasoning: 'The artifact conflates two distinct failure modes in its error path.',
    verdict: 'a real defect in the error path',
    gandalf_core: { protocol: 'PROTOCOL v2' },
  };
}

/** A diagnose finding with NO gandalf_core provenance — the headline B5 negative
 *  ("without gandalf_core provenance"). It was re-derived inline by Gandalf rather than
 *  sourced from the vetted core. B5 must FAIL. */
export function diagnoseFindingNoProvenance() {
  return {
    id: 'd-no-prov',
    kind: 'diagnose',
    rung: 'CLAIMED',
    reasoning: 'A diagnosis Gandalf produced in its own reasoning, with no core provenance.',
    verdict: 'a defect',
  };
}

/** A diagnose finding whose gandalf_core envelope names a NON-vetted protocol — i.e. it was
 *  re-derived inline / from a foreign source rather than the vetted core. B5 must FAIL. */
export function diagnoseFindingReDerivedInline() {
  return {
    id: 'd-inline',
    kind: 'diagnose',
    rung: 'CLAIMED',
    reasoning: 'A diagnosis stamped with a home-rolled provenance marker, not the vetted core.',
    verdict: 'a defect',
    gandalf_core: { protocol: 'inline-v0' },
  };
}

/** A diagnose finding that carries an external commission id — the diagnosis was sourced
 *  from a COMMISSIONED skill, violating "diagnosis is exclusive to the core." Even with
 *  valid-looking core provenance present, B5 must FAIL on the external commission id. */
export function diagnoseFindingExternalCommission() {
  return {
    id: 'd-external',
    kind: 'diagnose',
    rung: 'CLAIMED',
    reasoning: 'A diagnosis attributed to a researchPrime commission rather than the core.',
    verdict: 'a defect',
    gandalf_core: { protocol: 'PROTOCOL v2' },
    researchprime_commission_id: 'rp-abc123',
  };
}

// --- Wave 3 / SITUATE compose + B-ceiling -------------------------------------------------

/** A well-formed structure-map: ANSWER-FIRST (the `answer` conclusion precedes the
 *  `correspondences` elaboration) with ≥2 RELATIONAL correspondences (relation → relation,
 *  not surface-attribute matches). isWellFormedStructureMap(..) must return true. */
export function structureMapWellFormed() {
  return {
    answer: 'The effort is structurally a write-ahead log; adopt WAL recovery ordering.',
    correspondences: [
      { source_relation: 'commit precedes apply', target_relation: 'log-append precedes state-mutation' },
      { source_relation: 'fsync gates durability', target_relation: 'flush gates acknowledgement' },
    ],
  };
}

/** A structure-map that VIOLATES well-formedness: only ONE correspondence (< the ≥2 floor).
 *  isWellFormedStructureMap(..) must return false. */
export function structureMapTooFewCorrespondences() {
  return {
    answer: 'A single surface analogy, asserted as a structural mapping.',
    correspondences: [
      { source_relation: 'has a queue', target_relation: 'has a buffer' },
    ],
  };
}

/** A structure-map that VIOLATES answer-first key order: `correspondences` precedes `answer`.
 *  isWellFormedStructureMap(..) must return false. */
export function structureMapNotAnswerFirst() {
  const m = {};
  m.correspondences = structureMapWellFormed().correspondences;
  m.answer = 'The conclusion arrives AFTER the elaboration — not answer-first.';
  return m;
}

/** A SITUATE finding from a SAME-FAMILY (cross_model:false) commission, honestly capped:
 *  rung CLAIMED (no self-CORROBORATED), facts unverified, carrying a researchPrime
 *  `needs_verification` handoff. assertSituateScoreCeiling(..) must PASS. */
export function situateFindingCappedConformant() {
  return {
    id: 's-conformant',
    kind: 'situate',
    rung: 'CLAIMED',
    reasoning: 'Structure-mapped to write-ahead logging via a same-family researchPrime commission; facts not yet independently verified.',
    verdict: 'best-in-class frame: write-ahead log recovery ordering',
    independent_origin: false,
    structure_map: structureMapWellFormed(),
    outside_view_base_rate: 'WAL-style designs recover correctly in ~95% of comparable systems.',
    facts_verified: false,
    needs_verification: 'route to researchPrime: verify the WAL correspondence and base rate independently.',
  };
}

/** A SITUATE finding that VIOLATES the cap: stamped CORROBORATED on its OWN same-family
 *  evidence (independent_origin:false) — a self-CORROBORATED. assertSituateScoreCeiling(..)
 *  must FAIL. This is the discriminating negative for "same-family ⇒ no independent origin." */
export function situateFindingSelfCorroborated() {
  return {
    id: 's-self-corroborated',
    kind: 'situate',
    rung: 'CORROBORATED',
    reasoning: 'A same-family commission, dishonestly stamped as if independently corroborated.',
    verdict: 'best-in-class frame, over-claimed as corroborated',
    independent_origin: false,
    structure_map: structureMapWellFormed(),
    outside_view_base_rate: 'base rate present',
    facts_verified: true,
  };
}

/** A SITUATE finding with unverified facts that OMITS the needs_verification handoff — an
 *  unverifiable correspondence asserted as real with no route-out. assertSituateScoreCeiling
 *  must FAIL on the missing handoff. */
export function situateFindingUnverifiedNoHandoff() {
  return {
    id: 's-no-handoff',
    kind: 'situate',
    rung: 'CLAIMED',
    reasoning: 'Facts not verified, yet no researchPrime handoff is attached.',
    verdict: 'an unverifiable frame asserted without a route-out',
    independent_origin: false,
    structure_map: structureMapWellFormed(),
    outside_view_base_rate: 'base rate present',
    facts_verified: false,
  };
}

/** A single-family advisor output carrying a PROMISING elevation (the ceiling). assertCeiling
 *  must PASS. */
export function outputElevationPromising() {
  const out = emptyConformantOutput(); // cross_model:false
  out.elevations.push({
    id: 'e-promising',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'A vetted SITUATE frame surviving refutation, honestly capped at PROMISING.',
    verdict: 'a promising, single-family-ceiling elevation',
  });
  return out;
}

/** A single-family advisor output carrying a GROUNDED elevation — over the PROMISING ceiling.
 *  assertCeiling must FAIL (the B-ceiling discriminating negative). */
export function outputElevationGrounded() {
  const out = emptyConformantOutput(); // cross_model:false
  out.elevations.push({
    id: 'e-grounded',
    tier: 'GROUNDED',
    value_if_true: 'high',
    rung: 'CORROBORATED',
    reasoning: 'A single-family elevation dishonestly stamped GROUNDED (no cross-family refuter ran).',
    verdict: 'over-claimed as grounded',
  });
  return out;
}

// --- Wave 4 / B-honesty: the NS4 refutation-discipline spine ------------------------------

/** A high-value elevation that fires the refuter and survived an INDEPENDENT named-defeater
 *  refutation: it carries a NAMED concrete defeater plus a `refutation_provenance` envelope,
 *  and is honestly capped at PROMISING (single-family ceiling). assertHonestRefutation must
 *  PASS (it also passes B-ceiling). */
export function elevationRefutedHonest() {
  return {
    id: 'e-refuted-honest',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'A SITUATE-derived frame that an independent refuter attacked with a concrete defeater and could not break.',
    verdict: 'a promising suggestion that survived an independent named-defeater refutation',
    what_would_refute_it: 'A replay benchmark on the production workload showing the WAL ordering still loses the last acked write after a mid-flush crash.',
    refutation_provenance: {
      kind: 'independent-named-defeater',
      defeater: 'A replay benchmark on the production workload showing the WAL ordering still loses the last acked write after a mid-flush crash.',
      independent: true,
      survived: true,
      refuter_commission_id: null,
    },
  };
}

/** The HEADLINE B-honesty negative: a high-value elevation stamped above SPECULATIVE whose
 *  `what_would_refute_it` is a self-rated CONFIDENCE WORD (no named concrete defeater, and no
 *  `refutation_provenance`). assertHonestRefutation must FAIL. */
export function elevationConfidenceWordDefeater() {
  return {
    id: 'e-confidence-word',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'A frame asserted as vetted, with only a self-rating standing in for a refutation.',
    verdict: 'over-claimed: a confidence self-rating is not a refutation',
    what_would_refute_it: 'very confident',
  };
}

/** A B-honesty negative: a high-value elevation with a NAMED concrete defeater but NO
 *  `refutation_provenance` — the defeater was named but no independent refuter actually ran.
 *  assertHonestRefutation must FAIL on the missing provenance. */
export function elevationNamedDefeaterNoProvenance() {
  return {
    id: 'e-no-provenance',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'A concrete defeater was articulated, but no independent refuter was ever dispatched against it.',
    verdict: 'a defeater named but never independently tested',
    what_would_refute_it: 'A profiler trace showing the hot path is allocation-bound, not lock-bound.',
  };
}

/** The honest un-refuted FLOOR: a high-value elevation that did NOT earn an independent
 *  refutation, shipped SPECULATIVE and carrying the "no independent refutation ran" stamp.
 *  assertHonestRefutation must PASS. */
export function elevationUnrefutedSpeculativeStamped() {
  return {
    id: 'e-unrefuted-floor',
    tier: 'SPECULATIVE',
    value_if_true: 'high',
    rung: 'UNVERIFIED',
    reasoning: 'A high-value frame for which the refuter budget was exhausted before it could be attacked.',
    verdict: 'a speculative suggestion, honestly stamped as un-refuted',
    no_independent_refutation: true,
    refutation_stamp: 'no independent refutation ran',
  };
}

/** A B-honesty negative: a high-value elevation shipped SPECULATIVE but carrying NO
 *  "no independent refutation ran" stamp — a silent un-refuted drop. assertHonestRefutation
 *  must FAIL on the missing stamp. */
export function elevationSpeculativeNoStamp() {
  return {
    id: 'e-floor-no-stamp',
    tier: 'SPECULATIVE',
    value_if_true: 'high',
    rung: 'UNVERIFIED',
    reasoning: 'A high-value frame dropped to SPECULATIVE with no honest stamp of why.',
    verdict: 'an un-refuted finding silently left unstamped',
  };
}

/** A below-threshold elevation honestly shipped: value_if_true low (and no major severity), so
 *  no refuter fires; it ships SPECULATIVE with the stamp. assertHonestRefutation must PASS. */
export function elevationBelowThresholdSpeculative() {
  return {
    id: 'e-below-threshold-ok',
    tier: 'SPECULATIVE',
    value_if_true: 'low',
    rung: 'UNVERIFIED',
    reasoning: 'A low-value suggestion below the refuter-firing threshold.',
    verdict: 'a minor speculative suggestion, no independent refuter warranted',
    no_independent_refutation: true,
    refutation_stamp: 'no independent refutation ran',
  };
}

/** A B-honesty negative: a below-threshold elevation (value_if_true low, no major severity)
 *  stamped above SPECULATIVE — a below-threshold finding that gets no refuter cannot honestly
 *  rise above the floor. assertHonestRefutation must FAIL. */
export function elevationBelowThresholdPromising() {
  return {
    id: 'e-below-threshold-overclaim',
    tier: 'PROMISING',
    value_if_true: 'low',
    rung: 'CLAIMED',
    reasoning: 'A low-value suggestion dishonestly elevated above the floor without any refutation.',
    verdict: 'over-claimed: below the firing threshold yet stamped PROMISING',
  };
}

// --- Wave 5 / ANTICIPATE: the Oranges-lens bounded premortem (B3 + B9) ---------------------

/** A well-formed bounded-premortem anticipate finding: subject_cardinality 1, a populated
 *  not-yet-present `future_state_condition` + `enabling_assumption`, and NO regret/
 *  counterfactual-cost field. Passes BOTH B3 (assertBoundedPremortem) and B9
 *  (assertForwardLooking). Shaped exactly as seam/anticipate.mjs `composeAnticipation` mints it. */
export function anticipateFindingConformant() {
  return {
    id: 'a-conformant',
    kind: 'anticipate',
    rung: 'UNVERIFIED',
    reasoning: 'If the deploy cadence keeps rising while the migration backfill stays single-threaded, the backfill will fall behind the write rate.',
    verdict: 'a coming problem: the backfill cannot keep up once write volume crosses the single-threaded ceiling',
    subject_cardinality: 1,
    future_state_condition: 'the migration backfill falls permanently behind the live write rate and never converges',
    enabling_assumption: 'write volume keeps growing and the backfill is left single-threaded',
  };
}

/** A B3 negative: an anticipate finding carrying a regret / counterfactual-cost FIELD — it is
 *  pricing the cost of NOT taking a competing path, which is Crucible's Oranges-engine, not
 *  Gandalf's bounded premortem. assertBoundedPremortem must FAIL (route to a Crucible commission). */
export function anticipateFindingRegretField() {
  return {
    id: 'a-regret-field',
    kind: 'anticipate',
    rung: 'UNVERIFIED',
    reasoning: 'A premortem that smuggles in counterfactual-cost-across-paths pricing.',
    verdict: 'over-reaching into Crucible\'s multi-plan engine',
    subject_cardinality: 1,
    future_state_condition: 'the chosen path underperforms the alternative',
    enabling_assumption: 'the alternative path was viable',
    counterfactual_cost: 'choosing path A over path B forfeits ~30% throughput — the regret of not choosing B',
  };
}

/** A B3 negative: an anticipate finding with subject_cardinality > 1 — a multi-path read, which is
 *  Crucible's engine, not Gandalf's single-effort bounded premortem. assertBoundedPremortem must
 *  FAIL (route to a Crucible commission). */
export function anticipateFindingMultiSubject() {
  return {
    id: 'a-multi-subject',
    kind: 'anticipate',
    rung: 'UNVERIFIED',
    reasoning: 'A premortem that reads across more than one competing plan.',
    verdict: 'a multi-path read that belongs to Crucible',
    subject_cardinality: 3,
    future_state_condition: 'whichever of the three plans wins, its weakest assumption breaks first',
    enabling_assumption: 'all three plans share the same brittle assumption',
  };
}

/** A B9 negative: a PRESENT-TENSE anticipate finding — it diagnoses a condition that already
 *  holds and carries no populated future_state_condition + enabling_assumption. An anticipation
 *  must be a not-yet-present future state, so assertForwardLooking must FAIL. */
export function anticipateFindingPresentTense() {
  return {
    id: 'a-present-tense',
    kind: 'anticipate',
    rung: 'CLAIMED',
    reasoning: 'The connection pool is already exhausted under current load — a present-tense defect, not a coming problem.',
    verdict: 'a present-tense observation mislabelled as an anticipation',
    subject_cardinality: 1,
  };
}

/** A B3/B9-CLEAN anticipate finding whose PROSE nonetheless performs cross-path cost reasoning —
 *  the residual the syntactic gate cannot catch. It PASSES B3 and B9 (clean schema, cardinality 1,
 *  populated forward-looking fields, no regret field), yet the ADVISORY
 *  `flagCrossPathCostReasoning` flags it. Used to prove the advisory flag is ISOLATED from the
 *  gate (PRINCIPLE-D): the deterministic canaries pass while the advisory layer routes it out. */
export function anticipateFindingCrossPathProse() {
  return {
    id: 'a-cross-path-prose',
    kind: 'anticipate',
    rung: 'UNVERIFIED',
    reasoning: 'Compared to the alternative path of sharding first, the regret of not choosing that route is that the cache layer will saturate sooner.',
    verdict: 'a coming saturation problem, argued via the opportunity cost of the path not taken',
    subject_cardinality: 1,
    future_state_condition: 'the cache layer saturates and tail latency degrades under peak load',
    enabling_assumption: 'peak load keeps climbing and the single cache tier is left in place',
  };
}

// --- Wave 6 / SCORE · LABEL · SYNTHESIS (B1 + B6 + B8) -------------------------------------

/** A divergent/brainstorm "ideate"-class finding — open-ended idea generation, which is Jumper's,
 *  not Gandalf's grounded insight. It carries an ideation `kind` AND an idea-generation field.
 *  assertNoIdeation / isIdeationFinding must FAIL it (B1). This is the B1 discriminating negative. */
export function findingIdeationDivergent() {
  return {
    id: 'i-ideate',
    kind: 'ideate',
    rung: 'UNVERIFIED',
    reasoning: 'Free-association of brand-new feature directions, untethered to any diagnosis or frame.',
    verdict: 'a brainstorm of novel extensions',
    new_ideas: [
      'add a gamified streak counter',
      'pivot the whole product to a marketplace',
      'bolt on an AI chat sidebar',
    ],
  };
}

/** A grounded SITUATE-derived suggestion carrying a DUAL-AXIS score: value_if_true × groundedness,
 *  on two separate axes with no collapsed scalar. It is NOT ideation, so it passes B1; scoreDualAxis
 *  reads its value_if_true + rung. */
export function elevationDualAxisScored() {
  return {
    id: 'e-dual-axis',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'A vetted SITUATE frame: high value if it holds, but only CLAIMED groundedness on a single-family substrate.',
    verdict: 'a high-value, modestly-grounded suggestion — the two axes kept distinct',
  };
}

/** A COLLAPSED score — the two axes merged into a single scalar `priority`, laundering a
 *  high-value/low-grounded suggestion into one number. isCollapsedScore must flag it;
 *  isDualAxisScore must reject it (the SCORE discriminating negative). */
export function collapsedScore() {
  return { value_if_true: 'high', groundedness: 'CLAIMED', priority: 0.9 };
}

/** A B6 negative: a per-finding `degraded:true` under a top-level `degraded:false` — a SILENT
 *  degradation. assertNoSilentDegradation must FAIL. */
export function outputSilentDegradation() {
  const out = emptyConformantOutput(); // top-level degraded:false
  out.findings.push({
    id: 'd-degraded',
    kind: 'diagnose',
    rung: 'UNVERIFIED',
    reasoning: 'This leg ran in a degraded mode (a commission timed out) but the run never surfaced it.',
    verdict: 'a partial diagnosis produced under degradation',
    degraded: true,
    gandalf_core: { protocol: 'PROTOCOL v2' },
  });
  return out;
}

/** The HONEST counterpart to the B6 negative: an item ran degraded AND the top-level output owns
 *  it (`degraded:true`). assertNoSilentDegradation must PASS (the degradation is surfaced). */
export function outputHonestDegradation() {
  const out = outputSilentDegradation();
  out.degraded = true; // the top level surfaces the degradation ⇒ not silent
  return out;
}

/** An honestly-synthesised output: the two reported legs (diagnose, situate) BOTH appear in
 *  risk_labels, each at a rung within its leg's evidential envelope (CLAIMED), tier capped at the
 *  single-family ceiling PROMISING. assertHonestSynthesis (and assertCeiling) must PASS. */
export function outputHonestSynthesis() {
  const out = emptyConformantOutput(); // cross_model:false
  out.findings.push(diagnoseFindingCoreProvenanced()); // kind diagnose, rung CLAIMED
  out.findings.push(situateFindingCappedConformant()); // kind situate, rung CLAIMED
  out.risk_labels.push({ leg: 'diagnose', tier: 'PROMISING', rung: 'CLAIMED' });
  out.risk_labels.push({ leg: 'situate', tier: 'PROMISING', rung: 'CLAIMED' });
  return out;
}

/** A B8 negative: a leg is PRESENT in the findings (anticipate) but ABSENT from risk_labels — a
 *  silent omission. assertHonestSynthesis must FAIL on the missing leg. */
export function outputLegMissingRiskLabel() {
  const out = outputHonestSynthesis();
  out.findings.push(anticipateFindingConformant()); // adds a present 'anticipate' leg…
  // …but risk_labels is NOT extended to cover it ⇒ the anticipate leg is unlabelled.
  return out;
}

/** A B8 negative: a risk_label whose rung EXCEEDS its leg's evidential envelope — the diagnose leg's
 *  strongest finding is CLAIMED, yet its synthesis label claims OBSERVED. assertHonestSynthesis must
 *  FAIL (a synthesis may not out-claim its leg). */
export function outputRiskLabelRungExceedsEnvelope() {
  const out = emptyConformantOutput(); // cross_model:false
  out.findings.push(diagnoseFindingCoreProvenanced()); // kind diagnose, envelope rung CLAIMED
  out.risk_labels.push({ leg: 'diagnose', tier: 'PROMISING', rung: 'OBSERVED' }); // out-claims the envelope
  return out;
}

// --- Wave 7 / Increment-1 INTEGRATION + PRINCIPLE-D + anti-laundering honor-system ---------

/** The fully-integrated, conformant GANDALF v1 advisor output — every leg exercised at once: a
 *  vetted-core diagnosis, a same-family SITUATE frame (honestly capped + handoff), a bounded
 *  forward-looking ANTICIPATE, two honestly-labelled elevations (one survived an independent
 *  named-defeater refutation, one below the firing threshold shipped SPECULATIVE + stamped), and
 *  an honest synthesis labelling all three legs within their envelopes at the single-family
 *  PROMISING ceiling. This is the Wave-7 integration fixture: `assertIncrement1Conformant` must
 *  PASS on it (the WHOLE Increment-1 canary set green over one output). */
export function gandalfV1FullOutput() {
  const out = emptyConformantOutput(); // cross_model:false, degraded:false
  out.reasoning =
    'A full deep-think advisor pass: the vetted core diagnosed the effort, SITUATE placed it against ' +
    'write-ahead logging via a same-family commission, ANTICIPATE surfaced a coming backfill problem, ' +
    'and every forward suggestion was honestly risk-labelled.';
  out.verdict = 'sound core with one promising, refutation-survived elevation and one coming problem to watch';
  out.findings.push(diagnoseFindingCoreProvenanced());   // diagnose, CLAIMED, vetted-core provenance
  out.findings.push(situateFindingCappedConformant());   // situate,  CLAIMED, no self-CORROBORATED + handoff
  out.findings.push(anticipateFindingConformant());      // anticipate, UNVERIFIED, bounded + forward-looking
  out.elevations.push(elevationRefutedHonest());          // PROMISING — survived an independent refuter
  out.elevations.push(elevationBelowThresholdSpeculative()); // SPECULATIVE — below threshold, stamped
  out.risk_labels.push({ leg: 'diagnose', tier: 'PROMISING', rung: 'CLAIMED' });
  out.risk_labels.push({ leg: 'situate', tier: 'PROMISING', rung: 'CLAIMED' });
  out.risk_labels.push({ leg: 'anticipate', tier: 'PROMISING', rung: 'UNVERIFIED' });
  return out;
}

/** The HONOR-SYSTEM forgery fixture (WITHOUT-ledger ship-state). A conformant Gandalf v1 output in
 *  which the SITUATE finding carries a FORGED / unresolvable researchprime_commission_id — an id no
 *  ledger ever minted. In Increment 1 there is NO ledger to resolve it against, so the deterministic
 *  gate does NOT (and honestly cannot) reject it: `assertIncrement1Conformant` must STILL PASS. That
 *  is the point — it proves B2′/B7′ are NON-GATING this cycle (the forgery rides free, surfaced by
 *  the anti-laundering honor-system canary, not hidden). WITH the ledger (Increment 2) the same
 *  fixture would FAIL a machine-checked B2′. */
export function gandalfV1ForgedCommissionIdHonorSystem() {
  const out = gandalfV1FullOutput();
  const situate = out.findings.find((f) => f.kind === 'situate');
  situate.researchprime_commission_id = 'FORGED-rp-id-no-ledger-ever-minted-this';
  return out;
}
