// B2 L6 — criterion coverage registry + named ship-gate citation (not a test file).
// Imported by band-thin-honesty-canary.test.mjs and B2 smoke-honesty-canary.

/** Criterion coverage table (L6) — each row must exist under test/ and pass under node --test test/. */
export const B2_COVERAGE_ROWS = [
  {
    id: 'C1',
    ns: 1,
    assertion: 'Lock precedence/conflict matrix + knobs fingerprint',
    file: 'band-thin-lock-knobs.test.mjs',
  },
  {
    id: 'C2',
    ns: 2,
    assertion: 'Per-entry E1–E4 call-object consume; lock authority',
    file: 'band-thin-consume-entry.test.mjs',
  },
  {
    id: 'C3',
    ns: 3,
    assertion: 'Inequality + SPIKE non-collapse from knobsForSkill',
    file: 'band-thin-inequality-spike.test.mjs',
  },
  {
    id: 'C4',
    ns: 4,
    assertion: 'Unlock predicate + null knobs + GANDALF_MAX_SHARDS matrix',
    file: 'band-thin-legacy-unlock.test.mjs',
  },
  {
    id: 'H1',
    ns: 'honesty',
    assertion:
      'Structural canary: no score-label invoke; no honesty stamp field on LITE scaled path',
    file: 'band-thin-honesty-canary.test.mjs',
  },
];

/** Named Foreman ship-gate (L6) — exact cwd + argv. */
export const L6_SHIP_GATE = {
  cwd: '<path> Foundry\\skills\\gandalf',
  argv: 'node --test test/',
};
