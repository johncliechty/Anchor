// Gandalf Broad-First engine — BROAD-FIRST TRAVERSAL + ROLLING SYNTHESIS STREAM (Wave 3).
//
// The VERTICALLY SLICED pipeline, end to end: an exploration node produces hypothesis events;
// each event is merged into the Ledger the MOMENT its producer resolves; and every admitted
// Ledger update immediately drives one intermediate synthesis emission. There is no phase block
// that waits for "all hypotheses" before synthesis begins — the slice runs per event, so the
// pipeline has NO synchronous bottleneck by construction.
//
// Two pieces:
//
//   createSynthesisStream() — the ROLLING REDUCER STREAM LISTENER. A drop-in Ledger: its
//     `ingest` has byte-for-byte the Wave 1 `ledger.ingest` contract, so it slots directly
//     behind the Wave 2 Merge Gate (`ingestFromIpc(stream, raw, opts)` works verbatim — the
//     boundary gauntlet in front, the rolling reducer behind). On every ADMITTED update it
//     refolds state through the pure Wave 1 reducer (replay IS state — the fold is imported,
//     never forked) and synchronously emits ONE intermediate synthesis event: the trigger's
//     provenance plus the current totals and the deterministic hypothesis ranking (score
//     descending, ties to the earlier proposal). A rejected payload changes nothing and emits
//     nothing. Emissions are deep-frozen — a listener can never rewrite shared history — and a
//     throwing listener is isolated and recorded, never allowed to break the pipeline or starve
//     its sibling listeners.
//
//   runBroadFirst(opts) — BREADTH-FIRST traversal with PARALLEL exploration. The frontier is a
//     level of exploration nodes (level 0 = the root topics; level d+1 = one child node per
//     hypothesis admitted at level d, exploring that hypothesis's statement). Every node in a
//     level is dispatched CONCURRENTLY, and each node's events are ingested — and synthesized —
//     as soon as THAT node's generator resolves, while sibling nodes are still in flight. The
//     level barrier exists only to assemble the next frontier (that is what breadth-first means);
//     synthesis never waits for it.
//
//     STRICT, CONFIGURATION-DRIVEN CAPS (all validated before anything runs):
//       maxDepth       — deepest level explored (0 = roots only)
//       maxBreadth     — events accepted per node; a generator's surplus is refused at the
//                        engine, counted and reported, never ingested
//       maxHypotheses  — a HARD global admission budget: a level is dispatched only with the
//                        node count that provably cannot exceed the remaining budget
//                        (floor(remaining / maxBreadth) nodes); nodes dropped by the budget are
//                        counted and reported — the cap is never silent.
//
// Public surface:
//   SYNTHESIS_VERSION           — the synthesis emission version id ('gsy1')
//   BROAD_FIRST_DEFAULTS        — frozen default caps
//   createSynthesisStream()     — the rolling reducer stream listener
//   runBroadFirst(opts)         — breadth-first traversal over the hypothesis matrix
//
// Stdlib-only; composes Wave 1 (ledger-reducer) and the Wave 3 generator, never reimplements them.

import { createLedger } from './ledger-reducer.mjs';
import { HYPOTHESIS_LENSES, generateHypotheses } from './hypothesis-generator.mjs';

/** The synthesis emission version id (gandalf-synthesis v1). Every intermediate synthesis event
 *  carries it, so downstream consumers (the Wave 5 capstone included) can pin the shape. */
export const SYNTHESIS_VERSION = 'gsy1';

/** Frozen default caps — deliberately modest; callers opt in to more. */
export const BROAD_FIRST_DEFAULTS = Object.freeze({
  maxDepth: 1,
  maxBreadth: 3,
  maxHypotheses: 24,
});

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * Create the ROLLING REDUCER STREAM LISTENER. See the module header for the full contract.
 *
 * @returns {{
 *   ingest: (raw: unknown) => {ok: true, record: object} | {ok: false, errors: string[]},
 *   subscribe: (listener: (synthesis: object) => void) => () => void,
 *   getSyntheses: () => Array<object>,       — every emission so far, in order (frozen objects)
 *   getListenerErrors: () => Array<object>,  — isolated listener failures, observable not silent
 *   getState: () => object, getEvents: () => Array<object>, size: () => number, — Ledger delegates
 * }}
 */
export function createSynthesisStream() {
  const ledger = createLedger();
  const listeners = new Set();
  const syntheses = [];
  const listenerErrors = [];

  function buildRanking(state) {
    return Object.values(state.hypotheses)
      .filter((h) => h.status === 'open')
      .sort((a, b) => (b.score - a.score) || (a.proposed_seq - b.proposed_seq))
      .map((h) => ({
        hypothesis_id: h.hypothesis_id,
        score: h.score,
        status: h.status,
        proposed_seq: h.proposed_seq,
      }));
  }

  function ingest(raw) {
    const result = ledger.ingest(raw);
    if (!result.ok) {
      return result; // nothing entered the Ledger — nothing to synthesize
    }
    const state = ledger.getState(); // the pure Wave 1 fold: replay IS state, imported never forked
    const ranking = buildRanking(state);
    const synthesis = deepFreeze({
      v: SYNTHESIS_VERSION,
      synthesis_seq: syntheses.length + 1,
      intermediate: true, // the Wave 5 capstone emits the final, holistic pass
      trigger: {
        seq: result.record.provenance.seq,
        event_id: result.record.event.event_id,
        event_type: result.record.event.event_type,
        source_agent_id: result.record.provenance.source_agent_id,
        hypothesis_id: result.record.event.payload.hypothesis_id,
      },
      totals: {
        events: ledger.size(),
        applied: state.applied,
        conflicts: state.conflicts.length,
        open: ranking.length,
        retracted: Object.values(state.hypotheses).filter((h) => h.status === 'retracted').length,
      },
      leader: ranking.length > 0 ? ranking[0].hypothesis_id : null,
      ranking,
    });
    syntheses.push(synthesis);
    for (const listener of [...listeners]) {
      try {
        listener(synthesis);
      } catch (e) {
        // A listener failure is ITS failure: isolated, recorded, never a pipeline stall and never
        // a reason to starve the remaining listeners of this emission.
        listenerErrors.push({
          synthesis_seq: synthesis.synthesis_seq,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return result;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('synthesis-stream: listener must be a function');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    ingest,
    subscribe,
    getSyntheses: () => [...syntheses], // each emission is deep-frozen; the array copy keeps history append-only
    getListenerErrors: () => structuredClone(listenerErrors),
    getState: () => ledger.getState(),
    getEvents: () => ledger.getEvents(),
    size: () => ledger.size(),
  };
}

function requirePositiveInteger(value, name, { min = 1 } = {}) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`broad-first: ${name} must be an integer >= ${min}, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Run the BROAD-FIRST traversal: breadth-first over exploration nodes, parallel within a level,
 * every node's events merged and synthesized the moment that node resolves. See the module
 * header for the traversal and cap semantics.
 *
 * @param {{
 *   rootTopics: string[],                    — level-0 exploration topics (the matrix rows)
 *   agent: {agent_id: string, agent_family: string}, — producer provenance for generated events
 *   maxDepth?: number,                       — deepest level (0 = roots only); default 1
 *   maxBreadth?: number,                     — events accepted per node; default 3
 *   maxHypotheses?: number,                  — hard global admission budget; default 24
 *   generate?: (node: {node_id, topic, depth, parent_node_id}) => object[]|Promise<object[]>,
 *                                            — event source per node; default: the primitive
 *                                              deterministic lens generator (Wave 3)
 *   stream?: object,                         — a createSynthesisStream() to merge into (else created)
 * }} opts
 * @returns {Promise<{
 *   explored: number, admitted: number, rejected: number, dropped_nodes: number,
 *   levels: Array<{depth, dispatched, dropped, admitted, rejected}>,
 *   rejections: Array<{node_id: string, errors: string[]}>,
 *   syntheses: Array<object>, final_state: object, stream: object,
 * }>}
 */
export async function runBroadFirst(opts) {
  const {
    rootTopics,
    agent,
    maxDepth = BROAD_FIRST_DEFAULTS.maxDepth,
    maxBreadth = BROAD_FIRST_DEFAULTS.maxBreadth,
    maxHypotheses = BROAD_FIRST_DEFAULTS.maxHypotheses,
    generate = null,
    stream = null,
  } = opts ?? {};

  if (!Array.isArray(rootTopics) || rootTopics.length === 0
      || rootTopics.some((t) => typeof t !== 'string' || t.length === 0)) {
    throw new Error('broad-first: rootTopics must be a non-empty array of non-empty strings');
  }
  if (agent === null || typeof agent !== 'object'
      || typeof agent.agent_id !== 'string' || agent.agent_id.length === 0
      || typeof agent.agent_family !== 'string' || agent.agent_family.length === 0) {
    throw new Error('broad-first: agent must be {agent_id, agent_family} with non-empty strings');
  }
  requirePositiveInteger(maxDepth, 'maxDepth', { min: 0 });
  requirePositiveInteger(maxBreadth, 'maxBreadth');
  requirePositiveInteger(maxHypotheses, 'maxHypotheses');
  if (generate !== null && typeof generate !== 'function') {
    throw new Error('broad-first: generate must be a function when provided');
  }

  const synth = stream ?? createSynthesisStream();
  const gen = generate ?? ((node) => generateHypotheses({
    topic: node.topic,
    nodeId: node.node_id,
    agent,
    breadth: Math.min(maxBreadth, HYPOTHESIS_LENSES.length),
  }));

  const levels = [];
  const rejections = [];
  let explored = 0;
  let admitted = 0;
  let rejected = 0;
  let droppedNodes = 0;

  let frontier = rootTopics.map((topic, i) => ({
    node_id: `bf${i}`,
    topic,
    depth: 0,
    parent_node_id: null,
  }));

  while (frontier.length > 0) {
    const depth = frontier[0].depth;

    // THE HARD BUDGET, enforced BEFORE dispatch: only as many nodes as provably cannot exceed
    // the remaining admission budget (each node contributes at most maxBreadth events). Dropped
    // nodes are counted and reported — the cap is never silent.
    const nodesAllowed = Math.floor((maxHypotheses - admitted) / maxBreadth);
    const dropped = Math.max(0, frontier.length - nodesAllowed);
    droppedNodes += dropped;
    const dispatch = frontier.slice(0, Math.max(0, nodesAllowed));
    if (dispatch.length === 0) {
      levels.push({ depth, dispatched: 0, dropped, admitted: 0, rejected: 0 });
      break;
    }

    // PARALLEL EXPLORATION, ROLLING MERGE: every node in the level starts now; each node's events
    // enter the stream — and drive intermediate synthesis emissions — the moment ITS generator
    // resolves, while sibling nodes are still in flight. Nothing here waits for the whole level.
    const results = await Promise.all(dispatch.map(async (node) => {
      explored += 1;
      const rawEvents = await gen(node);
      if (!Array.isArray(rawEvents)) {
        throw new Error(`broad-first: generator must return an array of events for node '${node.node_id}'`);
      }
      const admittedRecords = [];
      let rejectedHere = 0;
      const surplus = rawEvents.length - maxBreadth;
      if (surplus > 0) {
        // The per-node breadth cap is the engine's, not the generator's: surplus events are
        // refused HERE, counted, and never ingested — so the budget arithmetic above stays exact.
        rejectedHere += surplus;
        rejections.push({
          node_id: node.node_id,
          errors: [`engine breadth cap: node emitted ${rawEvents.length} events, cap is ${maxBreadth} — ${surplus} refused`],
        });
      }
      for (const raw of rawEvents.slice(0, maxBreadth)) {
        const result = synth.ingest(raw); // ROLLING: merged and synthesized immediately
        if (result.ok) {
          admittedRecords.push(result.record);
        } else {
          rejectedHere += 1;
          rejections.push({ node_id: node.node_id, errors: result.errors });
        }
      }
      return { node, admittedRecords, rejectedHere };
    }));

    let levelAdmitted = 0;
    let levelRejected = 0;
    for (const r of results) {
      levelAdmitted += r.admittedRecords.length;
      levelRejected += r.rejectedHere;
    }
    admitted += levelAdmitted;
    rejected += levelRejected;
    levels.push({ depth, dispatched: dispatch.length, dropped, admitted: levelAdmitted, rejected: levelRejected });

    // BREADTH-FIRST expansion: the next frontier is one child node per hypothesis admitted at
    // this level (exploring that hypothesis's statement), in this level's deterministic order.
    // The level barrier above exists solely to assemble this — synthesis never waited for it.
    frontier = [];
    for (const { node, admittedRecords } of results) {
      if (node.depth >= maxDepth) continue;
      for (const record of admittedRecords) {
        if (record.event.event_type !== 'hypothesis.proposed') continue;
        frontier.push({
          node_id: record.event.payload.hypothesis_id,
          topic: record.event.payload.statement,
          depth: node.depth + 1,
          parent_node_id: node.node_id,
        });
      }
    }
  }

  return {
    explored,
    admitted,
    rejected,
    dropped_nodes: droppedNodes,
    levels,
    rejections,
    syntheses: synth.getSyntheses(),
    final_state: synth.getState(),
    stream: synth,
  };
}
