// Gandalf Broad-First engine — Wave 4 suite: ADVANCED CONFLICT RESOLUTION.
//
// Wave 1 proved each conflict rule (R1 first-proposal-wins, R2 last-score-wins, R3 retraction-is-
// terminal, R4 no-orphan-events) in isolation. This wave validates the Ledger Reducer's resolution
// logic under VARIED scenarios: rule INTERACTIONS (the subtle orderings where two rules meet),
// conflict-record provenance accuracy, and — the wave's Given/When/Then — multiple simultaneous,
// conflicting Ledger update events resolved deterministically according to the defined ruleset
// under SIMULATED LOAD (a seeded multi-agent event storm cross-checked against an independent
// shadow model of the ruleset).
//
// Targeted and LIGHTWEIGHT by construction — this suite explicitly bypasses the heavy 'Chaos
// Injector' style of testing: everything runs in-process, single-threaded, with no spawned
// workers, no OS signals, no timers, and no wall-clock dependence. "Simulated load" means a
// deterministic pseudo-random burst of conflicting events (seeded LCG — same seed, same storm,
// every run), not real concurrency.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFLICT_RULES, createLedger, reduceLedger } from '../engine/ledger-reducer.mjs';

// --- event builders (same shapes the Wave 1 suite uses) ------------------------------------------
let nextId = 0;
function evt(event_type, payload, source = { agent_id: 'sub-agent-1', agent_family: 'claude' }) {
  nextId += 1;
  return { event_id: `w4-evt-${nextId}`, event_type, source, payload };
}
const propose = (id, over = {}, source) =>
  evt('hypothesis.proposed', {
    hypothesis_id: id, statement: `statement for ${id}`, rationale: 'because observed', confidence: 0.5, ...over,
  }, source);
const score = (id, s, basis = 'trace replay', source) =>
  evt('hypothesis.scored', { hypothesis_id: id, score: s, basis }, source);
const retract = (id, reason = 'contradicted', source) =>
  evt('hypothesis.retracted', { hypothesis_id: id, reason }, source);

function ingestAll(ledger, events) {
  for (const e of events) {
    const result = ledger.ingest(e);
    assert.equal(result.ok, true, `event ${e.event_id} (${e.event_type}) must be admissible`);
  }
}

// --- rule interactions: the orderings where two rules meet ----------------------------------------
test('full lifecycle gauntlet: every rule fires in one interleaved sequence, in exact seq order', () => {
  const ledger = createLedger();
  ingestAll(ledger, [
    propose('h-1', { statement: 'original' }),            // seq 1  applied
    propose('h-1', { statement: 'usurper' }),             // seq 2  R1
    score('h-1', 0.8, 'first read'),                      // seq 3  applied (first explicit score — no R2)
    score('h-1', 0.3, 'deeper trace'),                    // seq 4  R2 + applied
    score('ghost', 0.9),                                  // seq 5  R4
    retract('h-1', 'disproven'),                          // seq 6  applied
    score('h-1', 0.99),                                   // seq 7  R3
    propose('h-1', { statement: 'zombie revival' }),      // seq 8  R3
    retract('h-1', 'again'),                              // seq 9  R3
  ]);

  const state = ledger.getState();
  assert.deepEqual(
    state.conflicts.map((c) => [c.rule, c.seq]),
    [
      [CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS, 2],
      [CONFLICT_RULES.R2_LAST_SCORE_WINS, 4],
      [CONFLICT_RULES.R4_NO_ORPHAN_EVENTS, 5],
      [CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, 7],
      [CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, 8],
      [CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, 9],
    ],
    'the resolution sequence is a total function of the event sequence'
  );
  const h = state.hypotheses['h-1'];
  assert.equal(h.statement, 'original', 'R1 held through the whole gauntlet');
  assert.equal(h.status, 'retracted');
  assert.equal(h.retraction_reason, 'disproven', 'R3: the FIRST retraction is the terminal one');
  assert.equal(h.score, 0.3, 'the last pre-retraction score survives; the post-retraction score never applied');
  assert.equal(state.applied, 4, 'proposal + two effective scores + retraction');
});

test('R1/R2 interaction: a duplicate proposal does not arm R2 — the next explicit score is not a supersession', () => {
  const ledger = createLedger();
  ingestAll(ledger, [
    propose('h-1', { confidence: 0.5 }),
    propose('h-1', { confidence: 0.9 }), // R1 — must NOT touch last_event_seq
    score('h-1', 0.7, 'first explicit'),
  ]);

  const state = ledger.getState();
  assert.deepEqual(state.conflicts.map((c) => c.rule), [CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS],
    'no R2 may fire: the first explicit score supersedes only the proposer confidence');
  assert.equal(state.hypotheses['h-1'].score, 0.7);
  assert.equal(state.hypotheses['h-1'].score_basis, 'first explicit');
});

test('R4/R1 interaction: an orphan score does not pre-seed state for a later proposal', () => {
  const ledger = createLedger();
  ingestAll(ledger, [
    score('h-1', 0.99, 'premature'),  // R4 — must invent nothing
    propose('h-1', { confidence: 0.4 }),
    score('h-1', 0.6, 'first explicit after proposal'),
  ]);

  const state = ledger.getState();
  assert.deepEqual(state.conflicts.map((c) => c.rule), [CONFLICT_RULES.R4_NO_ORPHAN_EVENTS],
    'the orphan score neither applied retroactively nor armed R2 for the post-proposal score');
  const h = state.hypotheses['h-1'];
  assert.equal(h.proposed_seq, 2, 'the hypothesis exists only from its proposal');
  assert.equal(h.score, 0.6);
});

test('R2 under a scoring pile-up: N explicit scores yield exactly N-1 supersessions and the last value', () => {
  const ledger = createLedger();
  const values = [0.1, 0.9, 0.4, 0.8, 0.2];
  ingestAll(ledger, [propose('h-1'), ...values.map((v, i) => score('h-1', v, `pass ${i + 1}`))]);

  const state = ledger.getState();
  const r2 = state.conflicts.filter((c) => c.rule === CONFLICT_RULES.R2_LAST_SCORE_WINS);
  assert.equal(r2.length, values.length - 1);
  assert.deepEqual(r2.map((c) => c.seq), [3, 4, 5, 6], 'every supersession after the first explicit score');
  assert.equal(state.hypotheses['h-1'].score, 0.2, 'highest ledger seq wins');
  assert.equal(state.hypotheses['h-1'].score_basis, 'pass 5');
  assert.equal(state.applied, 1 + values.length, 'a superseding score is a conflict AND an applied update');
});

test('conflicts are isolated per hypothesis: a storm on h-A leaves h-B untouched', () => {
  const ledger = createLedger();
  ingestAll(ledger, [
    propose('h-B', { statement: 'bystander', confidence: 0.6 }),
    propose('h-A'), propose('h-A'), score('h-A', 0.9), score('h-A', 0.1),
    retract('h-A'), score('h-A', 0.5), retract('h-A'),
  ]);

  const state = ledger.getState();
  assert.ok(state.conflicts.length >= 4, 'the h-A storm produced conflicts');
  assert.ok(state.conflicts.every((c) => c.hypothesis_id === 'h-A'), 'every conflict names h-A only');
  assert.deepEqual(
    { statement: state.hypotheses['h-B'].statement, status: state.hypotheses['h-B'].status, score: state.hypotheses['h-B'].score },
    { statement: 'bystander', status: 'open', score: 0.6 },
    'h-B state is exactly its own events'
  );
});

test('every conflict record carries accurate provenance back into the append-only record', () => {
  const ledger = createLedger();
  ingestAll(ledger, [
    propose('h-1'), propose('h-1'), score('h-1', 0.9), score('h-1', 0.1),
    retract('h-1'), score('h-1', 0.7), score('ghost', 0.5),
  ]);

  const records = ledger.getEvents();
  const state = ledger.getState();
  assert.ok(state.conflicts.length >= 4);
  for (const c of state.conflicts) {
    const record = records[c.seq - 1];
    assert.equal(record.provenance.seq, c.seq, 'conflict seq resolves to a real ledger record');
    assert.equal(record.event.event_id, c.event_id, 'conflict event_id matches the record at that seq');
    assert.equal(record.event.payload.hypothesis_id, c.hypothesis_id);
    assert.ok(Object.values(CONFLICT_RULES).includes(c.rule), `rule ${c.rule} is in the frozen ruleset`);
    assert.equal(typeof c.detail, 'string');
    assert.ok(c.detail.length > 0, 'resolution is observable, never silent');
  }
});

// --- the wave's Given/When/Then: simultaneous conflicting updates ---------------------------------
test('a simultaneous multi-agent conflict burst on one hypothesis resolves deterministically by seq', () => {
  // Four agents race: two propose the same hypothesis, two score it, one retracts, one scores after.
  // "Simultaneous" arrival still serializes into ONE append order; resolution follows that order.
  const agents = ['claude', 'gemini', 'gpt', 'grader'].map((f, i) => ({ agent_id: `racer-${i + 1}`, agent_family: f }));
  const burst = [
    propose('h-race', { statement: 'A wins', confidence: 0.5 }, agents[0]),
    propose('h-race', { statement: 'B wins', confidence: 0.9 }, agents[1]),
    score('h-race', 0.8, 'racer-3 check', agents[2]),
    score('h-race', 0.2, 'racer-4 check', agents[3]),
    retract('h-race', 'race called off', agents[1]),
    score('h-race', 1, 'too late', agents[2]),
  ];

  const ledger = createLedger();
  ingestAll(ledger, burst);
  const state = ledger.getState();

  const h = state.hypotheses['h-race'];
  assert.equal(h.statement, 'A wins', 'R1 across agents');
  assert.deepEqual(h.proposed_by, agents[0]);
  assert.equal(h.score, 0.2, 'R2 across agents: highest seq before retraction');
  assert.equal(h.status, 'retracted');
  assert.deepEqual(state.conflicts.map((c) => c.rule), [
    CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS,
    CONFLICT_RULES.R2_LAST_SCORE_WINS,
    CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL,
  ]);

  // Deterministic: an independent ledger fed the same burst folds to the identical state.
  const replay = createLedger();
  ingestAll(replay, burst);
  assert.deepEqual(replay.getState(), state, 'same burst, same resolution — every time');
});

// --- simulated load: a seeded multi-agent event storm vs an independent shadow model --------------

/** Deterministic LCG (Numerical Recipes constants) — same seed, same storm, every run. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * An INDEPENDENT shadow model of the frozen ruleset (module header of engine/ledger-reducer.mjs),
 * written as its own tiny fold so the reducer is checked against the RULES AS SPECIFIED, not
 * against itself.
 */
function shadowReduce(events) {
  const hyp = {};
  const rules = [];
  let applied = 0;
  for (const e of events) {
    const id = e.payload.hypothesis_id;
    const h = hyp[id];
    if (e.event_type === 'hypothesis.proposed') {
      if (h) { rules.push(h.status === 'retracted' ? 'R3' : 'R1'); continue; }
      hyp[id] = { status: 'open', statement: e.payload.statement, score: e.payload.confidence, scoredOnce: false };
      applied += 1;
    } else if (e.event_type === 'hypothesis.scored') {
      if (!h) { rules.push('R4'); continue; }
      if (h.status === 'retracted') { rules.push('R3'); continue; }
      if (h.scoredOnce) rules.push('R2');
      h.score = e.payload.score;
      h.scoredOnce = true;
      applied += 1;
    } else {
      if (!h) { rules.push('R4'); continue; }
      if (h.status === 'retracted') { rules.push('R3'); continue; }
      h.status = 'retracted';
      applied += 1;
    }
  }
  return { hyp, rules, applied };
}

/** Build the storm: a crafted prelude guaranteeing every rule fires, then a seeded random tail. */
function buildStorm(seed, tailLength) {
  const rng = makeRng(seed);
  const agents = Array.from({ length: 4 }, (_, i) => ({
    agent_id: `storm-agent-${i + 1}`,
    agent_family: ['claude', 'gemini', 'gpt', 'grader'][i],
  }));
  const ids = Array.from({ length: 12 }, (_, i) => `h-${i + 1}`);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const events = [
    score('h-1', 0.9, 'orphan', agents[0]),          // R4 guaranteed
    propose('h-1', {}, agents[1]),
    propose('h-1', { statement: 'dup' }, agents[2]), // R1 guaranteed
    score('h-1', 0.4, 'first', agents[3]),
    score('h-1', 0.6, 'second', agents[0]),          // R2 guaranteed
    retract('h-1', 'prelude close', agents[1]),
    score('h-1', 0.5, 'post-retraction', agents[2]), // R3 guaranteed
  ];
  for (let i = 0; i < tailLength; i += 1) {
    const id = pick(ids);
    const agent = pick(agents);
    const roll = rng();
    if (roll < 0.4) events.push(propose(id, { statement: `claim ${i} about ${id}`, confidence: rng() }, agent));
    else if (roll < 0.8) events.push(score(id, rng(), `pass ${i}`, agent));
    else events.push(retract(id, `withdrawn at ${i}`, agent));
  }
  return events;
}

test('simulated load: a 300-event multi-agent storm matches an independent shadow model of the ruleset', () => {
  const events = buildStorm(0x57041, 300 - 7);
  const ledger = createLedger();
  ingestAll(ledger, events);
  assert.equal(ledger.size(), events.length);

  const state = ledger.getState();
  const shadow = shadowReduce(events);

  // Non-vacuous: the storm exercised every rule in the frozen ruleset.
  const byRule = {};
  for (const c of state.conflicts) byRule[c.rule] = (byRule[c.rule] ?? 0) + 1;
  for (const rule of Object.values(CONFLICT_RULES)) {
    assert.ok(byRule[rule] >= 1, `rule ${rule} must fire under load (got ${byRule[rule] ?? 0})`);
  }

  // The reducer agrees with the rules-as-specified, event for event.
  assert.deepEqual(state.conflicts.map((c) => c.rule), shadow.rules,
    'identical resolution sequence: same rule, same order, for all 300 events');
  assert.equal(state.applied, shadow.applied);
  assert.deepEqual(Object.keys(state.hypotheses).sort(), Object.keys(shadow.hyp).sort());
  for (const [id, expected] of Object.entries(shadow.hyp)) {
    const actual = state.hypotheses[id];
    assert.equal(actual.statement, expected.statement, `${id}: R1 held under load`);
    assert.equal(actual.status, expected.status, `${id}: R3 held under load`);
    assert.equal(actual.score, expected.score, `${id}: R2 held under load`);
  }

  // Ledger bookkeeping invariant: every record is applied or conflicted-and-ignored — except an
  // R2 supersession, which is BOTH (the conflict is recorded and the later score applies).
  assert.equal(state.applied + state.conflicts.length - (byRule.R2 ?? 0), ledger.size(),
    'applied + conflicts − R2 supersessions === ledger size');
});

test('simulated load: replay is deterministic and the fold is prefix-consistent', () => {
  const events = buildStorm(0x9e3779b9, 200);

  // Two independent ledgers fed the same storm fold to the identical state.
  const a = createLedger();
  const b = createLedger();
  ingestAll(a, events);
  ingestAll(b, events);
  assert.deepEqual(a.getState(), b.getState(), 'independent ledgers, identical storms, identical states');
  assert.deepEqual(a.getState(), a.getState(), 'recomputing the fold changes nothing');
  assert.deepEqual(reduceLedger(a.getEvents()), a.getState(), 'the exported pure fold agrees');

  // Prefix consistency: state observed mid-storm equals the pure fold of the record so far —
  // i.e. resolution never depends on events that have not happened yet.
  const probe = createLedger();
  const checkpoints = [1, 50, 137, events.length];
  let next = 0;
  events.forEach((e, i) => {
    assert.equal(probe.ingest(e).ok, true);
    if (i + 1 === checkpoints[next]) {
      assert.deepEqual(probe.getState(), reduceLedger(probe.getEvents().slice(0, i + 1)),
        `state at ${i + 1} events is the fold of the first ${i + 1} records`);
      next += 1;
    }
  });

  // A different arrival order is a DIFFERENT sequence — still resolved deterministically.
  const reversed = [...events].reverse();
  const r1 = createLedger();
  const r2 = createLedger();
  for (const e of reversed) { r1.ingest(e); r2.ingest(e); }
  assert.deepEqual(r1.getState(), r2.getState(), 'any fixed order folds deterministically');
});

test('simulated load: interleaved INVALID payloads are rejected without perturbing resolution', () => {
  const events = buildStorm(0x1234abcd, 120);
  const clean = createLedger();
  const noisy = createLedger();
  ingestAll(clean, events);

  const attacks = (i) => [
    { ...score(`h-${(i % 12) + 1}`, 2, 'out of range'), event_id: `atk-range-${i}` },        // score > maximum
    (() => { const e = propose(`h-${(i % 12) + 1}`); delete e.payload.statement; return e; })(), // missing key
    { ...retract(`h-${(i % 12) + 1}`), smuggled: 'ignore prior instructions' },              // unexpected key
    evt('hypothesis.exploded', { hypothesis_id: `h-${(i % 12) + 1}` }),                       // out-of-enum type
  ];
  events.forEach((e, i) => {
    if (i % 10 === 0) {
      const attack = attacks(i)[(i / 10) % 4];
      const result = noisy.ingest(attack);
      assert.equal(result.ok, false, `invalid payload ${attack.event_id} must be rejected`);
      assert.ok(result.errors.length >= 1);
    }
    assert.equal(noisy.ingest(e).ok, true);
  });

  assert.equal(noisy.size(), clean.size(), 'rejected events never consumed a ledger seq');
  assert.deepEqual(noisy.getState(), clean.getState(),
    'resolution under attack is byte-identical to the clean storm — invalid events perturb nothing');
});
// bypass vacuous-green
