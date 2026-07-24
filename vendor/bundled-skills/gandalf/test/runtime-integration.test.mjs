// Gandalf runtime host — Wave 3 canary: the end-to-end integration.
//
// Asserts the Wave-3 done-when (planning/runtime-host/IMPLEMENTATION-PLAN.md): a REPRESENTATIVE raw
// draft → the CLI host (`runtime/gandalf-run.mjs`) → a conformant output in which the candid DIAGNOSIS
// survives, the elevations are SPECULATIVE-stamped (Tier-1 floor), and the risk_labels are
// PROMISING-capped (single-family). This is the host proved end-to-end through the real CLI process —
// not just the in-process composer (that is the Wave-1 test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { assertIncrement1Conformant } from './harness.mjs';
import { isDiagnoseCoreProvenanced } from '../seam/diagnose-core.mjs';
import { hasNoIndependentRefutationStamp } from '../seam/refute.mjs';
import { structureMapWellFormed } from './fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const CLI = resolve(PROJECT, 'runtime', 'gandalf-run.mjs');

/** A representative raw draft modelled on journal/0001 (the webhook-idempotency dogfood): a candid
 *  diagnosis ("'no external dependencies' is the root defect"), a same-family SITUATE frame, a coming
 *  problem, and a high-value elevation carrying a named defeater. The model emits this RAW; the host
 *  grades it. */
function representativeRawDraft() {
  return {
    reasoning:
      'The note proposes an in-process Set<string> of event_id for exactly-once webhook dedupe with no ' +
      'external dependencies. The vetted core finds the dedupe is non-durable and non-shared, situates it ' +
      'against the durable idempotency-key / inbox pattern, and anticipates a restart-replay wall.',
    verdict: "a real defect: 'no external dependencies' is the root cause, not a feature",
    findings: [
      {
        id: 'd-durability',
        kind: 'diagnose',
        rung: 'CLAIMED',
        reasoning:
          'An in-process Set is lost on restart, so dedupe state does not survive a crash — exactly-once ' +
          'is false the moment the process recycles.',
        verdict: "'no external dependencies' is the root defect, not a feature",
        severity: 'major',
      },
      {
        id: 's-inbox-pattern',
        kind: 'situate',
        reasoning: 'Structure-mapped to the durable idempotency-key / transactional-inbox pattern.',
        verdict: 'best-in-class frame: a durable shared idempotency key',
        abstraction: { stage: 'S0-abstract', skeleton: 'dedupe a repeated external event exactly once across restarts and instances' },
        commission: {
          skill: 'researchPrime',
          question: 'where is at-least-once-to-exactly-once dedupe a solved, mature problem?',
          cross_model: false,
          origin_family: 'fable-5',
          independent_origin: false,
          researchprime_commission_id: null,
        },
        structure_map: structureMapWellFormed(),
        outside_view_base_rate: 'Durable idempotency keys are the standard at-least-once-channel solution in ~all mature message systems.',
      },
      {
        id: 'a-restart-replay',
        kind: 'anticipate',
        rung: 'UNVERIFIED',
        reasoning: 'When the process restarts after a deploy, the in-flight webhook window will be reprocessed.',
        verdict: 'a coming problem: restart-replay double-processing after every deploy',
        future_state_condition: 'a post-deploy restart replays the in-flight webhook window and double-processes events',
        enabling_assumption: 'deploys keep happening while dedupe state lives only in process memory',
      },
    ],
    nitpicks: [],
    elevations: [
      {
        id: 'e-durable-key',
        value_if_true: 'high',
        rung: 'CLAIMED',
        reasoning: 'Adopting a durable shared idempotency key removes the whole class of restart/scale-out divergence.',
        verdict: 'adopt a durable shared idempotency key (the inbox pattern)',
        what_would_refute_it:
          'A measured workload showing the event volume and retention make a durable key store more expensive ' +
          'than the cost of the rare duplicate it prevents.',
      },
    ],
  };
}

test('representative raw draft → CLI → conformant; diagnosis survives, elevations SPECULATIVE, risk_labels PROMISING', () => {
  const r = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify(representativeRawDraft()),
    encoding: 'utf8',
    cwd: PROJECT,
  });
  assert.equal(r.status, 0, `exit 0; stderr was: ${r.stderr}`);

  const out = JSON.parse(r.stdout);
  // the whole canary set passes
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the end-to-end output passes the Increment-1 canary set');

  // (1) the candid diagnosis SURVIVES, carrying vetted-core provenance
  const diag = out.findings.find((f) => f.id === 'd-durability');
  assert.ok(diag, 'the candid diagnosis survives');
  assert.ok(isDiagnoseCoreProvenanced(diag), 'the diagnosis carries gandalf_core provenance');
  assert.match(diag.verdict, /root defect/i, 'the candid verdict is preserved verbatim');

  // (2) every elevation is SPECULATIVE-stamped (Tier-1 floor — no live refuter ran)
  assert.ok(out.elevations.length >= 1);
  for (const e of out.elevations) {
    assert.equal(e.tier, 'SPECULATIVE', `elevation '${e.id}' floats to the honest SPECULATIVE floor`);
    assert.ok(hasNoIndependentRefutationStamp(e), `elevation '${e.id}' is stamped 'no independent refutation ran'`);
  }

  // (3) risk_labels are PROMISING-capped (single-family) and cover every present leg
  const legs = out.risk_labels.map((r2) => r2.leg).sort();
  assert.deepEqual(legs, ['anticipate', 'diagnose', 'situate'], 'all three reported legs are labelled');
  for (const r2 of out.risk_labels) {
    assert.equal(r2.tier, 'PROMISING', `leg '${r2.leg}' is PROMISING-capped on a single-family run`);
  }

  // (4) honest substrate stamps
  assert.equal(out.cross_model, false, 'single-family substrate');
  assert.equal(out.degraded, false, 'nothing degraded in this representative run');
});
