// Gandalf Broad-First engine — UUID LINEAGE TRACING (Wave 2).
//
// Every isolated execution context (worker process) carries a UUID trace identity, and every
// child context's identity is DERIVED from its parent's — so any event, log line, or IPC message
// can be traced back through the full spawn chain to the run root. Lineage is the out-of-process
// half of provenance: the Ledger records WHO said something (source.agent_id, seq); lineage
// records WHERE in the process tree it was said, in a form no worker can forge (the host derives
// and assigns lineage — workers only ever receive theirs, never mint it).
//
// A lineage is a frozen value object:
//   { trace_id, parent_trace_id, path }
// where `path` is the full root→self chain of trace ids (path[path.length-1] === trace_id, and
// for a non-root, path[path.length-2] === parent_trace_id). Frozen so a reference handed across
// module boundaries can never be rewritten into a different ancestry.
//
// Public surface:
//   newTraceId()                — a fresh v4 UUID
//   isTraceId(value)            — strict v4 UUID check
//   createRootLineage()         — the lineage of a run root (no parent)
//   deriveChildLineage(parent)  — a child lineage extending the parent's path
//   validateLineage(lineage)    — → string[] of errors (empty ⇒ well-formed)
//   assertValidLineage(lineage) — throws with the joined errors on any violation
//
// Stdlib-only (node:crypto for UUIDs); no clocks, no I/O.

import { randomUUID } from 'node:crypto';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A fresh v4 UUID trace id. */
export function newTraceId() {
  return randomUUID();
}

/** Strict v4 UUID check — trace ids are exactly what `newTraceId` mints, nothing looser. */
export function isTraceId(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

/** The lineage of a run root: a fresh trace id with no parent and a single-entry path. Frozen. */
export function createRootLineage() {
  const trace_id = newTraceId();
  return Object.freeze({
    trace_id,
    parent_trace_id: null,
    path: Object.freeze([trace_id]),
  });
}

/**
 * Derive a CHILD lineage from a parent's: a fresh trace id whose path is the parent's path plus
 * itself. Throws if the parent lineage is malformed — a broken chain must never silently extend.
 *
 * @param {{trace_id: string, parent_trace_id: string|null, path: string[]}} parent
 * @returns {{trace_id: string, parent_trace_id: string, path: readonly string[]}} frozen
 */
export function deriveChildLineage(parent) {
  assertValidLineage(parent);
  const trace_id = newTraceId();
  return Object.freeze({
    trace_id,
    parent_trace_id: parent.trace_id,
    path: Object.freeze([...parent.path, trace_id]),
  });
}

/**
 * Validate a lineage value: shape, strict v4 UUIDs throughout, path continuity (self is last,
 * parent is second-to-last, root has a single-entry path), and no cycles (no duplicate ids).
 * Returns an array of error strings — empty array ⇒ well-formed. Pure; never throws on data.
 *
 * @param {unknown} lineage
 * @returns {string[]} errors (empty ⇒ valid)
 */
export function validateLineage(lineage) {
  const errors = [];
  if (lineage === null || typeof lineage !== 'object' || Array.isArray(lineage)) {
    return [`lineage: expected an object, got ${lineage === null ? 'null' : Array.isArray(lineage) ? 'array' : typeof lineage}`];
  }
  if (!isTraceId(lineage.trace_id)) {
    errors.push(`lineage.trace_id: not a v4 UUID (${JSON.stringify(lineage.trace_id)})`);
  }
  if (lineage.parent_trace_id !== null && !isTraceId(lineage.parent_trace_id)) {
    errors.push(`lineage.parent_trace_id: not null and not a v4 UUID (${JSON.stringify(lineage.parent_trace_id)})`);
  }
  if (!Array.isArray(lineage.path) || lineage.path.length === 0) {
    errors.push('lineage.path: expected a non-empty array of trace ids');
    return errors; // the continuity checks below need a real path
  }
  lineage.path.forEach((id, i) => {
    if (!isTraceId(id)) errors.push(`lineage.path[${i}]: not a v4 UUID (${JSON.stringify(id)})`);
  });
  if (lineage.path[lineage.path.length - 1] !== lineage.trace_id) {
    errors.push('lineage.path: last entry must be trace_id (self)');
  }
  if (lineage.parent_trace_id === null) {
    if (lineage.path.length !== 1) errors.push('lineage.path: a root lineage must have a single-entry path');
  } else if (lineage.path.length < 2 || lineage.path[lineage.path.length - 2] !== lineage.parent_trace_id) {
    errors.push('lineage.path: second-to-last entry must be parent_trace_id');
  }
  if (new Set(lineage.path).size !== lineage.path.length) {
    errors.push('lineage.path: duplicate trace ids (a lineage chain must be acyclic)');
  }
  return errors;
}

/** Assert a lineage is well-formed; throws with every violation joined on failure. */
export function assertValidLineage(lineage) {
  const errors = validateLineage(lineage);
  if (errors.length) {
    throw new Error(`trace-lineage validation FAILED:\n  - ${errors.join('\n  - ')}`);
  }
}
