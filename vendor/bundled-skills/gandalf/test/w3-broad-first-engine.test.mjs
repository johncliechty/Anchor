// Gandalf Broad-First engine — Wave 3 suite: BROAD-FIRST TRAVERSAL + ROLLING SYNTHESIS STREAM.
// Proves the vertically sliced pipeline end to end, including the wave's Given/When/Then: given
// asynchronous Ledger updates arriving through the Merge Gate, the rolling reducer stream
// listener emits an intermediate synthesis event the moment each update is admitted — while
// sibling hypothesis sources are still in flight — so the pipeline has no synchronous bottleneck.
// Also proven here: the stream is a drop-in Ledger behind the Wave 2 boundary (ingestFromIpc
// composes verbatim; quarantined payloads synthesize NOTHING), synthesis snapshots are
// deterministic (ranking by score, ties to the earlier proposal) and deep-frozen, listener
// failures are isolated and observable, breadth-first traversal expands level by level with
// parallel exploration, and every cap (depth, per-node breadth, global hypothesis budget) is
// strict, configuration-driven, and never silent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNTHESIS_VERSION,
  BROAD_FIRST_DEFAULTS,
  createSynthesisStream,
  runBroadFirst,
} from '../engine/broad-first-engine.mjs';
import { HYPOTHESIS_LENSES } from '../engine/hypothesis-generator.mjs';
import { ingestFromIpc } from '../engine/ipc-middleware.mjs';

const AGENT = { agent_id: 'bf-agent-1', agent_family: 'primitive' };

function proposal(eventId, hypothesisId, confidence, agentId = AGENT.agent_id) {
  return {
    event_id: eventId,
    event_type: 'hypothesis.proposed',
    source: { agent_id: agentId, agent_family: 'primitive' },
    payload: { hypothesis_id: hypothesisId, statement: `statement for ${hypothesisId}`, rationale: 'test', confidence },
  };
}

function scored(eventId, hypothesisId, score) {
  return {
    event_id: eventId,
    event_type: 'hypothesis.scored',
    source: { agent_id: AGENT.agent_id, agent_family: 'primitive' },
    payload: { hypothesis_id: hypothesisId, score, basis: 'test-evidence' },
  };
}

function retracted(eventId, hypothesisId) {
  return {
    event_id: eventId,
    event_type: 'hypothesis.retracted',
    source: { agent_id: AGENT.agent_id, agent_family: 'primitive' },
    payload: { hypothesis_id: hypothesisId, reason: 'test retraction' },
  };
}

test('ROLLING REDUCER: one intermediate synthesis per ADMITTED update, tracking leader/totals through the whole lifecycle', () => {
  const stream = createSynthesisStream();
  const leaders = [];
  stream.subscribe((s) => leaders.push(s.leader));

  assert.equal(stream.ingest(proposal('e1', 'h1', 0.6)).ok, true);
  assert.equal(stream.ingest(proposal('e2', 'h2', 0.8)).ok, true);
  assert.equal(stream.ingest(scored('e3', 'h1', 0.9)).ok, true);   // first explicit score — no conflict
  assert.equal(stream.ingest(scored('e4', 'h1', 0.95)).ok, true);  // supersedes e3 — an R2 conflict
  assert.equal(stream.ingest(retracted('e5', 'h2')).ok, true);
  assert.equal(stream.ingest(scored('e6', 'h9', 0.5)).ok, true);   // orphan — an R4 conflict, no state

  assert.deepEqual(leaders, ['h1', 'h2', 'h1', 'h1', 'h1', 'h1'],
    'every admitted update re-ranked the board IMMEDIATELY');

  const syntheses = stream.getSyntheses();
  assert.equal(syntheses.length, 6, 'exactly one synthesis per admitted Ledger update');
  syntheses.forEach((s, i) => {
    assert.equal(s.v, SYNTHESIS_VERSION);
    assert.equal(s.synthesis_seq, i + 1);
    assert.equal(s.trigger.seq, i + 1, 'the trigger carries the Ledger provenance of the update that drove it');
    assert.equal(s.intermediate, true, 'Wave 3 emissions are all intermediate — the capstone is Wave 5');
  });

  // the second emission saw both hypotheses open, ranked score-descending
  assert.deepEqual(syntheses[1].ranking.map((r) => r.hypothesis_id), ['h2', 'h1']);
  // the final snapshot: h2 retracted, h1 leads alone; both conflicts (R2, R4) are counted
  const last = syntheses[5];
  assert.deepEqual(last.ranking.map((r) => r.hypothesis_id), ['h1']);
  assert.equal(last.ranking[0].score, 0.95);
  assert.deepEqual(last.totals, { events: 6, applied: 5, conflicts: 2, open: 1, retracted: 1 });
});

test('ranking ties resolve DETERMINISTICALLY to the earlier proposal', () => {
  const stream = createSynthesisStream();
  stream.ingest(proposal('e1', 'h-early', 0.5));
  stream.ingest(proposal('e2', 'h-late', 0.5));
  const [, second] = stream.getSyntheses();
  assert.deepEqual(second.ranking.map((r) => r.hypothesis_id), ['h-early', 'h-late']);
  assert.equal(second.leader, 'h-early');
});

test('a REJECTED payload changes nothing and synthesizes NOTHING', () => {
  const stream = createSynthesisStream();
  const result = stream.ingest({ event_id: 'bad', event_type: 'hypothesis.proposed' }); // schema-invalid
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.equal(stream.size(), 0, 'nothing entered the Ledger');
  assert.deepEqual(stream.getSyntheses(), [], 'nothing was synthesized');
});

test('synthesis emissions are DEEP-FROZEN: a listener can never rewrite shared history', () => {
  const stream = createSynthesisStream();
  stream.ingest(proposal('e1', 'h1', 0.6));
  const [synthesis] = stream.getSyntheses();
  assert.ok(Object.isFrozen(synthesis));
  assert.ok(Object.isFrozen(synthesis.ranking));
  assert.ok(Object.isFrozen(synthesis.totals));
  assert.throws(() => { synthesis.leader = 'forged'; }, TypeError);
  assert.throws(() => { synthesis.ranking.push({ hypothesis_id: 'forged' }); }, TypeError);
});

test('listeners: delivery in order, unsubscribe stops delivery, a THROWING listener is isolated and recorded', () => {
  const stream = createSynthesisStream();
  const a = [];
  const b = [];
  const unsubscribeA = stream.subscribe((s) => a.push(s.synthesis_seq));
  stream.subscribe(() => { throw new Error('hostile listener'); });
  stream.subscribe((s) => b.push(s.synthesis_seq));

  stream.ingest(proposal('e1', 'h1', 0.6));
  assert.deepEqual(a, [1]);
  assert.deepEqual(b, [1], 'the throwing listener did not starve its siblings');

  unsubscribeA();
  stream.ingest(proposal('e2', 'h2', 0.7));
  assert.deepEqual(a, [1], 'unsubscribed — no further delivery');
  assert.deepEqual(b, [1, 2]);

  const errors = stream.getListenerErrors();
  assert.equal(errors.length, 2, 'one recorded failure per emission the hostile listener saw');
  assert.deepEqual(errors.map((e) => e.synthesis_seq), [1, 2]);
  assert.match(errors[0].error, /hostile listener/);

  assert.throws(() => stream.subscribe('not a function'), /listener must be a function/);
});

test('MERGE GATE composition: the stream is a drop-in Ledger behind the Wave 2 boundary gauntlet', () => {
  const stream = createSynthesisStream();

  // an event arriving THROUGH the Merge Gate drives a synthesis emission
  const good = ingestFromIpc(stream, JSON.stringify(proposal('mg-1', 'h-mg', 0.7, 'worker-a')),
    { expectedSourceAgentId: 'worker-a' });
  assert.equal(good.ok, true);
  assert.equal(good.stage, 'admitted');
  assert.equal(stream.getSyntheses().length, 1);
  assert.equal(stream.getSyntheses()[0].trigger.source_agent_id, 'worker-a');

  // a QUARANTINED payload (prototype pollution at the boundary) synthesizes NOTHING
  const hostile = ingestFromIpc(stream,
    '{"event_id":"evil","event_type":"hypothesis.proposed","source":{"agent_id":"worker-a","agent_family":"w"},"payload":{"hypothesis_id":"h-evil","statement":"s","rationale":"r","confidence":0.5,"__proto__":{"polluted":true}}}',
    { expectedSourceAgentId: 'worker-a' });
  assert.equal(hostile.ok, false);
  assert.equal(hostile.stage, 'boundary');
  assert.equal(stream.size(), 1, 'the quarantined payload never touched the Ledger');
  assert.equal(stream.getSyntheses().length, 1, 'and never drove a synthesis');

  // a provenance forgery on the channel is refused at the gate, not synthesized
  const forged = ingestFromIpc(stream, JSON.stringify(proposal('mg-2', 'h-forged', 0.9, 'honest-agent')),
    { expectedSourceAgentId: 'worker-a' });
  assert.equal(forged.ok, false);
  assert.equal(forged.stage, 'boundary');
  assert.equal(stream.getSyntheses().length, 1);
});

test('BREADTH-FIRST traversal with the default primitive generator: level-by-level expansion, one synthesis per admission', async () => {
  const result = await runBroadFirst({
    rootTopics: ['alpha subsystem stalls', 'beta gate flakes'],
    agent: AGENT,
    maxDepth: 1,
    maxBreadth: 2,
    maxHypotheses: 24,
  });

  // level 0: 2 root nodes × 2 lenses; level 1: one child node per admitted hypothesis × 2 lenses
  assert.deepEqual(result.levels, [
    { depth: 0, dispatched: 2, dropped: 0, admitted: 4, rejected: 0 },
    { depth: 1, dispatched: 4, dropped: 0, admitted: 8, rejected: 0 },
  ]);
  assert.equal(result.explored, 6);
  assert.equal(result.admitted, 12);
  assert.equal(result.rejected, 0);
  assert.equal(result.dropped_nodes, 0);
  assert.equal(result.syntheses.length, 12, 'exactly one intermediate synthesis per admitted update');
  assert.equal(Object.keys(result.final_state.hypotheses).length, 12);
  assert.deepEqual(result.final_state.conflicts, []);

  // children explore their parent hypothesis's STATEMENT under the hypothesis's id as node id
  const childIds = Object.keys(result.final_state.hypotheses).filter((id) => id.startsWith('h:h:'));
  assert.equal(childIds.length, 8, 'level-1 ids are namespaced by their parent hypothesis');

  // determinism: the same run yields the same board
  const rerun = await runBroadFirst({
    rootTopics: ['alpha subsystem stalls', 'beta gate flakes'],
    agent: AGENT,
    maxDepth: 1,
    maxBreadth: 2,
    maxHypotheses: 24,
  });
  assert.deepEqual(rerun.final_state, result.final_state);
});

test('the GLOBAL BUDGET is a hard cap, enforced BEFORE dispatch and never silent', async () => {
  const result = await runBroadFirst({
    rootTopics: ['a', 'b', 'c'],
    agent: AGENT,
    maxDepth: 3,
    maxBreadth: 2,
    maxHypotheses: 3,
  });
  // level 0: floor(3/2)=1 node allowed of 3 → 2 dropped, 2 admitted; then floor(1/2)=0 → halt
  assert.ok(result.admitted <= 3, 'admissions NEVER exceed the budget');
  assert.equal(result.admitted, 2);
  assert.equal(result.explored, 1);
  assert.equal(result.dropped_nodes, 4, 'both dropped roots and the undispatched children are counted');
  assert.deepEqual(result.levels, [
    { depth: 0, dispatched: 1, dropped: 2, admitted: 2, rejected: 0 },
    { depth: 1, dispatched: 0, dropped: 2, admitted: 0, rejected: 0 },
  ]);
});

test('the PER-NODE breadth cap refuses a generator\'s surplus at the engine, counted and reported', async () => {
  const result = await runBroadFirst({
    rootTopics: ['only'],
    agent: AGENT,
    maxDepth: 0,
    maxBreadth: 2,
    generate: (node) => [
      proposal(`${node.node_id}-1`, `${node.node_id}-h1`, 0.5),
      proposal(`${node.node_id}-2`, `${node.node_id}-h2`, 0.6),
      proposal(`${node.node_id}-3`, `${node.node_id}-h3`, 0.7), // surplus — refused, never ingested
      proposal(`${node.node_id}-4`, `${node.node_id}-h4`, 0.8), // surplus — refused, never ingested
    ],
  });
  assert.equal(result.admitted, 2);
  assert.equal(result.rejected, 2);
  assert.equal(result.rejections.length, 1);
  assert.match(result.rejections[0].errors[0], /engine breadth cap: node emitted 4 events, cap is 2/);
  assert.equal(result.final_state.hypotheses['bf0-h3'], undefined, 'surplus events never became state');
  assert.equal(result.syntheses.length, 2, 'no synthesis for a refused event');
});

test('a custom generator\'s INVALID events are rejected by the schema gate — reported, not synthesized', async () => {
  const result = await runBroadFirst({
    rootTopics: ['only'],
    agent: AGENT,
    maxDepth: 0,
    maxBreadth: 3,
    generate: () => [
      proposal('ok-1', 'h-ok', 0.5),
      { event_id: 'bad-1', event_type: 'hypothesis.proposed' }, // schema-invalid
    ],
  });
  assert.equal(result.admitted, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.rejections[0].node_id, 'bf0');
  assert.ok(result.rejections[0].errors.length > 0, 'the schema gate\'s reasons are reported');
  assert.equal(result.syntheses.length, 1);
});

test('caps and inputs are STRICT and configuration-driven: misconfiguration throws before anything runs', async () => {
  const ok = { rootTopics: ['t'], agent: AGENT };
  await assert.rejects(() => runBroadFirst({ ...ok, rootTopics: [] }), /rootTopics/);
  await assert.rejects(() => runBroadFirst({ ...ok, rootTopics: ['t', ''] }), /rootTopics/);
  await assert.rejects(() => runBroadFirst({ ...ok, agent: { agent_id: 'x' } }), /agent/);
  await assert.rejects(() => runBroadFirst({ ...ok, maxDepth: -1 }), /maxDepth/);
  await assert.rejects(() => runBroadFirst({ ...ok, maxDepth: 1.5 }), /maxDepth/);
  await assert.rejects(() => runBroadFirst({ ...ok, maxBreadth: 0 }), /maxBreadth/);
  await assert.rejects(() => runBroadFirst({ ...ok, maxHypotheses: 0 }), /maxHypotheses/);
  await assert.rejects(() => runBroadFirst({ ...ok, generate: 'not a function' }), /generate/);
  await assert.rejects(() => runBroadFirst(), /rootTopics/);
  await assert.rejects(
    () => runBroadFirst({ ...ok, generate: () => 'not an array' }),
    /generator must return an array/
  );
  assert.ok(Object.isFrozen(BROAD_FIRST_DEFAULTS));
  assert.ok(BROAD_FIRST_DEFAULTS.maxBreadth <= HYPOTHESIS_LENSES.length,
    'the default breadth is servable by the primitive lens matrix');
});

// --- the wave's Given/When/Then --------------------------------------------------------------------
test('GWT: asynchronous Ledger updates drive IMMEDIATE intermediate synthesis — the pipeline never waits for all hypotheses to resolve', async () => {
  const stream = createSynthesisStream();
  const seen = [];
  stream.subscribe((s) => seen.push(s.trigger.hypothesis_id));

  // two hypothesis sources: one resolves immediately, one stalls until the test releases it —
  // the asynchronous arrival pattern of real Merge Gate traffic
  let releaseSlow;
  const slowGate = new Promise((resolve) => { releaseSlow = resolve; });
  const generate = async (node) => {
    if (node.node_id === 'bf0') {
      return [proposal('evt-fast', 'h-fast', 0.7, 'fast-worker')];
    }
    await slowGate;
    return [proposal('evt-slow', 'h-slow', 0.9, 'slow-worker')];
  };

  let runResolved = false;
  const run = runBroadFirst({
    rootTopics: ['fast topic', 'slow topic'],
    agent: AGENT,
    maxDepth: 0,
    maxBreadth: 1,
    generate,
    stream,
  });
  run.then(() => { runResolved = true; });

  await new Promise((resolve) => setImmediate(resolve)); // let settled sources land; the slow one stays pending

  // WHEN the rolling reducer stream listener receives the fast update, THEN it synthesizes
  // immediately — while the sibling hypothesis is STILL unresolved and the run is still in flight.
  assert.equal(runResolved, false, 'the pipeline is still in flight — not all hypotheses have resolved');
  assert.deepEqual(seen, ['h-fast'], 'the intermediate synthesis was emitted the moment the update arrived');
  const [first] = stream.getSyntheses();
  assert.equal(first.intermediate, true);
  assert.equal(first.leader, 'h-fast');
  assert.deepEqual(first.totals, { events: 1, applied: 1, conflicts: 0, open: 1, retracted: 0 });

  // release the stalled source: the pipeline completes and the board re-ranks on arrival
  releaseSlow();
  const result = await run;
  assert.deepEqual(seen, ['h-fast', 'h-slow'], 'each update synthesized on ITS arrival, in arrival order');
  assert.equal(result.admitted, 2);
  const [, second] = stream.getSyntheses();
  assert.equal(second.leader, 'h-slow', 'the late, stronger hypothesis takes the lead only once it actually arrives');
  assert.deepEqual(second.ranking.map((r) => r.hypothesis_id), ['h-slow', 'h-fast']);
});
