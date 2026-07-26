// deal-review engine tests (2026-07-25). Hermetic: stub agent shaped like the trio's
// shark/judge seats — zero live calls, zero .py involvement (the calc engine is fenced).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNumber,
  extractSignificantNumbers,
  checkGrounding,
  buildCharter,
  runDealReview,
} from '../bin/deal-review.mjs';

test('grounding: node-derived renderings pass (commas, $, %, thousands/millions, rounding)', () => {
  const nodes = { pre_money: 12000000, ownership: 0.2143, irr: 0.315, price: 1234567.89 };
  const report = [
    'Pre-money is $12,000,000 (i.e. $12.0 million ... shown as 12,000 thousands).',
    'Investor ownership lands at 21.43% (0.2143), IRR 31.5%.',
    'The share price computes to $1,234,567.89.',
    'Founded in 2019; see section 3 for terms.',
  ].join('\n');
  const g = checkGrounding(report, nodes, {});
  assert.equal(g.ok, true, `expected clean grounding, got: ${JSON.stringify(g.violations)}`);
  assert.ok(g.checked >= 6, 'the significant numbers were actually checked');
});

test('grounding: a number from NOWHERE is a violation with context (the anti-hallucination gate)', () => {
  const nodes = { pre_money: 12000000 };
  const g = checkGrounding('Pre-money $12,000,000 implies a 3.7x MOIC for the fund.', nodes, {});
  assert.equal(g.ok, false);
  assert.equal(g.violations.length, 1);
  assert.equal(g.violations[0].value, 3.7);
  assert.match(g.violations[0].context, /MOIC/);
});

test('extractSignificantNumbers skips years and enumerators; normalizeNumber handles $()% forms', () => {
  const nums = extractSignificantNumbers('In 2024 we saw 2 rounds; cap table shows 8,500,000 shares.');
  assert.deepEqual(nums.map((n) => n.value), [8500000]);
  assert.equal(normalizeNumber('$1,234.50'), 1234.5);
});

test('the charter embeds the investment-memo pack criteria (c2 grounding verbatim) + the FA extension', async () => {
  const charter = await buildCharter();
  assert.match(charter, /\[c2\] Every quantitative or financial claim is anchored/);
  assert.match(charter, /\[fa1\] TEMPLATE OMISSIONS/);
});

test('no agent + no live ⇒ HONEST STOP: review not run, nothing stamped reviewed', async () => {
  const rec = await runDealReview({ reportText: 'Pre-money $10.', nodeValues: { p: 10 }, log: () => {} });
  assert.equal(rec.status, 'STOPPED-HONESTLY');
  assert.equal(rec.cross_model, false);
  assert.match(rec.verdict, /adversarial review not run/);
});

function stubAgent({ blockedRounds = 0 } = {}) {
  return async (_prompt, opts = {}) => {
    const label = opts.label || '';
    if (label.startsWith('shark:')) {
      const round = Number((label.match(/:r(\d+)/) || [])[1] || 0);
      const role = label.split(':')[1];
      if (round <= blockedRounds && (role === 'Skeptic' || role === 'Contrarian')) {
        return {
          answerable: 'yes',
          findings: [{ severity: 'BLOCKER', topic: 'catch-up tier omitted', section: 'waterfall', tag: 'fa1',
            traces_to_north_star: 'yes', criterion: 'fa1', message: 'the deal has a GP catch-up; the template omission is load-bearing' }],
        };
      }
      return { answerable: 'yes', findings: [] };
    }
    if (label.startsWith('judge:')) return { decision: 'CONVERGED', reasons: ['dry round, grounded report'] };
    return {};
  };
}

test('engine: dry sharks + converged judge + clean grounding ⇒ GO, honestly cross_model:false on a stub', async () => {
  const rec = await runDealReview({
    reportText: 'Pre-money $12,000,000.', nodeValues: { pre: 12000000 },
    agent: stubAgent(), rounds: 2, log: () => {},
  });
  assert.match(rec.verdict, /^GO/);
  assert.equal(rec.cross_model, false, 'a stub/injected agent must never be stamped cross-model');
  assert.match(rec.single_family_note, /shared-blind-spot risk is NOT mitigated/);
  assert.equal(rec.judge.lockable, true);
});

test('engine: a ≥2-agree BLOCKER holds the verdict at BLOCKED until the sharks run dry', async () => {
  const rec = await runDealReview({
    reportText: 'Pre-money $12,000,000.', nodeValues: { pre: 12000000 },
    agent: stubAgent({ blockedRounds: 1 }), rounds: 3, log: () => {},
  });
  // Round 1 raises the 2-agree blocker; round 2 is dry — findings resolved.
  assert.equal(rec.rounds[0].verdict, 'BLOCKED');
  assert.equal(rec.rounds[0].newBlockers.length, 1);
  assert.ok(rec.rounds[0].newBlockers[0].agreement >= 2, 'the blocker required ≥2 Sharks agreeing');
  assert.equal(rec.rounds.at(-1).dry, true);
});

test('engine: FAILED grounding gate blocks even a shark-dry, judge-converged review', async () => {
  const rec = await runDealReview({
    reportText: 'The fund returns a 3.7x MOIC.', nodeValues: { pre: 12000000 },
    agent: stubAgent(), rounds: 1, log: () => {},
  });
  assert.match(rec.verdict, /BLOCKED \(grounding gate FAILED\)/);
});
