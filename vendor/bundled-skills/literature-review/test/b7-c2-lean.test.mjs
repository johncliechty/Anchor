// Track B7 W3 — B7-C2-lean hermetic cell (SC2 numeric-only leaner predicate).
//
// Ceremony / seats are NOT required for GREEN (optional residual assert only).
// Operands are live literatureReviewKnobs / BAND_MAPPINGS integers and executed
// applied knobs under FOUNDRY_TRIAGE_DEPTH — never prose-literal snowball authority.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BAND_MAPPINGS,
  literatureReviewKnobs,
} from 'fil<path>';
import {
  applyBandUnderEnv,
} from '../src/triage-lock-apply.mjs';

/**
 * Single SC2 predicate (Contract 3): LITE leaner than FULL on ≥1 of
 * snowballDepth | adversarialRounds. Ceremony demoted off SC2.
 * @param {{ snowballDepth: number, adversarialRounds: number }} lite
 * @param {{ snowballDepth: number, adversarialRounds: number }} full
 */
export function isLiteLeanerOnNumericKnobs(lite, full) {
  return (
    lite.snowballDepth < full.snowballDepth ||
    lite.adversarialRounds < full.adversarialRounds
  );
}

test('B7-C2-lean: SC2 on live literatureReviewKnobs integers only (ceremony not required)', () => {
  const lite = literatureReviewKnobs('LITE');
  const full = literatureReviewKnobs('FULL');
  assert.ok(lite && full, 'live knobs must resolve for LITE and FULL');
  assert.equal(typeof lite.snowballDepth, 'number');
  assert.equal(typeof full.snowballDepth, 'number');
  assert.equal(typeof lite.adversarialRounds, 'number');
  assert.equal(typeof full.adversarialRounds, 'number');

  // Mapping-bound: match live BAND_MAPPINGS rows (no prose literal authority).
  const rowLite = BAND_MAPPINGS['literature-review'].LITE;
  const rowFull = BAND_MAPPINGS['literature-review'].FULL;
  assert.equal(lite.snowballDepth, rowLite.snowballDepth);
  assert.equal(lite.adversarialRounds, rowLite.adversarialRounds);
  assert.equal(full.snowballDepth, rowFull.snowballDepth);
  assert.equal(full.adversarialRounds, rowFull.adversarialRounds);

  assert.equal(
    isLiteLeanerOnNumericKnobs(lite, full),
    true,
    'SC2: LITE must be leaner on ≥1 of snowballDepth|adversarialRounds (live knobs)',
  );

  // Optional residual only — ceremony label may differ but is not SC2 GREEN gate.
  if (lite.ceremony !== undefined && full.ceremony !== undefined) {
    assert.equal(typeof lite.ceremony, 'string');
    assert.equal(typeof full.ceremony, 'string');
  }
});

test('B7-C2-lean: SC2 on executed applied knobs under FOUNDRY_TRIAGE_DEPTH', () => {
  const lite = applyBandUnderEnv('LITE');
  const full = applyBandUnderEnv('FULL');
  const liveLite = literatureReviewKnobs('LITE');
  const liveFull = literatureReviewKnobs('FULL');

  assert.equal(lite.snowballDepth, liveLite.snowballDepth);
  assert.equal(lite.adversarialRounds, liveLite.adversarialRounds);
  assert.equal(full.snowballDepth, liveFull.snowballDepth);
  assert.equal(full.adversarialRounds, liveFull.adversarialRounds);
  assert.equal(lite.triageBand, 'LITE');
  assert.equal(full.triageBand, 'FULL');

  assert.equal(
    isLiteLeanerOnNumericKnobs(lite, full),
    true,
    'SC2: executed applied LITE knobs leaner than FULL',
  );
});
