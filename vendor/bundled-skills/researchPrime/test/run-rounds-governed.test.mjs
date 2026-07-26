// P0 2026-07-25 — the T9 orphan, closed: run-rounds now routes through runGovernedRound,
// carries the real calibration verdict, and gates its own output conformance.
//
// What this pins (each was FALSE on the pre-fix canonical path):
//   1. Tier `low` fires ZERO Synthesizer/Judge/debate sub-agents (SKILL.md's promise —
//      previously judge+synthesizer were hard-true at every tier).
//   2. Tier `high` DOES fire them (positive control).
//   3. A zero-AXIS-finding round is SKIPPED with zero high-tier calls, even at high stakes
//      (crit-4 — previously never evaluated on the live path).
//   4. The engine deliverable carries a non-null calibration section and passes
//      checkOutputConformance (previously every engine deliverable failed its own contract
//      with calibration:null — and nothing ever ran the check).
//   5. A legacy governance record with the two-gate `{hash:'mock-hash'}` placeholder no
//      longer crashes at `thresholds.N` (journal 0004) — the contract derives from inputs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRounds } from '../bin/run-rounds.mjs';
import { CURRENT_SCHEMA_VERSION } from '../bin/governance.mjs';
import { checkOutputConformance } from '../bin/deliverable.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('run-rounds governed path (T9 closure)', () => {
  let tempDir;
  before(() => {
    tempDir = path.join(__dirname, '..', 'researchPrime-out', `governed-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });
  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const gov = (tier, { roundBudget = 3, N = 1 } = {}) => ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    triageHash: 'test-triage-hash',
    gate1Decision: 'APPROVE',
    planHash: 'test-plan-hash',
    gate2Decision: 'APPROVE',
    lockedGovernorOutput: { hash: 'test-gov-hash', roundBudget, thresholds: { N, K: 4, M: 2 }, tier },
    hostApprovalProvider: 'TTY',
    skill: 'researchPrime',
  });

  // A non-empty DRY round: findings raised, none a new >=2-agree blocker, all AXIS-serving.
  const dryReviews = [
    { reviewer: 'r1', angle: 'a1', lineage: 'claude', findings: [
      { claim_id: 'c1', topic: 'minor style', severity: 'minor', traces_to_north_star: 'yes', message: 'nit' },
    ] },
    { reviewer: 'r2', angle: 'a2', lineage: 'claude', findings: [
      { claim_id: 'c2', topic: 'small gap', severity: 'minor', traces_to_north_star: 'yes', message: 'gap' },
    ] },
  ];

  const adjudications = {
    judge: { decision: 'CONVERGED', reasons: ['dry'] },
    synthesizer: { lean: 'lock', suggestions: [] },
    debate: { survivor: null },
  };

  function setupRunDir(name, { tier, reviews, govRecord, N = 1 }) {
    const runDir = path.join(tempDir, name);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'governance.json'),
      JSON.stringify(govRecord ?? gov(tier, { N }), null, 2));
    // The triage-extension file IS the extension object (loadTriageExtensionFromRunDir).
    fs.writeFileSync(path.join(runDir, 'triage-extension-test.json'), JSON.stringify({
      locked: true,
      knobs: { includeAdjudication: true, maxRounds: 3 },
    }, null, 2));
    fs.writeFileSync(path.join(runDir, 'round-1-input.json'), JSON.stringify({
      round: 1, northStar: 'test north star', stakesTier: tier, reviews, adjudications,
    }, null, 2));
    return runDir;
  }

  test('tier LOW fires ZERO Synthesizer/Judge/debate sub-agents (the SKILL.md promise, now true)', async () => {
    const runDir = setupRunDir('low-tier', { tier: 'low', reviews: dryReviews });
    const res = await runRounds(runDir, { log: () => {} });
    const round1 = JSON.parse(fs.readFileSync(path.join(runDir, 'round-1-result.json'), 'utf8'));
    assert.deepStrictEqual(round1.counts, { synthesizer: 0, judge: 0, debate: 0 },
      'a low-stakes round must fire zero high-tier sub-agents');
    assert.strictEqual(round1.governor.skipped, false, 'a round with AXIS-serving findings is governed, not skipped');
    assert.ok(res.convergence.converged, 'the dry round converges at N=1');
  });

  test('tier HIGH fires the adjudication layer (positive control)', async () => {
    const runDir = setupRunDir('high-tier', { tier: 'high', reviews: dryReviews });
    await runRounds(runDir, { log: () => {} });
    const round1 = JSON.parse(fs.readFileSync(path.join(runDir, 'round-1-result.json'), 'utf8'));
    assert.ok(round1.counts.judge >= 1, 'high stakes must fire the Judge');
    assert.ok(round1.counts.synthesizer >= 1, 'high stakes must fire the Synthesizer');
  });

  test('a zero-AXIS-finding round is SKIPPED with zero high-tier calls even at HIGH stakes (crit-4)', async () => {
    const offAxis = [
      { reviewer: 'r1', angle: 'a1', lineage: 'claude', findings: [
        { claim_id: 'x1', topic: 'out of scope', severity: 'blocker', traces_to_north_star: 'no', message: 'off-axis' },
      ] },
    ];
    const runDir = setupRunDir('zero-axis', { tier: 'high', reviews: offAxis });
    await runRounds(runDir, { log: () => {} });
    const round1 = JSON.parse(fs.readFileSync(path.join(runDir, 'round-1-result.json'), 'utf8'));
    assert.strictEqual(round1.governor.skipped, true, 'an all-demoted round must be governor-skipped');
    assert.deepStrictEqual(round1.counts, { synthesizer: 0, judge: 0, debate: 0 },
      'a skipped round fires zero high-tier sub-agents at ANY tier');
  });

  test('the engine deliverable carries a REAL calibration section and passes its own conformance gate', async () => {
    const runDir = setupRunDir('deliverable-conformance', { tier: 'low', reviews: dryReviews });
    const res = await runRounds(runDir, { log: () => {} });
    assert.ok(res.deliverable, 'converged run assembles a deliverable');
    assert.ok(res.deliverable.calibration, 'calibration must be carried (was hard-nulled — the T9 conformance hole)');
    assert.strictEqual(res.deliverable.calibration.mode, 'default', 'default-mode calibration is pure of inputs');
    const conf = checkOutputConformance(res.deliverable);
    assert.ok(conf.ok, `the written deliverable must pass the engine output contract (violations: ${conf.violations.join(' | ')})`);
    const onDisk = JSON.parse(fs.readFileSync(path.join(runDir, 'DELIVERABLE-ENGINE.json'), 'utf8'));
    assert.ok(onDisk.deliverable.calibration, 'the on-disk deliverable carries the calibration section');
  });

  test('a legacy mock-hash governance record derives the contract instead of crashing (journal 0004)', async () => {
    const legacy = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      triageHash: 'test-triage-hash',
      gate1Decision: 'APPROVE',
      planHash: 'test-plan-hash',
      gate2Decision: 'APPROVE',
      lockedGovernorOutput: { hash: 'mock-hash' }, // the two-gate placeholder — no thresholds, no tier
      hostApprovalProvider: 'TTY',
      skill: 'researchPrime',
    };
    const runDir = setupRunDir('legacy-mock-hash', { tier: 'low', reviews: dryReviews, govRecord: legacy });
    // Pre-fix: TypeError "Cannot read properties of undefined (reading 'N')".
    const res = await runRounds(runDir, { log: () => {} });
    assert.ok(res.runState, 'the run completes and writes state');
    assert.ok(fs.existsSync(path.join(runDir, 'RUN-STATE.json')));
  });
});
