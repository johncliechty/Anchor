// Gandalf Broad-First engine — Wave 3 suite: PRIMITIVE PARALLEL HYPOTHESIS GENERATION.
// Proves the primitive generator's contract: every emitted event is admissible-by-construction
// under the Wave 1 generated schema, generation is fully deterministic (no clocks, no randomness
// — same inputs, byte-identical events), ids are namespaced by exploration node so distinct
// nodes never collide in the Ledger, the lenses are structurally orthogonal with distinct frozen
// priors (a deterministic initial ranking), and misconfiguration throws before anything is
// generated. Also proves the generator plays by the Ledger's rules: its events ingest cleanly,
// and a reused nodeId collides into R1 conflicts instead of silently minting new identities.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HYPOTHESIS_LENSES, generateHypotheses } from '../engine/hypothesis-generator.mjs';
import { validateEvent } from '../engine/event-schema.mjs';
import { createLedger, CONFLICT_RULES } from '../engine/ledger-reducer.mjs';

const AGENT = { agent_id: 'gen-agent-1', agent_family: 'primitive' };

test('the lens matrix is frozen, ids are unique, and priors are distinct and in range', () => {
  assert.ok(Object.isFrozen(HYPOTHESIS_LENSES), 'the lens list is frozen');
  assert.ok(HYPOTHESIS_LENSES.length >= 3, 'broad-first needs real breadth');
  const ids = HYPOTHESIS_LENSES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'lens ids are unique');
  const priors = HYPOTHESIS_LENSES.map((l) => l.prior);
  assert.equal(new Set(priors).size, priors.length, 'priors are DISTINCT — a fresh batch has a deterministic ranking');
  for (const lens of HYPOTHESIS_LENSES) {
    assert.ok(Object.isFrozen(lens), `lens '${lens.id}' is frozen`);
    assert.ok(lens.prior >= 0 && lens.prior <= 1, `prior for '${lens.id}' is a valid confidence`);
    assert.equal(typeof lens.frame, 'function');
  }
});

test('every generated event is ADMISSIBLE-BY-CONSTRUCTION under the Wave 1 generated schema', () => {
  const events = generateHypotheses({ topic: 'why the build stalls', nodeId: 'n1', agent: AGENT });
  assert.equal(events.length, HYPOTHESIS_LENSES.length, 'default breadth applies every lens');
  for (const event of events) {
    assert.deepEqual(validateEvent(event), [], 'the generator never emits an event the Ledger would refuse');
    assert.equal(event.event_type, 'hypothesis.proposed');
    assert.deepEqual(event.source, AGENT, 'producer provenance rides every event');
  }
  // the batch is the lens matrix row: one hypothesis per lens, priors as initial confidence
  assert.deepEqual(events.map((e) => e.payload.confidence), HYPOTHESIS_LENSES.map((l) => l.prior));
  assert.deepEqual(events.map((e) => e.payload.hypothesis_id), HYPOTHESIS_LENSES.map((l) => `h:n1:${l.id}`));
});

test('generation is DETERMINISTIC: same inputs produce byte-identical batches', () => {
  const opts = { topic: 'flaky gate on Windows', nodeId: 'node-7', agent: AGENT, breadth: 4 };
  assert.deepEqual(generateHypotheses(opts), generateHypotheses(opts));
});

test('ids are namespaced by node: distinct nodes can never collide in the Ledger', () => {
  const a = generateHypotheses({ topic: 't', nodeId: 'node-a', agent: AGENT, breadth: 2 });
  const b = generateHypotheses({ topic: 't', nodeId: 'node-b', agent: AGENT, breadth: 2 });
  const allIds = [...a, ...b].map((e) => e.payload.hypothesis_id);
  assert.equal(new Set(allIds).size, allIds.length, 'no hypothesis id is shared across nodes');
  const allEventIds = [...a, ...b].map((e) => e.event_id);
  assert.equal(new Set(allEventIds).size, allEventIds.length, 'no event id is shared across nodes');
});

test('breadth selects a PREFIX of the lens matrix', () => {
  const events = generateHypotheses({ topic: 't', nodeId: 'n', agent: AGENT, breadth: 2 });
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.payload.hypothesis_id),
    HYPOTHESIS_LENSES.slice(0, 2).map((l) => `h:n:${l.id}`),
    'lens order is part of the contract'
  );
});

test('misconfiguration throws BEFORE anything is generated', () => {
  const ok = { topic: 't', nodeId: 'n', agent: AGENT };
  assert.throws(() => generateHypotheses({ ...ok, topic: '' }), /topic/);
  assert.throws(() => generateHypotheses({ ...ok, nodeId: '' }), /nodeId/);
  assert.throws(() => generateHypotheses({ ...ok, agent: null }), /agent/);
  assert.throws(() => generateHypotheses({ ...ok, agent: { agent_id: 'x' } }), /agent_family/);
  assert.throws(() => generateHypotheses({ ...ok, breadth: 0 }), /breadth/);
  assert.throws(() => generateHypotheses({ ...ok, breadth: HYPOTHESIS_LENSES.length + 1 }), /breadth/);
  assert.throws(() => generateHypotheses({ ...ok, breadth: 1.5 }), /breadth/);
  assert.throws(() => generateHypotheses(), /topic/);
});

test('the generator plays by the Ledger\'s rules: clean ingestion, and nodeId reuse collides into R1 conflicts', () => {
  const ledger = createLedger();
  const batch = generateHypotheses({ topic: 'first pass', nodeId: 'shared-node', agent: AGENT, breadth: 3 });
  for (const event of batch) {
    assert.equal(ledger.ingest(event).ok, true, 'every generated event is admitted');
  }
  let state = ledger.getState();
  assert.equal(Object.keys(state.hypotheses).length, 3);
  assert.deepEqual(state.conflicts, []);
  for (const h of Object.values(state.hypotheses)) {
    assert.equal(h.status, 'open');
    assert.equal(h.proposed_by.agent_id, AGENT.agent_id);
    assert.equal(h.score_basis, 'proposer-confidence');
  }

  // Reusing the nodeId regenerates the SAME identities — the Ledger records R1 conflicts instead
  // of this module silently minting fresh ids for the same work.
  const rerun = generateHypotheses({ topic: 'second pass, same node', nodeId: 'shared-node', agent: AGENT, breadth: 3 });
  for (const event of rerun) {
    assert.equal(ledger.ingest(event).ok, true, 'schema-valid duplicates still enter the append-only record');
  }
  state = ledger.getState();
  assert.equal(Object.keys(state.hypotheses).length, 3, 'no new hypotheses were invented');
  assert.equal(state.conflicts.length, 3, 'every duplicate is an observable conflict');
  for (const c of state.conflicts) {
    assert.equal(c.rule, CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS);
  }
  assert.match(state.hypotheses['h:shared-node:root-cause'].statement, /first pass/,
    'R1: the ORIGINAL statement survives');
});
