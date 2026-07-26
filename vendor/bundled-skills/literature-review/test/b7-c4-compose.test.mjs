// Track B7 W4 — B7-C4-compose hermetic cell (SC4 N-invoke adversarial compose).
//
// Proves:
//   · N≥1 → composeLiteratureReviewAdversarialPass invokeCount===N (live knobs)
//     with stub RP intake + stub runGovernedRound (hermetic; no network)
//   · N=0 → skipped, invokeCount=0, extraction floor still held
//   · runEngine forbidden / never called
//   · fail-closed if sole entrypoint is unwired from production CLI
// Mapping-bound expectations only (live literatureReviewKnobs.adversarialRounds).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  literatureReviewKnobs,
  LIT_REVIEW_SAFETY_FLOOR,
} from 'fil<path>';
import {
  composeLiteratureReviewAdversarialPass,
  LIT_REVIEW_SAFETY_FLOOR as COMPOSE_FLOOR,
} from '../src/adversarial-compose.mjs';
import { extractLedgerLean } from '../src/extraction.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(__dirname, '..');
const COMPOSE_SRC = join(SKILL_ROOT, 'src', 'adversarial-compose.mjs');
const CLI_SRC = join(SKILL_ROOT, 'bin', 'cli.mjs');

function makeStubs() {
  let governedCalls = 0;
  let recommendCalls = 0;
  let lockCalls = 0;
  let runEngineCalls = 0;

  return {
    counters: {
      get governedCalls() {
        return governedCalls;
      },
      get recommendCalls() {
        return recommendCalls;
      },
      get lockCalls() {
        return lockCalls;
      },
      get runEngineCalls() {
        return runEngineCalls;
      },
    },
    runGovernedRound: async ({ round }) => {
      governedCalls += 1;
      return {
        round,
        skipped: false,
        tally: { verdict: 'GO', blockers: [] },
        judgeVerdict: { decision: 'GO' },
      };
    },
    recommendResearchPrimeIntake: (inputs = {}) => {
      recommendCalls += 1;
      return {
        tier: 'Standard',
        depth: inputs.depth || 'FULL',
        rationale: 'hermetic stub recommend',
        defaulted: false,
      };
    },
    resolveResearchPrimeIntakeLock: ({ inputs = {}, recommendation } = {}) => {
      lockCalls += 1;
      const depth = inputs.depth || recommendation?.depth || 'FULL';
      return {
        lock: {
          tier: 'Standard',
          depth,
          rationale: 'hermetic stub lock',
          source: 'confirm',
          lockedAt: '1970-01-01T00:00:00.000Z',
        },
        recommendation,
        band: { depth, tier: 'Standard' },
        knobs: { depth, maxRounds: 1 },
      };
    },
    runEngine: async () => {
      runEngineCalls += 1;
      throw new Error('runEngine must never be called');
    },
  };
}

test('B7-C4-compose: entrypoint wired (export + CLI final adversarial stage)', () => {
  assert.equal(typeof composeLiteratureReviewAdversarialPass, 'function');
  assert.ok(existsSync(COMPOSE_SRC), 'adversarial-compose.mjs must exist');
  assert.ok(existsSync(CLI_SRC), 'bin/cli.mjs must exist');
  const composeSrc = readFileSync(COMPOSE_SRC, 'utf8');
  assert.match(
    composeSrc,
    /export\s+async\s+function\s+composeLiteratureReviewAdversarialPass/,
    'composeLiteratureReviewAdversarialPass must be the sole exported entry',
  );
  assert.doesNotMatch(
    composeSrc,
    /\brunEngine\s*\(/,
    'compose module must not call runEngine',
  );
  const cliSrc = readFileSync(CLI_SRC, 'utf8');
  assert.match(
    cliSrc,
    /composeLiteratureReviewAdversarialPass/,
    'CLI final adversarial stage must wire composeLiteratureReviewAdversarialPass (anti stub-theater)',
  );
  assert.match(
    cliSrc,
    /from\s+['"].*adversarial-compose\.mjs['"]/,
    'CLI must import compose from adversarial-compose.mjs',
  );
});

test('B7-C4-compose: N≥1 invokeCount===N for LITE and FULL (live knobs; stub RP + governor)', async () => {
  assert.equal(COMPOSE_FLOOR, LIT_REVIEW_SAFETY_FLOOR);

  for (const band of ['LITE', 'FULL']) {
    const knobs = literatureReviewKnobs(band);
    assert.ok(knobs, `live knobs for ${band}`);
    assert.equal(typeof knobs.adversarialRounds, 'number');
    // Mapping-bound: only run N≥1 arm when live mapping actually arms rounds.
    if (knobs.adversarialRounds < 1) continue;

    const stubs = makeStubs();
    const result = await composeLiteratureReviewAdversarialPass({
      ledger: { assumptions: [{ id: 'A-1' }] },
      band,
      knobs,
      agent: async () => ({ findings: [] }),
      stakes: 'low',
      northStar: 'B7-C4 hermetic',
      researchPrimeIntake: { intent: 'B7-C4', depth: band },
      runGovernedRound: stubs.runGovernedRound,
      recommendResearchPrimeIntake: stubs.recommendResearchPrimeIntake,
      resolveResearchPrimeIntakeLock: stubs.resolveResearchPrimeIntakeLock,
    });

    assert.equal(result.skipped, false, `${band}: must not skip when N≥1`);
    assert.equal(
      result.invokeCount,
      knobs.adversarialRounds,
      `${band}: invokeCount must equal live knobs.adversarialRounds`,
    );
    assert.equal(stubs.counters.governedCalls, knobs.adversarialRounds);
    assert.equal(stubs.counters.recommendCalls, knobs.adversarialRounds);
    assert.equal(stubs.counters.lockCalls, knobs.adversarialRounds);
    assert.equal(result.intakeStamps.length, knobs.adversarialRounds);
    assert.equal(result.rounds.length, knobs.adversarialRounds);
    assert.equal(result.floor, LIT_REVIEW_SAFETY_FLOOR);
    assert.equal(stubs.counters.runEngineCalls, 0);
  }

  // At least one band must arm N≥1 under live mapping (else SC4 unprovable).
  const full = literatureReviewKnobs('FULL');
  assert.ok(
    full.adversarialRounds >= 1,
    'FULL live adversarialRounds must be ≥1 so C4 N≥1 path is exercised',
  );
});

test('B7-C4-compose: N=0 skip invokeCount=0; extraction floor still held', async () => {
  const stubs = makeStubs();
  const result = await composeLiteratureReviewAdversarialPass({
    ledger: { assumptions: [] },
    band: 'LITE',
    knobs: {
      adversarialRounds: 0,
      snowballDepth: literatureReviewKnobs('LITE').snowballDepth,
    },
    agent: async () => ({ findings: [] }),
    stakes: 'low',
    northStar: 'B7-C4 N=0',
    runGovernedRound: stubs.runGovernedRound,
    recommendResearchPrimeIntake: stubs.recommendResearchPrimeIntake,
    resolveResearchPrimeIntakeLock: stubs.resolveResearchPrimeIntakeLock,
  });

  assert.equal(result.skipped, true);
  assert.equal(result.invokeCount, 0);
  assert.equal(stubs.counters.governedCalls, 0);
  assert.equal(stubs.counters.recommendCalls, 0);
  assert.equal(stubs.counters.lockCalls, 0);
  assert.equal(result.floor, LIT_REVIEW_SAFETY_FLOOR);
  assert.equal(result.floor.requireQuoteGrounding, true);
  assert.equal(result.floor.oneCallPerPaperExtraction, true);
  assert.equal(result.floor.minGroundedClaimsPerPaper, 1);

  // Concurrent extract remains full-strength under floor (compose skip ⇏ thin extract).
  const quote =
    'The method improves throughput under load according to measured results.';
  const paper = {
    paperId: 'B7C4-N0',
    title: 'N0 Paper',
    authors: [{ name: 'A' }],
    venue: 'Test',
    year: 2020,
  };
  const extract = await extractLedgerLean(
    paper,
    `Intro. ${quote} End.`,
    ['method'],
    async () => ({
      assumptions: [
        {
          claim_id: 'c-1',
          statement: 'Method improves throughput',
          quote,
          column: 'method',
        },
      ],
    }),
  );
  assert.equal(extract.floor, LIT_REVIEW_SAFETY_FLOOR);
  assert.equal(extract.floor.requireQuoteGrounding, true);
  assert.equal(extract.floor.oneCallPerPaperExtraction, true);
  assert.equal(extract.calls, 1);
  assert.ok(extract.ledger.assumptions.length >= 1);
});

test('B7-C4-compose: runEngine forbidden (fail-closed; never silent green)', async () => {
  await assert.rejects(
    () =>
      composeLiteratureReviewAdversarialPass({
        ledger: {},
        band: 'FULL',
        knobs: { adversarialRounds: 1 },
        agent: async () => ({}),
        runEngine: async () => ({}),
        runGovernedRound: async () => ({}),
        recommendResearchPrimeIntake: () => ({
          tier: 'Standard',
          depth: 'FULL',
          rationale: 'x',
        }),
        resolveResearchPrimeIntakeLock: () => ({
          lock: { tier: 'Standard', depth: 'FULL' },
          knobs: {},
        }),
      }),
    (err) => {
      assert.equal(err && err.code, 'LIT_REVIEW_RUNENGINE_FORBIDDEN');
      return true;
    },
  );
});

test('B7-C4-compose: fail-closed when N≥1 but entrypoint returns wrong invokeCount (anti theater)', async () => {
  // Real entrypoint must honor N; a theater that always returns invokeCount:0 fails.
  const N = literatureReviewKnobs('FULL').adversarialRounds;
  assert.ok(N >= 1);
  const stubs = makeStubs();
  const result = await composeLiteratureReviewAdversarialPass({
    ledger: { assumptions: [] },
    band: 'FULL',
    knobs: { adversarialRounds: N, snowballDepth: literatureReviewKnobs('FULL').snowballDepth },
    agent: async () => ({}),
    runGovernedRound: stubs.runGovernedRound,
    recommendResearchPrimeIntake: stubs.recommendResearchPrimeIntake,
    resolveResearchPrimeIntakeLock: stubs.resolveResearchPrimeIntakeLock,
  });
  // Explicit fail-closed predicate for SC4 cell (Contract 5).
  if (result.invokeCount !== N) {
    assert.fail(
      `B7-C4 fail-closed: when N≥1, invokeCount must === N (got ${result.invokeCount}, N=${N})`,
    );
  }
  assert.equal(stubs.counters.governedCalls, N);
});
