// P2 2026-07-25 — the thin CLI (bin/ramanujan-run.mjs): the entry point that ends the
// zero-runs deadlock. Hermetic: the firewall subprocess is a deterministic child node
// process (exact arithmetic) — no model, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArith, claimFromText } from '../bin/ramanujan-run.mjs';
import { recognize } from '../src/firewall-grammar.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ramanujan-run.mjs');

test('parseArith produces in-grammar ASTs (ints, rationals, precedence, parens, negation)', () => {
  for (const src of ['12*37+9', '1/3 + 1/6', '-(2+3)*4', '(1-2)/(3+4)']) {
    const ast = parseArith(src);
    assert.equal(recognize(ast).inGrammar, true, `${src} must be in-grammar`);
  }
  assert.throws(() => parseArith('x + 1'), /not grammar arithmetic/);
  assert.throws(() => parseArith('2 ** 3'), /not grammar arithmetic/);
});

test('claimFromText: equations become computational claims; prose becomes an honest proof-bearing claim', () => {
  const eq = claimFromText('2+2 = 4', 1);
  assert.equal(eq.type, 'computational');
  assert.ok(eq.expr, 'equation claims carry the LHS-RHS expr');
  const prose = claimFromText('the Riemann hypothesis holds', 2);
  assert.equal(prose.type, 'proof-bearing');
  assert.equal(prose.expr, undefined);
});

test('CLI end-to-end: true HOLDS, false REFUTED with the exact value, prose UNSETTLED — never a false green', () => {
  const r = spawnSync(process.execPath, [
    CLI,
    '--claim', '12*37+9 = 453',
    '--claim', '2+2 = 5',
    '--claim', 'the Riemann hypothesis holds',
  ], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(r.status, 0, `CLI must exit 0 (stderr: ${r.stderr})`);
  const out = JSON.parse(r.stdout);
  const byId = Object.fromEntries(out.summary.map((s) => [s.id, s]));
  assert.match(byId['cli::c1'].verdict, /^HOLDS/, 'a true equation is certified HOLDS');
  assert.match(byId['cli::c2'].verdict, /^REFUTED/, 'a FALSE equation must be REFUTED — the engine verdict certifies the computation, and the read-off must never present it as the equation being true');
  assert.equal(byId['cli::c2'].exact_value, '-1', 'the refutation carries the exact certified value');
  assert.match(byId['cli::c3'].verdict, /^UNSETTLED/, 'a proof-bearing claim is honestly not asserted');
  assert.equal(out.certifierArmed, true, 'the real firewall-subprocess certifier armed on this host');
});
