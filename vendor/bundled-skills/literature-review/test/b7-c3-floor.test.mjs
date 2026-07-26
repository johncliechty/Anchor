// Track B7 W3 — B7-C3-floor hermetic cell (SC3 safety floor consumption goldens).
//
// Proves:
//   · LITE|FULL|SPIKE(+aliases) floor fields exact-true (identity + frozen)
//   · LITE extract fixture fails if extract entry does not read LIT_REVIEW_SAFETY_FLOOR
//   · rounds=0 (compose skip) still requires quote-grounded claims / one-call-per-paper
//   · Secondary deny-list greps: thinned floor assign false/0; second depth→knob table

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIT_REVIEW_SAFETY_FLOOR,
  literatureReviewKnobs,
  resolveLiteratureReviewBand,
  assertLiteratureReviewBandInvariants,
} from 'fil<path>';
import {
  extractLedgerLean,
  LIT_REVIEW_SAFETY_FLOOR as EXTRACT_FLOOR,
} from '../src/extraction.mjs';
import {
  composeLiteratureReviewAdversarialPass,
} from '../src/adversarial-compose.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(__dirname, '..');
const SRC_DIR = join(SKILL_ROOT, 'src');
const BIN_DIR = join(SKILL_ROOT, 'bin');

const FLOOR_TRUE_FIELDS = [
  'requireQuoteGrounding',
  'oneCallPerPaperExtraction',
];

/** Canonical bands + SPIKE aliases that normalize to SPIKE. */
const BAND_MATRIX = ['LITE', 'FULL', 'SPIKE', 'SPIKE-FIRST', 'SPIKE_FIRST', 'SPIKEFIRST'];

const PAPER = {
  paperId: 'B7C3floor',
  title: 'Floor Consumption Paper',
  authors: [{ name: 'A' }],
  venue: 'Test',
  year: 2021,
  citationCount: 0,
};
const GROUNDED_QUOTE =
  'The method improves throughput under load according to measured results.';
const PAPER_TEXT = `Intro paragraph. ${GROUNDED_QUOTE} Closing remarks.`;

/**
 * Positive floor-consumption predicate for extract results.
 * Fails closed if floor was not read / not applied.
 * @param {object} out extractLedgerLean result (or shadow counterfeit)
 */
export function assertExtractConsumedFloor(out) {
  assert.ok(out && typeof out === 'object', 'extract result required');
  assert.equal(
    out.floor,
    LIT_REVIEW_SAFETY_FLOOR,
    'extract must return LIT_REVIEW_SAFETY_FLOOR object identity',
  );
  assert.equal(out.floor.requireQuoteGrounding, true);
  assert.equal(out.floor.oneCallPerPaperExtraction, true);
  assert.equal(out.floor.minGroundedClaimsPerPaper, 1);
  assert.equal(out.calls, 1, 'oneCallPerPaperExtraction: exactly one agent call');
  assert.ok(
    Array.isArray(out.ledger?.assumptions) && out.ledger.assumptions.length >= 1,
    'minGroundedClaimsPerPaper ≥ 1 after quote-grounding',
  );
  return true;
}

/**
 * Shadow extract that does NOT read LIT_REVIEW_SAFETY_FLOOR — used to prove
 * the golden fixture fails closed when floor is not consumed.
 */
function shadowExtractWithoutFloor() {
  return {
    ledger: { assumptions: [{ id: 'A-shadow', statement: 'ungrounded theater', type: 'CLAIMED' }] },
    rejected: [],
    calls: 3,
    // deliberately omit floor / return a thinned fake
    floor: {
      requireQuoteGrounding: false,
      oneCallPerPaperExtraction: false,
      minGroundedClaimsPerPaper: 0,
    },
    minGroundedClaimsPerPaper: 0,
  };
}

function walkJsFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'scratch' || name === 'litreview-out') continue;
      walkJsFiles(p, acc);
    } else if (name.endsWith('.mjs') || name.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

test('B7-C3-floor: matrix LITE|FULL|SPIKE(+aliases) floor fields exact-true', () => {
  assert.ok(Object.isFrozen(LIT_REVIEW_SAFETY_FLOOR));
  assert.equal(EXTRACT_FLOOR, LIT_REVIEW_SAFETY_FLOOR);

  for (const token of BAND_MATRIX) {
    const knobs = literatureReviewKnobs(token);
    assert.ok(knobs, `literatureReviewKnobs(${token}) must resolve`);
    // Floor is not a knobs field and is identical for every band.
    for (const key of [...FLOOR_TRUE_FIELDS, 'minGroundedClaimsPerPaper']) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(knobs, key),
        false,
        `knobs for ${token} must omit floor key ${key}`,
      );
    }
    const resolved = resolveLiteratureReviewBand({ confirmedDepth: token, env: {} });
    assert.equal(resolved.floor, LIT_REVIEW_SAFETY_FLOOR);
    assert.equal(resolved.floor.requireQuoteGrounding, true);
    assert.equal(resolved.floor.oneCallPerPaperExtraction, true);
    assert.equal(resolved.floor.minGroundedClaimsPerPaper, 1);
  }
});

test('B7-C3-floor: LITE extract consumes floor; grounded kept, fabricated rejected', async () => {
  let calls = 0;
  const agent = async () => {
    calls += 1;
    return {
      assumptions: [
        {
          claim_id: 'c-ok',
          statement: 'Method improves throughput',
          quote: GROUNDED_QUOTE,
          column: 'method',
        },
        {
          claim_id: 'c-fake',
          statement: 'Accuracy is 99%',
          quote: 'we invent ninety nine percent accuracy claims',
          column: 'accuracy',
        },
      ],
    };
  };

  const out = await extractLedgerLean(PAPER, PAPER_TEXT, ['method', 'accuracy'], agent);
  assert.equal(calls, 1);
  assertExtractConsumedFloor(out);
  assert.equal(out.ledger.assumptions.length, 1);
  assert.equal(out.ledger.assumptions[0].claim_id, 'c-ok');
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].rejection, /FABRICATED-QUOTE/);
});

test('B7-C3-floor: LITE extract fixture fails when floor is not consumed (shadow)', () => {
  const shadow = shadowExtractWithoutFloor();
  assert.throws(
    () => assertExtractConsumedFloor(shadow),
    (err) => {
      // AssertionError from node:assert when floor identity / fields fail
      assert.ok(err, 'shadow must fail the floor-consumption golden');
      return true;
    },
  );
});

test('B7-C3-floor: minGroundedClaimsPerPaper fail-closed when only fabricated quotes', async () => {
  const agent = async () => ({
    assumptions: [
      {
        claim_id: 'c-fake',
        statement: 'all invented',
        quote: 'this quote is not in the paper body at all',
        column: 'method',
      },
    ],
  });
  await assert.rejects(
    () => extractLedgerLean(PAPER, PAPER_TEXT, ['method'], agent),
    (err) => {
      assert.equal(err && err.code, 'LIT_REVIEW_MIN_GROUNDED_CLAIMS');
      assert.equal(err.floor, LIT_REVIEW_SAFETY_FLOOR);
      return true;
    },
  );
});

test('B7-C3-floor: rounds=0 compose skip does not thin extraction floor', async () => {
  let governed = 0;
  const compose = await composeLiteratureReviewAdversarialPass({
    ledger: { assumptions: [] },
    band: 'LITE',
    knobs: { adversarialRounds: 0, snowballDepth: literatureReviewKnobs('LITE').snowballDepth },
    agent: async () => ({ findings: [] }),
    stakes: 'low',
    northStar: 'B7-C3 rounds=0',
    runGovernedRound: async () => {
      governed += 1;
      return { tally: { verdict: 'GO', blockers: [] } };
    },
    recommendResearchPrimeIntake: () => ({ tier: 'Standard', depth: 'LITE', rationale: 'stub' }),
    resolveResearchPrimeIntakeLock: () => ({
      lock: { tier: 'Standard', depth: 'LITE', source: 'confirm', lockedAt: '1970-01-01T00:00:00.000Z' },
      knobs: {},
    }),
  });
  assert.equal(compose.skipped, true);
  assert.equal(compose.invokeCount, 0);
  assert.equal(governed, 0);
  assert.equal(compose.floor, LIT_REVIEW_SAFETY_FLOOR);
  assert.equal(compose.floor.requireQuoteGrounding, true);
  assert.equal(compose.floor.oneCallPerPaperExtraction, true);

  // Concurrent extract still full-strength under floor (GWT: compose skip ⇏ thin extract).
  const agent = async () => ({
    assumptions: [
      {
        claim_id: 'c-ok',
        statement: 'Method improves throughput',
        quote: GROUNDED_QUOTE,
        column: 'method',
      },
    ],
  });
  const extract = await extractLedgerLean(PAPER, PAPER_TEXT, ['method'], agent);
  assertExtractConsumedFloor(extract);
});

test('B7-C3-floor: load-or-init hard-fail on thinned floor fields false/0', () => {
  assert.throws(
    () =>
      assertLiteratureReviewBandInvariants({
        FULL: { snowballDepth: 3, adversarialRounds: 2, ceremony: 'full', seats: 'frontier' },
        LITE: {
          snowballDepth: 1,
          adversarialRounds: 1,
          ceremony: 'lite',
          seats: 'standard',
          requireQuoteGrounding: false,
        },
        SPIKE: { snowballDepth: 2, adversarialRounds: 1, ceremony: 'spike-first', seats: 'frontier' },
      }),
    (err) => {
      assert.equal(err && err.code, 'LIT_REVIEW_BAND_INVARIANT');
      return true;
    },
  );
  assert.throws(
    () =>
      assertLiteratureReviewBandInvariants({
        FULL: { snowballDepth: 3, adversarialRounds: 2, ceremony: 'full', seats: 'frontier' },
        LITE: {
          snowballDepth: 1,
          adversarialRounds: 1,
          ceremony: 'lite',
          seats: 'standard',
          oneCallPerPaperExtraction: 0,
        },
        SPIKE: { snowballDepth: 2, adversarialRounds: 1, ceremony: 'spike-first', seats: 'frontier' },
      }),
    (err) => {
      assert.equal(err && err.code, 'LIT_REVIEW_BAND_INVARIANT');
      return true;
    },
  );
});

test('B7-C3-floor: secondary deny-list — production must not assign floor false/0', () => {
  const files = [...walkJsFiles(SRC_DIR), ...walkJsFiles(BIN_DIR)];
  assert.ok(files.length > 0, 'expected production .mjs under src/ and bin/');

  const forbidden = [
    /requireQuoteGrounding\s*[:=]\s*false\b/,
    /oneCallPerPaperExtraction\s*[:=]\s*false\b/,
    /minGroundedClaimsPerPaper\s*[:=]\s*0\b/,
    /requireQuoteGrounding\s*[:=]\s*0\b/,
    /oneCallPerPaperExtraction\s*[:=]\s*0\b/,
  ];

  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const re of forbidden) {
      if (re.test(text)) {
        hits.push(`${file}: matched ${re}`);
      }
    }
  }
  assert.equal(
    hits.length,
    0,
    `secondary deny-list: production floor thinned false/0:\n${hits.join('\n')}`,
  );
});

test('B7-C3-floor: secondary deny-list — no second depth→snowball/rounds table in skill production', () => {
  // Sole production reader is literatureReviewKnobs / resolve via triage-lock-apply.
  // Fail if production modules invent a hand-rolled LITE/FULL/SPIKE table that
  // assigns both snowballDepth and adversarialRounds (outside imports of mapping).
  const files = [...walkJsFiles(SRC_DIR), ...walkJsFiles(BIN_DIR)];
  const hits = [];

  // Pattern: object literal with both snowballDepth and adversarialRounds keyed by depth tokens.
  const dualKnobTable =
    /(?:LITE|FULL|SPIKE)\s*:\s*\{[^}]{0,200}snowballDepth\s*:\s*\d+[^}]{0,200}adversarialRounds\s*:\s*\d+/s;

  for (const file of files) {
    const base = file.replace(/\\/g, '/');
    // triage-lock-apply and adversarial-compose consume knobs; extraction has no table.
    // Allow files that only import/read literatureReviewKnobs without embedding a table.
    const text = readFileSync(file, 'utf8');
    if (dualKnobTable.test(text)) {
      hits.push(base);
    }
  }

  assert.equal(
    hits.length,
    0,
    `secondary deny-list: second hand-rolled depth→snowball/rounds table:\n${hits.join('\n')}`,
  );

  // Positive: sole reader module must still import literatureReviewKnobs from triage mapping.
  const lockApply = readFileSync(join(SRC_DIR, 'triage-lock-apply.mjs'), 'utf8');
  assert.match(
    lockApply,
    /literatureReviewKnobs/,
    'triage-lock-apply must use literatureReviewKnobs sole reader',
  );
  assert.match(
    lockApply,
    /foundry\/triage\/mapping\.mjs/,
    'triage-lock-apply must resolve knobs via foundry/triage mapping',
  );
});
