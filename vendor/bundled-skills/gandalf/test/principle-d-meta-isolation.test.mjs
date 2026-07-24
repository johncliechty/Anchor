// Gandalf advisor — Wave 7: the PRINCIPLE-D META-ISOLATION test (proves, never merely asserts).
//
// Wave 7 done-when scenario: "Given the LLM/cross-family judge endpoint is made UNREACHABLE, When
// the gate runs, Then `node --test` still exits 0 on a conformant fixture (oracle/judge provably
// non-gating — PRINCIPLE-D)."
//
// This file PROVES that, not just claims it, three ways:
//   1. BEHAVIOURAL — the judge endpoint is GENUINELY unreachable (the raw adapter throws), the
//      advisory wrapper DEGRADES honestly and never gates, and the deterministic gate
//      (assertIncrement1Conformant) STILL passes on a conformant Gandalf v1 fixture.
//   2. STRUCTURAL — the deterministic gate's STATIC IMPORT CLOSURE (harness.mjs + every seam it
//      transitively imports) provably EXCLUDES seam/oracle.mjs and seam/anti-laundering.mjs. Since
//      the gate never imports the judge, its exit code cannot depend on the judge's reachability —
//      this is why `node --test` still exits 0 no matter the endpoint state.
//   3. NEGATIVE CONTROL — a REACHABLE endpoint changes the ADVISORY artifact (judged:true) but does
//      NOT change the gate outcome (still passes). Reachability moves the advisory, never the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { assertIncrement1Conformant } from './harness.mjs';
import { gandalfV1FullOutput } from './fixtures.mjs';
import {
  callCrossFamilyJudge,
  adviseElevationOracle,
  unreachableEndpoint,
  CrossFamilyJudgeUnreachable,
  CROSS_FAMILY_JUDGE_KIND,
} from '../seam/oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// === 1. BEHAVIOURAL: judge UNREACHABLE, deterministic gate STILL passes ========================
test('PRINCIPLE-D: the judge endpoint is GENUINELY unreachable (the raw adapter throws)', () => {
  const elevation = gandalfV1FullOutput().elevations[0];
  // The injected endpoint is unreachable…
  assert.throws(
    () => callCrossFamilyJudge(elevation, { endpoint: unreachableEndpoint }),
    CrossFamilyJudgeUnreachable,
    'an unreachable endpoint makes the raw cross-family judge throw'
  );
  // …and a missing endpoint is likewise unreachable (no judge wired at all).
  assert.throws(
    () => callCrossFamilyJudge(elevation, {}),
    CrossFamilyJudgeUnreachable,
    'no wired endpoint ⇒ unreachable'
  );
});

test('PRINCIPLE-D: with the judge UNREACHABLE, the deterministic gate STILL passes on a conformant fixture', () => {
  const out = gandalfV1FullOutput();

  // The advisory oracle is run with the judge unreachable. It DEGRADES honestly and, crucially,
  // NEVER throws and is stamped NON-GATING — so it cannot turn judge-unreachability into a failure.
  const advisory = adviseElevationOracle(out, { endpoint: unreachableEndpoint });
  assert.equal(advisory.gating, false, 'the advisory artifact is NEVER a gate');
  assert.equal(advisory.degraded, true, 'an unreachable judge ⇒ honest degraded advisory');
  assert.equal(advisory.judged, false, 'nothing was judged (the judge was unreachable)');
  assert.equal(advisory.kind, CROSS_FAMILY_JUDGE_KIND);

  // THE LOAD-BEARING ASSERTION: the deterministic gate passes regardless of the unreachable judge.
  assert.doesNotThrow(
    () => assertIncrement1Conformant(out),
    'the deterministic gate exits clean with the cross-family judge unreachable — PRINCIPLE-D'
  );
});

// === 2. STRUCTURAL: the gate's static import closure EXCLUDES the advisory layer ================
/** Build the STATIC import closure of an entry .mjs file: the set of project files reachable by
 *  following relative `import ... from '...'` / `export ... from '...'` specifiers. Deterministic
 *  (no execution); proves what the gate CAN and CANNOT depend on. */
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
      continue; // a non-readable / non-file specifier (e.g. a bare module) is not in the closure
    }
    for (const re of [importRe, bareImportRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue; // bare specifiers (node:..., JSON deps) are not project files
        stack.push(resolve(dirname(file), spec));
      }
    }
  }
  return seen;
}

test('PRINCIPLE-D (structural): the gate import closure provably EXCLUDES the advisory oracle/judge', () => {
  const closure = staticImportClosure(resolve(HERE, 'harness.mjs'));
  const closureList = [...closure];

  // The advisory layer is NOT in the deterministic gate's import closure — it CANNOT influence the gate.
  assert.ok(
    !closureList.some((f) => f.endsWith('oracle.mjs')),
    'seam/oracle.mjs (the cross-family judge) is NOT reachable from the deterministic gate'
  );
  assert.ok(
    !closureList.some((f) => f.endsWith('anti-laundering.mjs')),
    'seam/anti-laundering.mjs (the BLOCKED-this-cycle content-binding layer) is NOT reachable from the gate'
  );

  // Sanity: the closure DID resolve the real gate seams (the walker actually traversed, not vacuous).
  for (const seam of ['diagnose-core.mjs', 'situate.mjs', 'refute.mjs', 'anticipate.mjs', 'score-label.mjs']) {
    assert.ok(closureList.some((f) => f.endsWith(seam)), `the gate closure includes seam/${seam}`);
  }
});

// === 3. NEGATIVE CONTROL: a REACHABLE judge moves the advisory, never the gate =================
test('PRINCIPLE-D (control): a REACHABLE judge changes the advisory artifact but NOT the gate outcome', () => {
  const out = gandalfV1FullOutput();
  const reachableEndpoint = ({ elevation }) => ({ verdict: { id: elevation.id, elevates: true } });

  const advisory = adviseElevationOracle(out, { endpoint: reachableEndpoint });
  assert.equal(advisory.gating, false, 'even a reachable judge is NEVER a gate');
  assert.equal(advisory.degraded, false, 'a reachable judge ⇒ not degraded');
  assert.equal(advisory.judged, true, 'a reachable judge produces a real advisory verdict');
  assert.equal(advisory.verdicts.length, out.elevations.length, 'one advisory verdict per elevation');

  // The gate outcome is identical whether the judge is reachable or not — reachability never moves it.
  assert.doesNotThrow(() => assertIncrement1Conformant(out), 'the gate passes with a reachable judge too — same outcome');
});
