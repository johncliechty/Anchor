// P0 2026-07-25 — the junction silent no-op (journals 0001-heavy-smoke, 0275, 0281, 0283).
//
// `invokedDirectly()` compared resolve(argv[1]) (the junction path the operator typed)
// against resolve(fileURLToPath(import.meta.url)) (the REAL target path) — which never
// match through a junction/symlink, so `node <junction>/runtime/gandalf-run.mjs` exited 0
// having written NOTHING: the worst failure mode for an honesty-first host. Four journal
// entries across 16 days, each worked around by hand-importing runHost. The fix realpaths
// (and on Windows case-folds) BOTH sides. This test spawns the real CLI through a real
// junction/symlink and fails against the pre-fix comparator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeLink(tmp) {
  const link = path.join(tmp, 'gandalf-linked');
  try {
    // Directory junction on Windows (no admin needed); symlink elsewhere.
    if (process.platform === 'win32') {
      const r = spawnSync('cmd.exe', ['/c', 'mklink', '/J', link, SKILL_ROOT], { windowsHide: true });
      if (r.status !== 0) return null;
    } else {
      fs.symlinkSync(SKILL_ROOT, link, 'dir');
    }
    return link;
  } catch {
    return null;
  }
}

test('CLI invoked through a junction/symlink RUNS (no silent exit-0 no-op)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gandalf-junction-'));
  try {
    const link = makeLink(tmp);
    if (!link) {
      // Cannot create a link in this environment — inconclusive, not a failure.
      test.skip;
      return;
    }
    const draftPath = path.join(tmp, 'draft.json');
    const outPath = path.join(tmp, 'out.json');
    fs.writeFileSync(draftPath, JSON.stringify({
      reasoning: 'junction smoke draft', verdict: 'sound',
      findings: [], nitpicks: [], elevations: [],
    }), 'utf8');
    const cli = path.join(link, 'runtime', 'gandalf-run.mjs');
    const r = spawnSync(process.execPath, [cli, '--input', draftPath, '--output', outPath], {
      windowsHide: true, encoding: 'utf8', timeout: 60000,
    });
    assert.equal(r.status, 0, `CLI must exit 0 through the junction (stderr: ${r.stderr})`);
    assert.ok(fs.existsSync(outPath),
      'the CLI must WRITE OUTPUT when invoked through a junction — a clean exit with no output is the 0275 silent no-op');
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(typeof out.verdict, 'string', 'graded output written through the junction');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
