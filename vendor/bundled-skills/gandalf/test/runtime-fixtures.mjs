// Gandalf runtime host — RAW-DRAFT fixtures (Tier-1).
//
// NOT a *.test.mjs file, so `node --test test/*.test.mjs` does not execute it directly. Builder
// functions return FRESH objects so a test mutating one cannot bleed into another.
//
// CRITICAL: these are RAW PRE-SEAM drafts — the model's un-stamped output, the INPUT to
// `runtime/seam-pass.applySeamPass`. They are deliberately NOT already-conformant outputs (that is
// `test/fixtures.gandalfV1FullOutput`). A raw elevation carries NO tier and NO refutation stamp; a raw
// diagnose finding carries NO gandalf_core; a raw anticipate finding carries the bare future-state
// fields the seam will compose. The seam pass APPLIES all of that.

import { structureMapWellFormed } from './fixtures.mjs';

/** A full, representative RAW draft exercising all three legs + multiple elevations:
 *   • one diagnose finding (un-stamped — NO gandalf_core)
 *   • one situate finding (raw stages: abstraction + commission + structure_map + base rate — NOT composed)
 *   • one anticipate finding (bare future_state_condition + enabling_assumption — NOT composed)
 *   • one high-value elevation carrying a named defeater BUT NO tier / NO stamp (the host stamps it)
 *   • one below-threshold elevation, also un-tiered
 *  After `applySeamPass`, `assertIncrement1Conformant` must PASS. */
export function rawDraftFull() {
  return {
    reasoning:
      'A full deep-think advisor pass over the artifact: the vetted core diagnosed it, SITUATE placed it ' +
      'against write-ahead logging, ANTICIPATE surfaced a coming backfill problem, and each forward ' +
      'suggestion was emitted for honest risk-labelling by the host seams.',
    verdict: 'sound core with one promising-looking elevation and one coming problem to watch',
    findings: [
      {
        id: 'd-1',
        kind: 'diagnose',
        rung: 'CLAIMED',
        reasoning: 'The artifact conflates two distinct failure modes in its error path.',
        verdict: 'a real defect in the error path',
        // NO gandalf_core — the host stamps it via stampDiagnoseCoreProvenance.
      },
      {
        id: 's-1',
        kind: 'situate',
        reasoning: 'Structure-mapped to write-ahead logging via a same-family researchPrime commission.',
        verdict: 'best-in-class frame: write-ahead log recovery ordering',
        // RAW situate STAGES the seam composes (NOT a finished, capped situate finding):
        abstraction: { stage: 'S0-abstract', skeleton: 'ordered durable commit then apply' },
        commission: {
          skill: 'researchPrime',
          question: 'where is ordered-durable-commit a solved, mature problem?',
          cross_model: false,
          origin_family: 'fable-5',
          independent_origin: false,
          researchprime_commission_id: null,
        },
        structure_map: structureMapWellFormed(),
        outside_view_base_rate: 'WAL-style designs recover correctly in ~95% of comparable systems.',
      },
      {
        id: 'a-1',
        kind: 'anticipate',
        rung: 'UNVERIFIED',
        reasoning:
          'If the deploy cadence keeps rising while the migration backfill stays single-threaded, the ' +
          'backfill will fall behind the write rate.',
        verdict: 'a coming problem: the backfill cannot keep up once write volume crosses the ceiling',
        // RAW future-state fields the seam composes into a bounded, forward-looking anticipation:
        future_state_condition: 'the migration backfill falls permanently behind the live write rate and never converges',
        enabling_assumption: 'write volume keeps growing and the backfill is left single-threaded',
      },
    ],
    nitpicks: [
      {
        id: 'n-1',
        rung: 'CLAIMED',
        reasoning: 'A minor naming inconsistency between two helpers.',
        verdict: 'rename for consistency',
      },
    ],
    elevations: [
      {
        // HIGH value → fires the refuter — but Tier-1 has no live refuter, so the host downgrades it
        // to SPECULATIVE + stamps it. NOTE: NO `tier` and NO stamp on the RAW draft.
        id: 'e-high',
        value_if_true: 'high',
        rung: 'CLAIMED',
        reasoning: 'A vetted SITUATE frame the author should adopt.',
        verdict: 'adopt the WAL recovery ordering',
        what_would_refute_it:
          'A replay benchmark on the production workload showing the WAL ordering still loses the last ' +
          'acked write after a mid-flush crash.',
      },
      {
        // BELOW threshold (low value, no major severity) — ships SPECULATIVE + stamped. No tier on raw.
        id: 'e-low',
        value_if_true: 'low',
        rung: 'UNVERIFIED',
        reasoning: 'A low-value suggestion below the refuter-firing threshold.',
        verdict: 'a minor speculative suggestion',
      },
    ],
  };
}

/** A RAW draft with a REFUTED finding AND a REFUTED elevation — both must be ABSENT from the seam-pass
 *  output (only-REFUTED-drops). The surviving diagnose + elevation must remain. */
export function rawDraftWithRefuted() {
  const d = rawDraftFull();
  d.findings.push({
    id: 'd-refuted',
    kind: 'diagnose',
    rung: 'REFUTED',
    reasoning: 'A diagnosis the refuter landed a defeater on — it must drop.',
    verdict: 'refuted defect claim',
  });
  d.elevations.push({
    id: 'e-refuted',
    value_if_true: 'high',
    rung: 'REFUTED',
    reasoning: 'An elevation whose named defeater landed — it must drop.',
    verdict: 'refuted suggestion',
    what_would_refute_it: 'A benchmark that already showed it fails.',
  });
  return d;
}

/** A RAW draft with ONE per-item degraded finding under an (implicit) degraded:false top level — the
 *  host must roll the degradation UP to top-level degraded:true (B6, no silent degradation). */
export function rawDraftWithDegradedItem() {
  const d = rawDraftFull();
  // mark the situate leg degraded (e.g. the commission could not be verified)
  const situate = d.findings.find((f) => f.kind === 'situate');
  situate.degraded = true;
  return d;
}

/** A minimal RAW draft: reasoning + verdict + three empty arrays. Produces the empty conformant output. */
export function rawDraftEmpty() {
  return {
    reasoning: 'No artifact was supplied, so there is nothing to diagnose, situate, or anticipate.',
    verdict: 'this is sound',
    findings: [],
    nitpicks: [],
    elevations: [],
  };
}
