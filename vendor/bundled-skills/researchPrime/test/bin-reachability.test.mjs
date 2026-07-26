// P2 2026-07-25 — the anti-dark-module lint (journal-hardening review, researchPrime §3/§5).
//
// The T9 governor orphan (built, tested, documented as live, NEVER called from the
// canonical path) survived two portfolio reviews because nothing ever asked "is this
// module REACHED?". canonical-copy.test.mjs proves no module is FORKED; this test
// proves every bin/*.mjs is REACHABLE from a canonical entry point (run-rounds.mjs /
// plan-gate.mjs) or is an explicitly-allowlisted standalone tool. A new module that is
// neither wired nor allowlisted fails the suite the day it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin');

// Standalone tools / documented non-engine entries — each line carries its WHY.
const ALLOWLIST = new Set([
  'dogfood.mjs',        // SKILL.md's canonical worked example (own CLI)
  'engine.mjs',         // documented "do NOT call" skeleton — TRIO_SURFACE export used by governor.mjs
  'matrix-planner.mjs', // governance-program planning tool (own surface)
  'facet-coverage.mjs', // STAGED seam for the 2D breadth-scoping effort (2026-07-21 handoff);
                        // the lit-review dual-suite fence asserts its presence on disk
]);

const ENTRIES = ['run-rounds.mjs', 'plan-gate.mjs'];

function localImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:import\s[^'"]*?|export\s[^'"]*?from\s*|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

test('every bin/*.mjs is reachable from a canonical entry, or allowlisted with a reason', () => {
  const all = fs.readdirSync(BIN).filter((f) => f.endsWith('.mjs'));
  const reached = new Set();
  const queue = ENTRIES.map((e) => path.join(BIN, e));
  while (queue.length) {
    const cur = queue.pop();
    const rel = path.relative(BIN, cur).split(path.sep).join('/');
    if (reached.has(rel)) continue;
    if (!fs.existsSync(cur)) continue;
    reached.add(rel);
    for (const imp of localImports(cur)) {
      const target = path.resolve(path.dirname(cur), imp);
      const cand = fs.existsSync(target) && fs.statSync(target).isFile() ? target
        : fs.existsSync(`${target}.mjs`) ? `${target}.mjs` : null;
      if (cand && cand.startsWith(BIN)) queue.push(cand);
    }
  }
  const dark = all.filter((f) => !reached.has(f) && !ALLOWLIST.has(f));
  assert.deepEqual(dark, [],
    `DARK bin module(s) — not reachable from ${ENTRIES.join('/')} and not allowlisted: ` +
    `${dark.join(', ')}. Wire it into a canonical path, or allowlist it here WITH a reason ` +
    `(see _archive/dark-modules-2026-07-25/ARCHIVED.md for what happens otherwise).`);
});
