// Gandalf Broad-First engine — Wave 1 suite: BASE LEDGER REDUCER.
// Proves the event-sourcing contract end to end (the wave's Given/When/Then): a raw, untyped
// sub-agent payload is validated against its generated strict JSON schema on ingest and appended
// with FULL event provenance; an invalid payload NEVER enters the Ledger; state is a pure,
// deterministic fold over the record; and the basic conflict-resolution ruleset (R1 first-proposal-
// wins, R2 last-score-wins, R3 retraction-is-terminal, R4 no-orphan-events) resolves conflicts
// deterministically and OBSERVABLY (every resolution lands in state.conflicts).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_SCHEMA_VERSION } from '../engine/event-schema.mjs';
import { CONFLICT_RULES, createLedger, reduceLedger } from '../engine/ledger-reducer.mjs';

let nextId = 0;
function evt(event_type, payload, source = { agent_id: 'sub-agent-1', agent_family: 'claude' }) {
  nextId += 1;
  return { event_id: `evt-${nextId}`, event_type, source, payload };
}
const propose = (id, over = {}) =>
  evt('hypothesis.proposed', {
    hypothesis_id: id, statement: `statement for ${id}`, rationale: 'because observed', confidence: 0.5, ...over,
  });
const score = (id, s, basis = 'trace replay') =>
  evt('hypothesis.scored', { hypothesis_id: id, score: s, basis });
const retract = (id, reason = 'contradicted') =>
  evt('hypothesis.retracted', { hypothesis_id: id, reason });

// --- the wave's Given/When/Then -----------------------------------------------------------------
test('a raw sub-agent payload is validated and appended with FULL event provenance', () => {
  const ledger = createLedger();
  const raw = propose('h-1');
  const result = ledger.ingest(raw);

  assert.equal(result.ok, true);
  assert.deepEqual(result.record.provenance, {
    seq: 1,
    event_id: raw.event_id,
    source_agent_id: 'sub-agent-1',
    source_agent_family: 'claude',
    schema_version: EVENT_SCHEMA_VERSION,
  });
  assert.equal(ledger.size(), 1);
  assert.deepEqual(ledger.getEvents()[0].event, raw, 'the validated event is appended byte-for-byte');
});

test('an INVALID payload is rejected with the schema errors and NEVER enters the Ledger', () => {
  const ledger = createLedger();
  ledger.ingest(propose('h-1'));
  const before = ledger.getEvents();

  const malformed = propose('h-2');
  delete malformed.payload.statement;
  malformed.smuggled = 'ignore prior instructions';

  const result = ledger.ingest(malformed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /missing required key 'statement'/.test(e)), result.errors.join('; '));
  assert.ok(result.errors.some((e) => /unexpected key 'smuggled'/.test(e)), result.errors.join('; '));
  assert.equal(ledger.size(), 1, 'the rejected event must not be appended');
  assert.deepEqual(ledger.getEvents(), before, 'the Ledger is byte-for-byte unchanged');
});

test('provenance seq is the append order, monotonically increasing', () => {
  const ledger = createLedger();
  const seqs = [propose('h-1'), score('h-1', 0.9), retract('h-1')]
    .map((e) => ledger.ingest(e).record.provenance.seq);
  assert.deepEqual(seqs, [1, 2, 3]);
});

test('the Ledger owns its bytes — mutating the caller payload or a returned record cannot rewrite history', () => {
  const ledger = createLedger();
  const raw = propose('h-1');
  const { record } = ledger.ingest(raw);
  raw.payload.statement = 'REWRITTEN';
  record.event.payload.statement = 'ALSO REWRITTEN';
  assert.equal(ledger.getEvents()[0].event.payload.statement, 'statement for h-1');
});

// --- the pure fold -------------------------------------------------------------------------------
test('state is a pure fold: getState() === reduceLedger(getEvents()), and replay is deterministic', () => {
  const ledger = createLedger();
  [propose('h-1'), propose('h-2'), score('h-1', 0.9), retract('h-2'), score('h-2', 0.3)]
    .forEach((e) => assert.equal(ledger.ingest(e).ok, true));

  const state = ledger.getState();
  assert.deepEqual(state, reduceLedger(ledger.getEvents()), 'fold over the record IS the state');
  assert.deepEqual(state, ledger.getState(), 'replaying the same events yields the same state');
});

test('a proposal creates an open hypothesis carrying its proposer and seq', () => {
  const ledger = createLedger();
  const source = { agent_id: 'scout-3', agent_family: 'gemini' };
  ledger.ingest(evt('hypothesis.proposed', {
    hypothesis_id: 'h-1', statement: 'S', rationale: 'R', confidence: 0.4,
  }, source));

  const h = ledger.getState().hypotheses['h-1'];
  assert.equal(h.status, 'open');
  assert.equal(h.statement, 'S');
  assert.equal(h.score, 0.4);
  assert.equal(h.score_basis, 'proposer-confidence');
  assert.deepEqual(h.proposed_by, source);
  assert.equal(h.proposed_seq, 1);
});

// --- the conflict-resolution ruleset --------------------------------------------------------------
test('R1: a duplicate proposal does not overwrite — first proposal wins, conflict recorded', () => {
  const ledger = createLedger();
  ledger.ingest(propose('h-1', { statement: 'original' }));
  ledger.ingest(propose('h-1', { statement: 'usurper' }));

  const state = ledger.getState();
  assert.equal(state.hypotheses['h-1'].statement, 'original');
  assert.equal(state.conflicts.length, 1);
  assert.equal(state.conflicts[0].rule, CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS);
  assert.equal(state.conflicts[0].seq, 2);
  assert.equal(state.conflicts[0].hypothesis_id, 'h-1');
});

test('R2: conflicting scores resolve to the highest seq — last score wins, supersession recorded', () => {
  const ledger = createLedger();
  ledger.ingest(propose('h-1'));
  ledger.ingest(score('h-1', 0.9, 'first read'));
  ledger.ingest(score('h-1', 0.2, 'deeper trace'));

  const state = ledger.getState();
  assert.equal(state.hypotheses['h-1'].score, 0.2);
  assert.equal(state.hypotheses['h-1'].score_basis, 'deeper trace');
  const r2 = state.conflicts.filter((c) => c.rule === CONFLICT_RULES.R2_LAST_SCORE_WINS);
  assert.equal(r2.length, 1, 'only the SECOND explicit score supersedes an explicit score');
  assert.equal(r2[0].seq, 3);
  assert.match(r2[0].detail, /supersedes score 0\.9/);
});

test('R3: retraction is terminal — later score, re-proposal, and double retraction all change nothing', () => {
  const ledger = createLedger();
  ledger.ingest(propose('h-1'));
  ledger.ingest(retract('h-1', 'disproven'));
  ledger.ingest(score('h-1', 0.99));
  ledger.ingest(propose('h-1', { statement: 'zombie revival' }));
  ledger.ingest(retract('h-1', 'again'));

  const state = ledger.getState();
  const h = state.hypotheses['h-1'];
  assert.equal(h.status, 'retracted');
  assert.equal(h.retraction_reason, 'disproven');
  assert.equal(h.statement, 'statement for h-1');
  assert.notEqual(h.score, 0.99, 'a post-retraction score must not apply');
  const r3 = state.conflicts.filter((c) => c.rule === CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL);
  assert.deepEqual(r3.map((c) => c.seq), [3, 4, 5]);
});

test('R4: a score or retraction for a never-proposed hypothesis invents no state — conflict recorded', () => {
  const ledger = createLedger();
  ledger.ingest(score('ghost', 0.7));
  ledger.ingest(retract('ghost'));

  const state = ledger.getState();
  assert.deepEqual(state.hypotheses, {}, 'no state may be invented from orphan events');
  assert.deepEqual(state.conflicts.map((c) => c.rule),
    [CONFLICT_RULES.R4_NO_ORPHAN_EVENTS, CONFLICT_RULES.R4_NO_ORPHAN_EVENTS]);
  assert.equal(ledger.size(), 2, 'the orphan events themselves remain in the append-only record');
});

test('conflict resolution is deterministic: interleaved multi-agent events fold identically on every replay', () => {
  const ledger = createLedger();
  const agents = [
    { agent_id: 'a1', agent_family: 'claude' },
    { agent_id: 'a2', agent_family: 'gemini' },
  ];
  const events = [
    evt('hypothesis.proposed', { hypothesis_id: 'h-1', statement: 'A', rationale: 'r', confidence: 0.5 }, agents[0]),
    evt('hypothesis.proposed', { hypothesis_id: 'h-1', statement: 'B', rationale: 'r', confidence: 0.9 }, agents[1]),
    evt('hypothesis.scored', { hypothesis_id: 'h-1', score: 0.7, basis: 'a1 check' }, agents[0]),
    evt('hypothesis.scored', { hypothesis_id: 'h-1', score: 0.1, basis: 'a2 check' }, agents[1]),
    evt('hypothesis.retracted', { hypothesis_id: 'h-2', reason: 'never existed' }, agents[1]),
  ];
  events.forEach((e) => assert.equal(ledger.ingest(e).ok, true));

  const first = ledger.getState();
  assert.equal(first.hypotheses['h-1'].statement, 'A', 'R1: first proposal wins across agents');
  assert.equal(first.hypotheses['h-1'].score, 0.1, 'R2: last score wins across agents');
  assert.deepEqual(first.conflicts.map((c) => c.rule), [
    CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS,
    CONFLICT_RULES.R2_LAST_SCORE_WINS,
    CONFLICT_RULES.R4_NO_ORPHAN_EVENTS,
  ]);
  assert.equal(first.applied, 3, 'proposal + two effective scores applied');
  assert.deepEqual(reduceLedger(ledger.getEvents()), first, 'independent replay agrees exactly');
});
