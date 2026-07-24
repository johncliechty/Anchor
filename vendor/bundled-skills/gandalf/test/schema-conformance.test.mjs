// Gandalf advisor — schema-conformance suite (Wave 1 / GATE-0).
// The wave's second scenario: an empty schema-conformant advisor output passes the suite
// (shape, reasoning-before-verdict, nitpick/elevation caps). Planted shape violations FAIL,
// proving the validator is real and not vacuously green.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateShape, assertConformant } from './harness.mjs';
import { emptyConformantOutput } from './fixtures.mjs';

test('an empty schema-conformant output passes the full conformance check', () => {
  const out = emptyConformantOutput();
  assert.deepEqual(validateShape(out), [], 'empty conformant output must have zero shape errors');
  assert.doesNotThrow(() => assertConformant(out), 'shape + reasoning-before-verdict + caps must all pass');
});

test('a missing required top-level key FAILS shape validation', () => {
  const out = emptyConformantOutput();
  delete out.findings;
  const errors = validateShape(out);
  assert.ok(errors.some((e) => /missing required key 'findings'/.test(e)), errors.join('; '));
  assert.throws(() => assertConformant(out), /schema-conformance FAILED/);
});

test('a wrong-typed field FAILS shape validation', () => {
  const out = emptyConformantOutput();
  out.degraded = 'no'; // must be boolean
  const errors = validateShape(out);
  assert.ok(errors.some((e) => /\$\.degraded: expected type boolean/.test(e)), errors.join('; '));
});

test('an out-of-enum rung on a finding FAILS shape validation', () => {
  const out = emptyConformantOutput();
  out.findings.push({ id: 'f1', rung: 'GOSPEL', reasoning: 'r', verdict: 'v' });
  const errors = validateShape(out);
  assert.ok(errors.some((e) => /not in enum/.test(e)), errors.join('; '));
});

test('a finding missing a required key FAILS shape validation', () => {
  const out = emptyConformantOutput();
  out.findings.push({ id: 'f1', reasoning: 'r', verdict: 'v' }); // no rung
  const errors = validateShape(out);
  assert.ok(errors.some((e) => /missing required key 'rung'/.test(e)), errors.join('; '));
});

test('a conformant output with one well-formed finding still passes', () => {
  const out = emptyConformantOutput();
  out.findings.push({ id: 'f1', rung: 'CLAIMED', reasoning: 'because X', verdict: 'X holds', kind: 'diagnose' });
  assert.deepEqual(validateShape(out), []);
  assert.doesNotThrow(() => assertConformant(out));
});
