// Gandalf Broad-First engine — PRIMITIVE PARALLEL HYPOTHESIS GENERATION (Wave 3).
//
// The Broad-First engine explores a topic by putting MANY candidate hypotheses on the table at
// once — the "matrix" of broad-first planning: exploration nodes (topics) × analytic lenses.
// This module is the PRIMITIVE generator behind that matrix: deliberately deterministic and
// LLM-free, so the Merge Gate, the Ledger, and the rolling synthesis stream can be exercised and
// tested against real event traffic long before a model sits in the loop. A production generator
// (an LLM constrained to the Wave 1 generated schema) is a drop-in replacement — the engine takes
// any `generate(node)` function; this one is the always-available, always-deterministic default.
//
// The contract this generator honors:
//   ADMISSIBLE-BY-CONSTRUCTION — every emitted event is asserted against the Wave 1 generated
//     schema (engine/event-schema.mjs) before it leaves this module. The primitive generator
//     NEVER emits an event the Ledger would refuse.
//   DETERMINISTIC — no clocks, no randomness. Event ids and hypothesis ids are pure functions of
//     (nodeId, lens id); statements are pure functions of the topic; confidence priors are frozen
//     per lens. Same inputs ⇒ byte-identical events, every call.
//   ORTHOGONAL BY DESIGN — the lenses are distinct analytic angles (root cause, inversion,
//     boundary, scaling, hidden dependency), so one node's hypotheses are structurally spread,
//     not five paraphrases of one idea. Distinct frozen priors give every batch a deterministic
//     initial ranking in the reducer.
//
// Public surface:
//   HYPOTHESIS_LENSES               — the frozen lens matrix columns (id, prior, frame)
//   generateHypotheses(opts)        — {topic, nodeId, agent, breadth?} → hypothesis.proposed events
//
// Stdlib-only; imports only the Wave 1 schema gate.

import { assertValidEvent } from './event-schema.mjs';

/** The frozen lens matrix columns. Each lens is one orthogonal analytic angle; `prior` is the
 *  lens's frozen initial confidence (all distinct, so a fresh batch has a deterministic ranking
 *  in the Ledger Reducer); `frame` turns a topic into that lens's hypothesis statement. Order is
 *  part of the contract: `breadth` selects a PREFIX of this list. */
export const HYPOTHESIS_LENSES = Object.freeze([
  Object.freeze({
    id: 'root-cause',
    prior: 0.5,
    frame: (topic) => `A single dominant root cause, not an accumulation of small ones, drives the observed behavior of: ${topic}`,
  }),
  Object.freeze({
    id: 'inversion',
    prior: 0.45,
    frame: (topic) => `The prevailing assumption is backwards — what is commonly read as the cause is actually the consequence in: ${topic}`,
  }),
  Object.freeze({
    id: 'boundary',
    prior: 0.4,
    frame: (topic) => `The decisive failures occur at the boundaries and hand-off points, not in the core path, of: ${topic}`,
  }),
  Object.freeze({
    id: 'scaling',
    prior: 0.35,
    frame: (topic) => `Behavior changes qualitatively, not just quantitatively, as scale or load grows in: ${topic}`,
  }),
  Object.freeze({
    id: 'hidden-dependency',
    prior: 0.3,
    frame: (topic) => `An unstated external dependency, currently invisible, governs the outcome of: ${topic}`,
  }),
]);

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`hypothesis-generator: ${name} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Generate one exploration node's hypothesis batch: the first `breadth` lenses applied to the
 * topic, each as a schema-valid `hypothesis.proposed` event carrying the producing agent's
 * provenance. Ids are namespaced by the node (`h:<nodeId>:<lensId>` / `evt:<nodeId>:<lensId>`),
 * so distinct nodes can never collide in the Ledger — reusing a nodeId across calls DOES collide,
 * deliberately: the Ledger's R1 rule then records the duplicates as conflicts instead of this
 * module silently minting fresh identities for the same work.
 *
 * Pure and deterministic; throws only on caller misconfiguration, never on topic content —
 * hostile bytes are the Merge Gate's problem (Wave 2), and strings are never instructions.
 *
 * @param {{
 *   topic: string,                          — what this node is exploring
 *   nodeId: string,                         — the exploration node's unique id (namespaces all ids)
 *   agent: {agent_id: string, agent_family: string}, — producer-side provenance for every event
 *   breadth?: number,                       — how many lenses to apply (default: all)
 * }} opts
 * @returns {Array<object>} schema-valid `hypothesis.proposed` events, in lens order
 */
export function generateHypotheses(opts) {
  const { topic, nodeId, agent, breadth = HYPOTHESIS_LENSES.length } = opts ?? {};
  requireNonEmptyString(topic, 'topic');
  requireNonEmptyString(nodeId, 'nodeId');
  if (agent === null || typeof agent !== 'object') {
    throw new Error('hypothesis-generator: agent must be an object with agent_id and agent_family');
  }
  requireNonEmptyString(agent.agent_id, 'agent.agent_id');
  requireNonEmptyString(agent.agent_family, 'agent.agent_family');
  if (!Number.isInteger(breadth) || breadth < 1 || breadth > HYPOTHESIS_LENSES.length) {
    throw new Error(
      `hypothesis-generator: breadth must be an integer in 1..${HYPOTHESIS_LENSES.length}, got ${JSON.stringify(breadth)}`
    );
  }

  return HYPOTHESIS_LENSES.slice(0, breadth).map((lens) => {
    const event = {
      event_id: `evt:${nodeId}:${lens.id}`,
      event_type: 'hypothesis.proposed',
      source: { agent_id: agent.agent_id, agent_family: agent.agent_family },
      payload: {
        hypothesis_id: `h:${nodeId}:${lens.id}`,
        statement: lens.frame(topic),
        rationale: `Primitive broad-first lens '${lens.id}' (prior ${lens.prior}) applied to node '${nodeId}'.`,
        confidence: lens.prior,
      },
    };
    assertValidEvent(event); // ADMISSIBLE-BY-CONSTRUCTION: this module never emits a refusable event
    return event;
  });
}
