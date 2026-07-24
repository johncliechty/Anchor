// Gandalf advisor — Wave 8 canaries: the ADVISORY elevation-oracle HARNESS + fixture TOOLING.
//
// Wave 8 done-when (this half): the `elevations.jsonl` fixture-construction TOOLING + the paired
// A/B harness (cross-family judge ADAPTER, position-swap-with-agreement, length-control, answer-key
// scorer, CAT secondary, per-pillar baselines) are built with DETERMINISTIC unit tests green.
//
// The two frozen scenarios this file discharges (the harness LOGIC half):
//   • Given synthetic fixtures with KNOWN answer keys, when the harness scorer runs in unit tests,
//     then it produces the expected deterministic outputs (the harness logic is correct).
//   • Given the harness is built, when `node --test` runs, then it exits 0 — AND, structurally,
//     the harness is PROVABLY ADVISORY: the deterministic gate (test/harness.mjs) does NOT import
//     it, so the oracle's eventual verdict can never become a gate (PRINCIPLE-D).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ORACLE_HARNESS_KIND,
  ELEVATION_PILLARS,
  BINDING_BASELINES,
  bindingBaselineFor,
  NON_POOLABLE_ARMS,
  isPoolableArm,
  buildElevationFixture,
  toJsonl,
  parseJsonl,
  POSITION_VERDICTS,
  positionSwapWithAgreement,
  lengthControl,
  scoreAnswerKey,
  catSecondary,
  evaluateFixture,
} from '../seam/oracle-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- synthetic fixtures with KNOWN answer keys (built via the tooling under test) --------------
function situateFixture() {
  return buildElevationFixture({
    id: 'fx-situate-wal',
    pillar: 'situate',
    prompt: 'A durability subsystem that appends then applies — situate it against best-in-class designs.',
    answer_key: ['wal-recovery-ordering', 'group-commit', 'fsync-barrier'], // the must-surface items
    arm: 'real-history',
    source: 'design-history/wal-2019',
  });
}
function anticipateFixture() {
  return buildElevationFixture({
    id: 'fx-anticipate-backfill',
    pillar: 'anticipate',
    prompt: 'A single-threaded migration backfill running under rising write load — what is coming?',
    answer_key: ['backfill-falls-behind', 'lock-escalation'],
    arm: 'real-history',
  });
}

// === per-pillar BINDING BASELINES =============================================================
test('per-pillar binding baselines: SITUATE vs abstraction-equipped direct-researchPrime; ANTICIPATE vs diagnose-core+generic-premortem', () => {
  assert.deepEqual(ELEVATION_PILLARS, ['situate', 'anticipate']);
  assert.equal(bindingBaselineFor('situate'), 'abstraction-equipped-direct-researchprime');
  assert.equal(bindingBaselineFor('anticipate'), 'diagnose-core-plus-generic-premortem');
  assert.equal(BINDING_BASELINES.situate, bindingBaselineFor('situate'));
  assert.throws(() => bindingBaselineFor('diagnose'), /unknown pillar/, 'there is no baseline for a non-pillar');
});

// === the weak-panel / retrodiction NON-POOLING guard ==========================================
test('non-pooling guard: weak-panel / retrodiction arms are NEVER poolable; a real-history arm is', () => {
  assert.ok(isPoolableArm('real-history'), 'a real-history arm is poolable');
  assert.ok(isPoolableArm('gandalf'), 'an ordinary arm is poolable');
  for (const weak of NON_POOLABLE_ARMS) {
    assert.ok(!isPoolableArm(weak), `the weak arm '${weak}' must NOT be poolable`);
  }
  assert.ok(!isPoolableArm('Weak-Panel'), 'the guard is case-insensitive');
  assert.ok(!isPoolableArm(''), 'an empty arm is not poolable');
});

// === the elevations.jsonl fixture-construction TOOLING ========================================
test('buildElevationFixture: mints a validated fixture and pins its binding baseline + poolability', () => {
  const fx = situateFixture();
  assert.equal(fx.kind, 'elevation-fixture');
  assert.equal(fx.pillar, 'situate');
  assert.equal(fx.binding_baseline, 'abstraction-equipped-direct-researchprime');
  assert.deepEqual(fx.answer_key, ['wal-recovery-ordering', 'group-commit', 'fsync-barrier']);
  assert.equal(fx.poolable, true, 'a real-history fixture is poolable');

  // A weak-panel fixture is stamped non-poolable by the guard.
  const weak = buildElevationFixture({
    id: 'fx-weak', pillar: 'situate', prompt: 'p', answer_key: ['x'], arm: 'weak-panel',
  });
  assert.equal(weak.poolable, false, 'a weak-panel fixture must be stamped non-poolable');
});

test('buildElevationFixture: rejects malformed fixtures (bad pillar, empty/dup answer key, missing fields)', () => {
  assert.throws(() => buildElevationFixture({ pillar: 'situate', prompt: 'p', answer_key: ['x'] }), /non-empty id/);
  assert.throws(() => buildElevationFixture({ id: 'a', pillar: 'nope', prompt: 'p', answer_key: ['x'] }), /pillar/);
  assert.throws(() => buildElevationFixture({ id: 'a', pillar: 'situate', prompt: '', answer_key: ['x'] }), /non-empty prompt/);
  assert.throws(() => buildElevationFixture({ id: 'a', pillar: 'situate', prompt: 'p', answer_key: [] }), /non-empty answer_key/);
  assert.throws(
    () => buildElevationFixture({ id: 'a', pillar: 'situate', prompt: 'p', answer_key: ['x', 'x'] }),
    /empty or duplicate/,
    'duplicate answer-key ids are rejected'
  );
});

test('toJsonl / parseJsonl: round-trip a fixture corpus losslessly; a malformed line throws with its line number', () => {
  const corpus = [situateFixture(), anticipateFixture()];
  const jsonl = toJsonl(corpus);
  assert.equal(jsonl.split('\n').filter((l) => l.trim() !== '').length, 2, 'one JSON object per line');
  assert.ok(jsonl.endsWith('\n'), 'JSONL ends with a trailing newline');
  assert.deepEqual(parseJsonl(jsonl), corpus, 'round-trip is lossless');
  assert.deepEqual(parseJsonl(''), [], 'empty input parses to an empty corpus');
  assert.deepEqual(parseJsonl('\n\n'), [], 'blank lines are skipped');
  assert.throws(() => parseJsonl('{"id":1}\n{bad}\n'), /line 2/, 'a malformed line reports its 1-based number');
});

// === ANSWER-KEY SCORER (elevate_recall lower bound + false-elevation precision guard) ===========
test('scoreAnswerKey: KNOWN answer keys produce the EXPECTED deterministic recall + precision', () => {
  const key = situateFixture().answer_key; // 3 must-surface items

  // A perfect arm: caught all 3, no false elevations ⇒ recall 1, precision 1.
  const perfect = scoreAnswerKey({ elevated: ['wal-recovery-ordering', 'group-commit', 'fsync-barrier'] }, key);
  assert.equal(perfect.elevate_recall, 1);
  assert.equal(perfect.precision, 1);
  assert.deepEqual(perfect.false_negatives, []);

  // A partial arm: caught 2 of 3, with 1 FALSE elevation ⇒ recall 2/3, precision 2/3.
  const partial = scoreAnswerKey({ elevated: ['wal-recovery-ordering', 'group-commit', 'a-false-elevation'] }, key);
  assert.equal(partial.elevate_recall, 2 / 3);
  assert.equal(partial.precision, 2 / 3);
  assert.deepEqual(partial.false_positives, ['a-false-elevation'], 'the false elevation is surfaced');
  assert.deepEqual(partial.false_negatives, ['fsync-barrier'], 'the missed must-surface item is surfaced');

  // An arm that elevated nothing ⇒ recall 0 but precision 1 (it made no false claim).
  const silent = scoreAnswerKey({ elevated: [] }, key);
  assert.equal(silent.elevate_recall, 0);
  assert.equal(silent.precision, 1, 'precision is 1 when nothing was elevated (no false claim)');
});

test('scoreAnswerKey: accepts a bare id array or a fixture, dedups, and requires a non-empty key', () => {
  const key = ['a', 'b'];
  const r = scoreAnswerKey(['a', 'a', 'c'], key); // bare array + a duplicate + a false elevation
  assert.equal(r.elevate_recall, 1 / 2, 'deduped: caught a (of {a,b}) ⇒ recall 1/2');
  assert.deepEqual(r.true_positives, ['a']);
  assert.deepEqual(r.false_positives, ['c']);
  // A fixture carrying `answer_key` is accepted directly (the scorer reads its key).
  const viaFixture = scoreAnswerKey(['wal-recovery-ordering'], situateFixture());
  assert.equal(viaFixture.key_size, 3, 'a fixture carrying answer_key is accepted');
  assert.equal(viaFixture.elevate_recall, 1 / 3);
  assert.throws(() => scoreAnswerKey(['a'], []), /non-empty answer key/);
});

// === POSITION-SWAP-WITH-AGREEMENT (the position-bias control) ==================================
test('positionSwapWithAgreement: a decision counts ONLY when both presentation orders agree', () => {
  // Both orders pick gandalf: forward 'first' (A=gandalf) and swapped 'second' (A=gandalf in swapped order).
  const agree = positionSwapWithAgreement({ forward: 'first', swapped: 'second', armA: 'gandalf', armB: 'baseline' });
  assert.equal(agree.decided, true);
  assert.equal(agree.winner, 'gandalf');
  assert.equal(agree.position_bias, false);

  // Position bias: the judge picks whatever is shown FIRST regardless of arm ⇒ forward 'first'
  // (gandalf) but swapped 'first' (baseline) ⇒ they disagree ⇒ NO decision.
  const biased = positionSwapWithAgreement({ forward: 'first', swapped: 'first', armA: 'gandalf', armB: 'baseline' });
  assert.equal(biased.decided, false);
  assert.equal(biased.winner, null);
  assert.equal(biased.position_bias, true, 'first-position preference in both orders IS position bias');

  // Agreed tie ⇒ agreed but not decided (no winner).
  const tie = positionSwapWithAgreement({ forward: 'tie', swapped: 'tie' });
  assert.equal(tie.agreed, true);
  assert.equal(tie.decided, false);
  assert.equal(tie.winner, null);

  assert.deepEqual(POSITION_VERDICTS, ['first', 'second', 'tie']);
  assert.throws(() => positionSwapWithAgreement({ forward: 'best', swapped: 'tie' }), /not in/);
});

// === LENGTH-CONTROL (the verbosity confound) ==================================================
test('lengthControl: flags a length confound beyond tolerance; equal-length pairs pass', () => {
  const balanced = lengthControl('one two three four', 'four three two one'); // 4 vs 4 words
  assert.equal(balanced.within_tolerance, true);
  assert.equal(balanced.length_confound, false);
  assert.equal(balanced.longer, 'equal');
  assert.equal(balanced.ratio, 1);

  const lopsided = lengthControl('a b c d e f g h i j', 'short'); // 10 vs 1 words ⇒ confound
  assert.equal(lopsided.within_tolerance, false);
  assert.equal(lopsided.length_confound, true, 'a 10:1 length gap is a confound');
  assert.equal(lopsided.longer, 'A');

  const empty = lengthControl('', '');
  assert.equal(empty.length_confound, false, 'two empty responses are not a confound');
});

// === CAT SECONDARY (novelty × usefulness) =====================================================
test('catSecondary: novelty × usefulness, range-checked', () => {
  assert.deepEqual(catSecondary({ novelty: 0.8, usefulness: 0.5 }), { novelty: 0.8, usefulness: 0.5, cat_score: 0.4 });
  assert.equal(catSecondary({ novelty: 1, usefulness: 1 }).cat_score, 1);
  assert.equal(catSecondary({ novelty: 0, usefulness: 1 }).cat_score, 0);
  assert.throws(() => catSecondary({ novelty: 1.2, usefulness: 0.5 }), /novelty/);
  assert.throws(() => catSecondary({ novelty: 0.5, usefulness: -0.1 }), /usefulness/);
});

// === compose ONE advisory, NON-GATING A/B artifact ============================================
test('evaluateFixture: composes the full A/B into one advisory, NON-GATING artifact with the expected scores', () => {
  const fx = anticipateFixture(); // answer_key: ['backfill-falls-behind', 'lock-escalation']
  const artifact = evaluateFixture({
    fixture: fx,
    gandalf: { elevated: ['backfill-falls-behind', 'lock-escalation'], text: 'a b c d e' },
    baseline: { elevated: ['backfill-falls-behind'], text: 'a b c d f' },
    positionSwap: { forward: 'first', swapped: 'second' }, // both pick gandalf
    cat: { novelty: 0.7, usefulness: 0.9 },
  });
  // It is ADVISORY and NON-GATING — PRINCIPLE-D.
  assert.equal(artifact.kind, ORACLE_HARNESS_KIND);
  assert.equal(artifact.advisory, true);
  assert.equal(artifact.gating, false);
  // Per-pillar (never pooled across pillars) + binding baseline pinned.
  assert.equal(artifact.pillar, 'anticipate');
  assert.equal(artifact.binding_baseline, 'diagnose-core-plus-generic-premortem');
  // The expected deterministic scores: gandalf recall 1, baseline recall 1/2 ⇒ lift 1/2.
  assert.equal(artifact.gandalf.elevate_recall, 1);
  assert.equal(artifact.baseline.elevate_recall, 1 / 2);
  assert.equal(artifact.recall_lift, 1 / 2);
  assert.equal(artifact.position_swap.winner, 'gandalf');
  assert.equal(artifact.length_control.length_confound, false);
  assert.equal(artifact.cat_secondary.cat_score, 0.63);
  assert.throws(() => evaluateFixture({}), /requires a fixture object/);
});

// === STRUCTURAL PRINCIPLE-D: the gate does NOT import the advisory harness ======================
/** Static import closure of an entry .mjs (relative specifiers only) — the same walker the Wave-7
 *  meta-isolation test uses, reused here to prove the NEW Wave-8 advisory harness is also isolated. */
function staticImportClosure(entryAbsPath) {
  const seen = new Set();
  const stack = [entryAbsPath];
  const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g;
  const bareImportRe = /import\s*['"]([^'"]+)['"]/g;
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const re of [importRe, bareImportRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue;
        stack.push(resolve(dirname(file), spec));
      }
    }
  }
  return seen;
}

test('PRINCIPLE-D (structural): the deterministic gate does NOT import the Wave-8 advisory harness or power-calc', () => {
  const closure = [...staticImportClosure(resolve(HERE, 'harness.mjs'))];
  assert.ok(
    !closure.some((f) => f.endsWith('oracle-harness.mjs')),
    'seam/oracle-harness.mjs (the advisory A/B harness) is NOT reachable from the deterministic gate'
  );
  assert.ok(
    !closure.some((f) => f.endsWith('power-calc.mjs')),
    'seam/power-calc.mjs (the advisory power-calc) is NOT reachable from the deterministic gate'
  );
  // Sanity: the walker really traversed (it found the real gate seams).
  assert.ok(closure.some((f) => f.endsWith('score-label.mjs')), 'the walker did traverse the gate seams');
});
