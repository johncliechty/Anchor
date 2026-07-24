// B2 W3 / LOCK CONTRACT L5 — inequality + SPIKE non-collapse from live knobs only.
// All expected numerics come ONLY from knobsForSkill at runtime — never plan literals.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  knobsForSkill,
  assertGandalfSeatsFloor,
} from '../runtime/triage-band.mjs';

/** Live knobs for gandalf depths — re-read per assert so table drift is always tested. */
function liveKnobs() {
  const L = knobsForSkill('gandalf', 'LITE');
  const F = knobsForSkill('gandalf', 'FULL');
  const S = knobsForSkill('gandalf', 'SPIKE-FIRST');
  assert.ok(L, "knobsForSkill('gandalf','LITE') must resolve");
  assert.ok(F, "knobsForSkill('gandalf','FULL') must resolve");
  assert.ok(S, "knobsForSkill('gandalf','SPIKE-FIRST') must resolve");
  return { L, F, S };
}

// ─── L5 inequality (NS3) ─────────────────────────────────────────────────────

test('L5 inequality: LITE.shards < FULL.shards (live knobsForSkill only)', () => {
  const { L, F } = liveKnobs();
  assert.equal(typeof L.shards, 'number');
  assert.equal(typeof F.shards, 'number');
  assert.ok(
    L.shards < F.shards,
    `LITE.shards (${L.shards}) must be strictly less than FULL.shards (${F.shards})`,
  );
});

test('L5 inequality: LITE.fusionPasses ≤ FULL.fusionPasses (live knobsForSkill only)', () => {
  const { L, F } = liveKnobs();
  assert.equal(typeof L.fusionPasses, 'number');
  assert.equal(typeof F.fusionPasses, 'number');
  assert.ok(
    L.fusionPasses <= F.fusionPasses,
    `LITE.fusionPasses (${L.fusionPasses}) must be ≤ FULL.fusionPasses (${F.fusionPasses})`,
  );
});

// ─── L5 SPIKE identity + non-collapse ────────────────────────────────────────

test("L5 SPIKE: ceremony==='spike-first' and seats non-empty", () => {
  const { S } = liveKnobs();
  assert.equal(S.ceremony, 'spike-first');
  assert.ok(S.seats != null && String(S.seats).trim() !== '', 'SPIKE seats must be non-empty');
  assertGandalfSeatsFloor(S);
});

test('L5 SPIKE non-collapse: NOT (S.shards===L.shards AND S.fusionPasses===L.fusionPasses)', () => {
  const { L, S } = liveKnobs();
  const collapsed =
    S.shards === L.shards && S.fusionPasses === L.fusionPasses;
  assert.equal(
    collapsed,
    false,
    `SPIKE must not collapse to LITE on both numerics (S={shards:${S.shards},fusion:${S.fusionPasses}} L={shards:${L.shards},fusion:${L.fusionPasses}})`,
  );
});

// ─── Safety floors: seats present for LITE / FULL / SPIKE-FIRST ──────────────

for (const depth of ['LITE', 'FULL', 'SPIKE-FIRST']) {
  test(`L5 seats floor: ${depth} seats present and non-empty (assertGandalfSeatsFloor)`, () => {
    const knobs = knobsForSkill('gandalf', depth);
    assert.ok(knobs, `knobsForSkill gandalf/${depth}`);
    assert.ok(knobs.seats != null, `${depth}.seats present`);
    assert.ok(String(knobs.seats).trim() !== '', `${depth}.seats non-empty`);
    assert.equal(assertGandalfSeatsFloor(knobs), knobs);
  });
}

test('L5 seats floor guard: refuse thinning that zeros seats', () => {
  assert.throws(
    () => assertGandalfSeatsFloor({ shards: 2, fusionPasses: 1, seats: '' }),
    /seats floor/,
  );
  assert.throws(
    () => assertGandalfSeatsFloor({ shards: 2, fusionPasses: 1, seats: 0 }),
    /seats floor/,
  );
  assert.throws(
    () => assertGandalfSeatsFloor({ shards: 2, fusionPasses: 1, seats: [] }),
    /seats floor/,
  );
  assert.throws(
    () => assertGandalfSeatsFloor({ shards: 2, fusionPasses: 1 }),
    /seats floor/,
  );
});
