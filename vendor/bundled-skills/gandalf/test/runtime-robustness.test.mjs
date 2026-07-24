// Gandalf runtime host — INPUT robustness (the live-smoke lesson).
//
// A real `claude -p` Gandalf run produces excellent content but is NOT byte-perfect against the
// committed schema: the first real run failed with `$.nitpicks[1]: missing required key 'verdict'`,
// which killed the WHOLE read. The host must be LENIENT on the model's raw INPUT (normalize each item
// to the required keys with honest defaults; drop/degrade an un-salvageable item per-item) while keeping
// its OUTPUT strictly canary-conformant. These tests pin that contract — they FAIL against the pre-fix
// strict passthrough. (Hermetic, no model/network; the seams/canary are the shipped engine.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySeamPass, SeamPassInputError } from '../runtime/seam-pass.mjs';
import { runHost } from '../runtime/gandalf-run.mjs';
import { assertIncrement1Conformant } from './harness.mjs';

function baseDraft(extra = {}) {
  return {
    reasoning: 'The project is mostly sound but two "done" claims overstate readiness.',
    verdict: 'Sound core; the handoff seam is the real risk.',
    findings: [], nitpicks: [], elevations: [],
    ...extra,
  };
}

test('a nitpick missing the required verdict key is normalized, not fatal (the live-smoke bug)', () => {
  const d = baseDraft({ nitpicks: [
    { id: 'n-a', rung: 'UNVERIFIED', reasoning: 'minor naming', verdict: 'rename it' },
    { id: 'n-b', rung: 'UNVERIFIED', reasoning: 'a nitpick with NO verdict key' }, // <- the real failure
  ] });
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out),
    'the output must be conformant despite a nitpick missing verdict');
  assert.equal(out.nitpicks.length, 2, 'both nitpicks preserved');
  assert.equal(typeof out.nitpicks[1].verdict, 'string', 'the missing verdict is filled as a string');
});

test('a finding with a missing/invalid rung is honestly defaulted to UNVERIFIED', () => {
  const d = baseDraft({ findings: [
    { id: 'f1', kind: 'diagnose', reasoning: 'status-vs-claimed gap', verdict: 'real' }, // no rung
  ] });
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.equal(out.findings[0].rung, 'UNVERIFIED');
});

test('an anticipate finding missing its future-state is preserved as a generic finding (run conformant)', () => {
  const d = baseDraft({ findings: [
    { id: 'a1', kind: 'anticipate', rung: 'UNVERIFIED', reasoning: 'a coming problem', verdict: 'watch it' },
  ] }); // no future_state_condition / enabling_assumption → composeAnticipation would refuse
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out),
    'a half-formed anticipate must not fail the whole run');
  assert.equal(out.findings.length, 1, 'the content is preserved');
  assert.notEqual(out.findings[0].kind, 'anticipate',
    'the un-composable anticipate kind is stripped to a generic finding');
});

test('omitted item arrays are coerced to [] (a model emitting no nitpicks is not an error)', () => {
  const out = applySeamPass({ reasoning: 'r', verdict: 'v' }); // no findings/nitpicks/elevations
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.nitpicks, []);
  assert.deepEqual(out.elevations, []);
});

test('an elevation missing required keys is normalized + lands at the honest SPECULATIVE floor', () => {
  const d = baseDraft({ elevations: [{ reasoning: 'adopt pattern Y from field X' }] }); // bare
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.equal(out.elevations.length, 1);
  assert.equal(out.elevations[0].tier, 'SPECULATIVE');
  assert.ok(['low', 'medium', 'high'].includes(out.elevations[0].value_if_true));
});

test('genuinely empty/garbage input still fails honestly (no fabrication)', () => {
  assert.throws(() => applySeamPass({ findings: [], nitpicks: [], elevations: [] }), SeamPassInputError);
  assert.throws(() => applySeamPass(null), SeamPassInputError);
});

test('an out-of-enum severity is mapped from a synonym (the 6-project-run bug: moderate/info)', () => {
  const d = baseDraft({ findings: [
    { id: 'f1', kind: 'diagnose', rung: 'CLAIMED', severity: 'moderate', reasoning: 'x', verdict: 'y' },
    { id: 'f2', kind: 'diagnose', rung: 'CLAIMED', severity: 'info', reasoning: 'x', verdict: 'y' },
  ] });
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out),
    'a severity synonym must be mapped, not fail the whole read');
  assert.equal(out.findings[0].severity, 'major');  // moderate -> major
  assert.equal(out.findings[1].severity, 'minor');  // info -> minor
});

test('an unmappable severity is dropped (optional field), the finding survives', () => {
  const d = baseDraft({ findings: [
    { id: 'f1', kind: 'diagnose', rung: 'CLAIMED', severity: 'spicy', reasoning: 'x', verdict: 'y' },
  ] });
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.equal(out.findings.length, 1);
  assert.ok(!('severity' in out.findings[0]), 'an unknown severity is dropped');
});

test('an out-of-enum kind is dropped (-> generic finding), run still conformant', () => {
  const d = baseDraft({ findings: [
    { id: 'f1', kind: 'analysis', rung: 'CLAIMED', reasoning: 'x', verdict: 'y' }, // "analysis" not in enum
  ] });
  const out = applySeamPass(d);
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.equal(out.findings.length, 1);
  assert.ok(!('kind' in out.findings[0]) || _KINDS_OK(out.findings[0].kind),
    'an invalid kind is dropped');
});
function _KINDS_OK(k) { return ['diagnose','situate','anticipate','nitpick'].includes(k); }

// --- runHost-level degrade (the cross-model/fused-draft lesson, 2026-07-05) --------------------
// applySeamPass is conformant-by-construction for well-shaped items, but a real (esp. cross-model /
// fused) draft can still produce output that trips the CANARY — e.g. more nitpicks than the
// pre-registered cap (applySeamPass normalizes items but does NOT trim to caps). Pre-fix that crashed
// the WHOLE read (host-nonzero-exit). runHost must DEGRADE to the largest conformant subset instead,
// honestly stamped, while a genuinely malformed DRAFT still fails.
test('runHost degrades a canary-tripping draft (over-cap nitpicks) to a conformant subset, not a crash', () => {
  const d = baseDraft({
    findings: [{ id: 'd-1', kind: 'diagnose', rung: 'OBSERVED', severity: 'minor', reasoning: 'x', verdict: 'y' }],
    nitpicks: Array.from({ length: 8 }, (_, i) => ({ id: `n-${i}`, rung: 'CLAIMED', reasoning: 'x', verdict: 'y' })),
  });
  let out;
  assert.doesNotThrow(() => { out = runHost(JSON.stringify(d), { cross_model: true }); },
    'an over-cap draft must degrade, never crash the whole read');
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the degraded output is still canary-conformant');
  assert.equal(out.degraded, true, 'the salvage is honestly stamped degraded');
  assert.ok(out.reasoning.includes('Grading degraded'), 'an honest degrade note is appended to the reasoning');
  assert.equal(out.findings.length, 1, 'the salvageable finding is preserved');
  assert.ok(out.nitpicks.length <= 7, 'the over-cap nitpicks are trimmed under the pre-registered cap');
});

test('runHost keeps a clean draft clean (no false degradation)', () => {
  const d = baseDraft({ findings: [
    { id: 'd-1', kind: 'diagnose', rung: 'OBSERVED', severity: 'major', reasoning: 'x', verdict: 'y' },
  ] });
  const out = runHost(JSON.stringify(d), { cross_model: true });
  assert.doesNotThrow(() => assertIncrement1Conformant(out));
  assert.equal(out.degraded, false, 'a conformant draft is NOT marked degraded');
  assert.equal(out.findings.length, 1);
});

test('runHost still fails honestly on genuinely malformed input (no salvage of garbage)', () => {
  assert.throws(() => runHost(JSON.stringify({ findings: [] })), SeamPassInputError); // no reasoning/verdict
  assert.throws(() => runHost('not valid json'), SeamPassInputError);
});

// --- W2 (2026-07-11): run-capture for training (AGENTS.md "Run capture" standard) ---
test('writeRunRecord: one machine-readable record lands under journal/runs/, never the NNNN namespace', async () => {
  const { writeRunRecord } = await import('../runtime/gandalf-run.mjs');
  const { mkdtempSync, readFileSync, rmSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const os = await import('node:os');
  const dir = mkdtempSync(join(os.tmpdir(), 'gandalf-runrec-'));
  // The capture gate skips under NODE_TEST_CONTEXT (real-runs-only provenance);
  // lift it for this one unit test of the real-write path, then restore.
  const prevCtx = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const file = writeRunRecord({
      tier: 'tier1-deterministic', started: '2026-07-11T00:00:00.000Z', ended: '2026-07-11T00:00:05.000Z',
      input: 'draft.json', params: { live: false }, output: 'read.json',
      result: 'graded: 2 elevation(s)', cross_model: false, models: null, duration_s: 5, journal_ref: null,
    }, { skillDir: dir });
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(rec.skill, 'gandalf');
    for (const k of ['tier', 'started', 'ended', 'input', 'params', 'output', 'result', 'cross_model', 'duration_s']) {
      assert.ok(k in rec, `record carries ${k}`);
    }
    // The record lives in journal/runs/, and ONLY there (the NNNN namespace stays human-only).
    assert.deepEqual(readdirSync(join(dir, 'journal')), ['runs']);
    // Capture is best-effort: an unwritable skillDir returns null, never throws.
    assert.equal(writeRunRecord({ tier: 'x' }, { skillDir: '\0invalid' }), null);
    // Provenance gate: under the test runner, capture is a silent no-op — the
    // suite's own CLI spawns can never pollute the training feed.
    process.env.NODE_TEST_CONTEXT = '1';
    assert.equal(writeRunRecord({ tier: 'x' }, { skillDir: dir }), null);
  } finally {
    if (prevCtx === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = prevCtx;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- C2 (2026-07-11): the scaled path regains the honesty envelope ---
test('gradeScaledReport: prose AND draft-JSON scaled reports come back STAMPED, never raw prose', async () => {
  const { gradeScaledReport } = await import('../runtime/gandalf-run.mjs');
  // (a) a prose report (today's reduce output) is wrapped + graded — stamped envelope out.
  const prose = 'The repo is well-factored; the main risk is the unbounded cache in loader.mjs.';
  const g1 = gradeScaledReport(prose);
  assert.equal(typeof g1, 'object');
  assert.equal(g1.degraded, true, 'the scaled path is honestly degraded (no live refuters ran)');
  assert.equal(g1.cross_model, false);
  assert.ok(g1.reasoning.includes('unbounded cache'), 'the advisory content survives inside the envelope');
  assert.ok(Array.isArray(g1.findings) && Array.isArray(g1.elevations), 'schema shape present');
  // (b) a reduce seat that emits RAW-DRAFT JSON is graded directly (no wrap).
  const draft = JSON.stringify({
    reasoning: 'draft-form reduce output', verdict: 'sound',
    findings: [], nitpicks: [], elevations: [],
  });
  const g2 = gradeScaledReport(draft);
  assert.equal(g2.degraded, true);
  assert.equal(g2.reasoning, 'draft-form reduce output');
  // (c) the map-reduce degradation stamp is carried forward, never dropped.
  const boxed = Object.assign(new String('stamped prose report'), { stamp: '[degraded:true] partial coverage' });
  const g3 = gradeScaledReport(boxed);
  assert.match(g3.scaled_stamp || '', /degraded/);
});
