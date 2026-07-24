// Gandalf advisor — Wave 8 canaries: the ADVISORY power-calc CODE.
//
// Wave 8 done-when (this half): the power-calc CODE is built with DETERMINISTIC unit tests green —
// the paired-test power / minimum-detectable-effect computation with the ICC-adjusted EFFECTIVE N
// that "tracks the fixture COUNT, not seeds×fixtures."
//
// Frozen scenario: given KNOWN inputs, when the power-calc runs in unit tests, then it produces the
// EXPECTED deterministic outputs (the calc logic is correct). And: the calc emits NO feasibility
// verdict / ICC / advisory ruling — those are H1/H2.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalCdf,
  normalQuantile,
  designEffect,
  effectiveN,
  pairedPower,
  minimumDetectableEffect,
  requiredFixtures,
  assessPower,
} from '../seam/power-calc.mjs';

const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// === standard-normal Φ and Φ⁻¹ (the deterministic building blocks) ============================
test('normalCdf: known values of the standard-normal CDF', () => {
  assert.ok(near(normalCdf(0), 0.5), 'Φ(0) = 0.5');
  assert.ok(near(normalCdf(1.959964), 0.975), 'Φ(1.95996) ≈ 0.975');
  assert.ok(near(normalCdf(-1.959964), 0.025), 'Φ(-1.95996) ≈ 0.025');
  assert.ok(near(normalCdf(1.281552), 0.9), 'Φ(1.28155) ≈ 0.9');
  assert.ok(near(normalCdf(100), 1, 1e-6) && normalCdf(100) <= 1, 'Φ saturates at 1');
  assert.throws(() => normalCdf('x'), /requires a number/);
});

test('normalQuantile: known critical z-values; round-trips with normalCdf', () => {
  assert.ok(near(normalQuantile(0.975), 1.959964), 'z_{0.975} ≈ 1.95996');
  assert.ok(near(normalQuantile(0.95), 1.644854), 'z_{0.95} ≈ 1.64485');
  assert.ok(near(normalQuantile(0.8), 0.841621), 'z_{0.8} ≈ 0.84162 (target-power quantile)');
  assert.ok(near(normalQuantile(0.5), 0), 'z_{0.5} = 0');
  // Round-trip: Φ(Φ⁻¹(p)) ≈ p.
  for (const p of [0.1, 0.4, 0.66, 0.9, 0.99]) {
    assert.ok(near(normalCdf(normalQuantile(p)), p), `round-trip at p=${p}`);
  }
  assert.throws(() => normalQuantile(0), /\(0,1\)/);
  assert.throws(() => normalQuantile(1), /\(0,1\)/);
});

// === the ICC-adjusted EFFECTIVE N (the dive's load-bearing residual) ===========================
test('designEffect: Kish DEFF = 1 + (m-1)·ICC at the endpoints', () => {
  assert.equal(designEffect(5, 0), 1, 'ICC=0 ⇒ no clustering penalty');
  assert.equal(designEffect(5, 1), 5, 'ICC=1 ⇒ the cluster counts as ONE observation');
  assert.ok(near(designEffect(4, 0.5), 2.5), 'DEFF = 1 + 3·0.5 = 2.5');
  assert.throws(() => designEffect(0, 0.5), /clusterSize/);
  assert.throws(() => designEffect(3, 1.5), /ICC/);
});

test('effectiveN: with ICC→1 the effective N TRACKS THE FIXTURE COUNT, not seeds×fixtures', () => {
  // 10 fixtures × 5 seeds = 50 raw observations.
  assert.equal(effectiveN({ fixtures: 10, seedsPerFixture: 5, icc: 0 }), 50, 'ICC=0 ⇒ raw seeds×fixtures');
  assert.equal(effectiveN({ fixtures: 10, seedsPerFixture: 5, icc: 1 }), 10, 'ICC=1 ⇒ effective N = the FIXTURE count');
  // In between, it is strictly between the fixture count and the raw count.
  const mid = effectiveN({ fixtures: 10, seedsPerFixture: 5, icc: 0.5 });
  assert.ok(mid > 10 && mid < 50, `mid-ICC effective N (${mid}) is between fixture count and raw`);
  assert.ok(near(mid, (10 * 5) / (1 + 4 * 0.5)), 'effective N = k·m / (1+(m-1)·ICC)');
  assert.equal(effectiveN({ fixtures: 12, seedsPerFixture: 1, icc: 0.9 }), 12, 'one seed per fixture ⇒ N = fixtures regardless of ICC');
  assert.throws(() => effectiveN({ fixtures: 0, seedsPerFixture: 5, icc: 0.5 }), /fixtures/);
});

// === the paired-test power calculation ========================================================
test('pairedPower: at the MDE design point the power EQUALS the target (self-consistency)', () => {
  // By construction MDE is the effect detectable with the target power; feeding MDE back into
  // pairedPower must return that power. This is the strongest internal-consistency check.
  const n = 40;
  const sd = 1;
  const mde = minimumDetectableEffect({ n, sd, alpha: 0.05, power: 0.8, sides: 2 });
  assert.ok(near(pairedPower({ n, effect: mde, sd, alpha: 0.05, sides: 2 }), 0.8), 'power at the MDE equals the target 0.8');
  // A zero effect ⇒ power = alpha/sides (the false-positive floor of a two-sided test).
  assert.ok(near(pairedPower({ n, effect: 0, sd, alpha: 0.05, sides: 2 }), 0.025), 'zero effect ⇒ power = alpha/2');
  // Power increases with n and with effect size.
  assert.ok(pairedPower({ n: 100, effect: 0.3, sd: 1 }) > pairedPower({ n: 20, effect: 0.3, sd: 1 }), 'power rises with n');
  assert.throws(() => pairedPower({ n: 0, effect: 0.3, sd: 1 }), /n ≥ 1/);
  assert.throws(() => pairedPower({ n: 10, effect: 0.3, sd: 0 }), /sd > 0/);
});

test('minimumDetectableEffect: matches the closed-form sd·(z_α+z_β)/√n', () => {
  const n = 25;
  const sd = 2;
  const expected = (sd * (normalQuantile(0.975) + normalQuantile(0.8))) / Math.sqrt(n);
  assert.ok(near(minimumDetectableEffect({ n, sd, alpha: 0.05, power: 0.8, sides: 2 }), expected), 'MDE = sd·(z+z)/√n');
  // MDE shrinks as n grows (more fixtures ⇒ a smaller detectable effect).
  assert.ok(minimumDetectableEffect({ n: 100, sd }) < minimumDetectableEffect({ n: 25, sd }), 'MDE shrinks with n');
  assert.throws(() => minimumDetectableEffect({ n: 1, sd: 1, power: 1 }), /power/);
});

test('requiredFixtures: inverts the design — and the resulting k actually achieves the target power', () => {
  // To detect a 10pp recall lift (G=0.1) with sd=0.2, 1 seed/fixture, α=0.05 two-sided, power 0.8.
  const k = requiredFixtures({ effect: 0.1, sd: 0.2, icc: 0.5, seedsPerFixture: 1, alpha: 0.05, power: 0.8, sides: 2 });
  assert.ok(Number.isInteger(k) && k > 0, 'k is a positive whole number of fixtures');
  // Feeding k back through effectiveN + pairedPower must clear the target power (it is rounded UP).
  const nEff = effectiveN({ fixtures: k, seedsPerFixture: 1, icc: 0.5 });
  assert.ok(pairedPower({ n: nEff, effect: 0.1, sd: 0.2, alpha: 0.05, sides: 2 }) >= 0.8, 'the computed k achieves ≥ target power');
  // Clustering RAISES the required fixture count (DEFF > 1 when seeds>1 and ICC>0).
  const kClustered = requiredFixtures({ effect: 0.1, sd: 0.2, icc: 0.5, seedsPerFixture: 5 });
  const kNoCluster = requiredFixtures({ effect: 0.1, sd: 0.2, icc: 0, seedsPerFixture: 5 });
  assert.ok(kClustered >= kNoCluster, 'clustering (ICC>0) needs at least as many fixtures');
  assert.throws(() => requiredFixtures({ effect: 0, sd: 0.2, icc: 0.5 }), /non-zero effect/);
});

// === assessPower composes the instrument — and is NOT a feasibility ruling =====================
test('assessPower: composes effective N + MDE + power@G + powered?, stamped NON-GATING and NOT-a-ruling', () => {
  // An adequately-powered design: many fixtures, modest SD, generous margin.
  const ok = assessPower({ fixtures: 60, seedsPerFixture: 1, icc: 0.4, marginG: 0.1, sd: 0.2, alpha: 0.05, targetPower: 0.8, sides: 2 });
  assert.equal(ok.advisory, true);
  assert.equal(ok.gating, false, 'the power assessment is NEVER a gate (PRINCIPLE-D)');
  assert.ok(near(ok.effective_n, 60), '1 seed/fixture ⇒ effective N = fixtures');
  assert.equal(ok.inputs.marginG, 0.1, 'the inputs are echoed for the human reader');
  assert.ok(ok.mde <= 0.1, 'MDE is within the 10pp margin ⇒ adequately powered');
  assert.equal(ok.adequately_powered, true);
  assert.ok(ok.power_at_margin >= 0.8, 'power at margin G clears the target');

  // An UNDERPOWERED design: too few fixtures ⇒ MDE exceeds G ⇒ "raise k or widen G."
  const weak = assessPower({ fixtures: 4, seedsPerFixture: 1, icc: 0.4, marginG: 0.1, sd: 0.4 });
  assert.equal(weak.adequately_powered, false);
  assert.ok(weak.mde > 0.1, 'too few fixtures ⇒ MDE exceeds the margin');
  assert.match(weak.recommendation, /raise k|widen G/);

  // THE SCOPE BOUNDARY: assessPower emits NO feasibility verdict / ICC ruling — those are H1.
  assert.equal(ok.feasibility_verdict, null, 'no feasibility verdict is emitted here');
  assert.match(ok.not_a_ruling, /H1/, 'the real ruling is explicitly deferred to H1');
  assert.throws(() => assessPower({ fixtures: 10, marginG: 0, sd: 0.2, icc: 0.3 }), /positive marginG/);
});
