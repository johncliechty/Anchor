// Gandalf Broad-First engine — IPC BOUNDARY DESERIALIZATION MIDDLEWARE (Wave 2).
//
// The IPC boundary is where an isolated worker's bytes try to become the orchestrator's data.
// Everything crossing it is ADVERSARIAL until proven otherwise: this middleware is the single
// choke point that turns a raw wire payload into a schema-valid Ledger event, or QUARANTINES it
// with the full list of reasons. Nothing bypasses it; nothing it rejects is ever repaired or
// partially admitted (rewriting adversarial data is itself an injection vector — we refuse, we
// never fix up).
//
// The gauntlet, in order — every gate independent, all violations reported together where the
// stage allows:
//   G1 TYPE      — the payload must be a string or Buffer (the wire carries bytes, not objects;
//                  a live object reference across the boundary would BE shared state).
//   G2 SIZE      — a strict, configuration-driven byte cap (no unbounded allocations from a
//                  hostile peer).
//   G3 PARSE     — strict JSON.parse; anything else is quarantined.
//   G4 KEYS      — prototype-pollution vectors ('__proto__', 'constructor', 'prototype') are
//                  forbidden as OWN KEYS anywhere in the structure. JSON.parse itself does not
//                  pollute, but any later merge/assign over an admitted object would — so such
//                  payloads never get admitted at all.
//   G5 STRINGS   — control characters are forbidden in every key and string value (only \t and
//                  \n are allowed): terminal-escape and log-forging bytes never enter the system.
//   G6 SCHEMA    — the Wave 1 strict generated-schema gate (engine/event-schema.mjs): the event
//                  either conforms exactly or is quarantined.
//   G7 PROVENANCE— optional identity pinning: when the caller knows which agent owns this IPC
//                  channel, `source.agent_id` must match it. A worker can therefore never forge
//                  another agent's provenance — the channel, not the payload, decides identity.
//
// Public surface:
//   IPC_DEFAULTS                  — frozen defaults (maxBytes)
//   FORBIDDEN_KEYS                — the frozen prototype-pollution key list
//   deserializeIpcMessage(raw, opts) — → {ok:true, event} | {ok:false, errors} (never throws on data)
//   ingestFromIpc(ledger, raw, opts) — deserialize + ledger.ingest in one step, with the stage
//                                      that rejected ('boundary' | 'ledger') named in the result
//
// Stdlib-only; imports only the Wave 1 schema gate.

import { validateEvent } from './event-schema.mjs';

/** Frozen middleware defaults. `maxBytes` is deliberately modest — Ledger events are small; a
 *  large payload at this boundary is a red flag, and callers must OPT IN to raising the cap. */
export const IPC_DEFAULTS = Object.freeze({ maxBytes: 64 * 1024 });

/** Own keys forbidden anywhere in an IPC payload — the classic prototype-pollution vectors. */
export const FORBIDDEN_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

// Control characters forbidden inside keys and string values: all of C0 except \t (0x09) and
// \n (0x0A), plus DEL (0x7F). \r is forbidden too — CR is a log-spoofing byte, and no Ledger
// event has a legitimate use for it.
const FORBIDDEN_CONTROL_RE = /[\x00-\x08\x0B-\x1F\x7F]/;

function scanStructure(value, path, errors) {
  if (typeof value === 'string') {
    if (FORBIDDEN_CONTROL_RE.test(value)) {
      errors.push(`${path}: string contains forbidden control characters (only \\t and \\n are allowed)`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanStructure(v, `${path}[${i}]`, errors));
    return;
  }
  if (value !== null && typeof value === 'object') {
    // Object.entries reads own enumerable properties directly — a parsed '__proto__' own key is
    // seen as data here, never followed as a prototype reference.
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k)) {
        errors.push(`${path}: forbidden key '${k}' (prototype-pollution vector)`);
        continue; // never descend into a poisoned subtree
      }
      if (FORBIDDEN_CONTROL_RE.test(k)) {
        errors.push(`${path}: key ${JSON.stringify(k)} contains forbidden control characters`);
      }
      scanStructure(v, `${path}.${k}`, errors);
    }
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * THE MIDDLEWARE: deserialize one raw IPC payload through the full gauntlet (G1–G7 above).
 * On success returns the parsed event, DEEP-FROZEN — what crossed the boundary is immutable
 * evidence from here on. On any violation returns every error found at the failing stage.
 * Pure with respect to data: never throws on payload content, only on caller misconfiguration.
 *
 * @param {unknown} raw — the wire payload (string or Buffer)
 * @param {{maxBytes?: number, expectedSourceAgentId?: string|null}} [opts]
 * @returns {{ok: true, event: object} | {ok: false, errors: string[]}}
 */
export function deserializeIpcMessage(raw, opts = {}) {
  const { maxBytes = IPC_DEFAULTS.maxBytes, expectedSourceAgentId = null } = opts;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error(`ipc-middleware: maxBytes must be a positive finite number, got ${JSON.stringify(maxBytes)}`);
  }
  if (expectedSourceAgentId !== null && (typeof expectedSourceAgentId !== 'string' || expectedSourceAgentId.length === 0)) {
    throw new Error('ipc-middleware: expectedSourceAgentId must be null or a non-empty string');
  }

  // G1 TYPE
  let text;
  if (typeof raw === 'string') text = raw;
  else if (Buffer.isBuffer(raw)) text = raw.toString('utf8');
  else return { ok: false, errors: [`ipc: payload must be a string or Buffer, got ${raw === null ? 'null' : typeof raw}`] };

  // G2 SIZE
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) {
    return { ok: false, errors: [`ipc: payload is ${bytes} bytes, exceeding the configured cap of ${maxBytes}`] };
  }

  // G3 PARSE
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`ipc: payload is not valid JSON — ${e.message}`] };
  }

  // G4 KEYS + G5 STRINGS (one walk, all violations reported together)
  const structureErrors = [];
  scanStructure(parsed, '$', structureErrors);
  if (structureErrors.length) {
    return { ok: false, errors: structureErrors };
  }

  // G6 SCHEMA — the Wave 1 strict generated-schema gate
  const schemaErrors = validateEvent(parsed);
  if (schemaErrors.length) {
    return { ok: false, errors: schemaErrors };
  }

  // G7 PROVENANCE — the channel, not the payload, decides identity
  if (expectedSourceAgentId !== null && parsed.source.agent_id !== expectedSourceAgentId) {
    return {
      ok: false,
      errors: [
        `ipc: provenance forgery — source.agent_id ${JSON.stringify(parsed.source.agent_id)} does not match the channel's assigned agent ${JSON.stringify(expectedSourceAgentId)}`,
      ],
    };
  }

  return { ok: true, event: deepFreeze(parsed) };
}

/**
 * Deserialize one raw IPC payload and, only if it passes the full boundary gauntlet, ingest it
 * into the Ledger (which re-validates on append — defense in depth, both gates share the one
 * generated schema). The result names WHICH stage rejected, so quarantine handling can
 * distinguish a hostile boundary payload from a schema regression at the Ledger.
 *
 * @param {{ingest: (raw: unknown) => object}} ledger — a Wave 1 createLedger() instance
 * @param {unknown} raw — the wire payload
 * @param {{maxBytes?: number, expectedSourceAgentId?: string|null}} [opts]
 * @returns {{ok: true, stage: 'admitted', record: object}
 *         | {ok: false, stage: 'boundary'|'ledger', errors: string[]}}
 */
export function ingestFromIpc(ledger, raw, opts = {}) {
  const result = deserializeIpcMessage(raw, opts);
  if (!result.ok) {
    return { ok: false, stage: 'boundary', errors: result.errors };
  }
  const appended = ledger.ingest(result.event);
  if (!appended.ok) {
    return { ok: false, stage: 'ledger', errors: appended.errors };
  }
  return { ok: true, stage: 'admitted', record: appended.record };
}
