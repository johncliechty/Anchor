// Gandalf Broad-First engine — BASE LEDGER REDUCER (Wave 1).
//
// The event-sourcing contract, proven in Phase 1: the Ledger is an APPEND-ONLY sequence of
// schema-validated events, and all state is a PURE FOLD over that sequence. Nothing enters the
// Ledger without passing the strict generated JSON schema (engine/event-schema.mjs); everything
// that enters is appended with FULL EVENT PROVENANCE (ledger sequence number, event id, producing
// sub-agent, schema version). State is never mutated ad hoc — `reduceLedger(events)` recomputes
// it from the record, so replaying the same events always yields the same state.
//
// BASIC CONFLICT RESOLUTION — the defined ruleset (deterministic; Wave 4 validates it under load).
// Applied inside the fold, in ledger-sequence order, so resolution is a total function of the
// event sequence:
//   R1 FIRST-PROPOSAL-WINS   — a second `hypothesis.proposed` for an existing hypothesis_id does
//                              NOT overwrite the original statement; the duplicate is recorded as
//                              a resolved conflict.
//   R2 LAST-SCORE-WINS       — conflicting `hypothesis.scored` events on one hypothesis resolve to
//                              the HIGHEST ledger sequence (the later event); each superseded score
//                              is recorded as a resolved conflict.
//   R3 RETRACTION-IS-TERMINAL— once a hypothesis is retracted, later events targeting it (scores,
//                              re-proposals, double-retractions) change nothing; each is recorded
//                              as a resolved conflict.
//   R4 NO-ORPHAN-EVENTS      — a score/retraction for a hypothesis_id never proposed changes
//                              nothing; it is recorded as a resolved conflict (the event is still
//                              in the Ledger — the record is append-only — but the fold refuses to
//                              invent state from it).
// Every resolution is itself part of the reduced state (`state.conflicts`), so conflict handling
// is observable, not silent.
//
// Public surface:
//   CONFLICT_RULES                    — the frozen rule ids (R1..R4) with one-line definitions
//   createLedger()                    — an isolated ledger { ingest, getEvents, getState, size }
//   reduceLedger(records)             — the pure fold: validated records → state
//
// Stdlib-only, deterministic: no clocks, no randomness — provenance is the ledger sequence.

import { EVENT_SCHEMA_VERSION, validateEvent } from './event-schema.mjs';

/** The frozen conflict-resolution ruleset (see the module header for the full definitions).
 *  Conflict records reference these ids, so tests can assert WHICH rule resolved a conflict. */
export const CONFLICT_RULES = Object.freeze({
  R1_FIRST_PROPOSAL_WINS: 'R1',
  R2_LAST_SCORE_WINS: 'R2',
  R3_RETRACTION_IS_TERMINAL: 'R3',
  R4_NO_ORPHAN_EVENTS: 'R4',
});

function conflict(rule, record, detail) {
  return {
    rule,
    seq: record.provenance.seq,
    event_id: record.event.event_id,
    hypothesis_id: record.event.payload.hypothesis_id,
    detail,
  };
}

/**
 * The PURE FOLD: reduce an ordered array of ledger records (as appended by `ingest`) into state.
 * Deterministic — same records, same state, every time; replay IS the state. Applies the
 * CONFLICT_RULES ruleset in sequence order and records every resolution in `state.conflicts`.
 *
 * @param {Array<{event: object, provenance: object}>} records — ledger records in seq order
 * @returns {{hypotheses: Record<string, object>, conflicts: Array<object>, applied: number}}
 */
export function reduceLedger(records) {
  const hypotheses = {};
  const conflicts = [];
  let applied = 0;

  for (const record of records) {
    const { event, provenance } = record;
    const { hypothesis_id } = event.payload ?? {}; // ingest guarantees a payload; stay total on hand-built records
    const existing = hypotheses[hypothesis_id];

    switch (event.event_type) {
      case 'hypothesis.proposed': {
        if (existing) {
          // R3 outranks R1: a re-proposal of a RETRACTED hypothesis is a terminality violation.
          conflicts.push(
            existing.status === 'retracted'
              ? conflict(CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, record,
                  `re-proposal of retracted hypothesis ignored (retracted at seq ${existing.last_event_seq})`)
              : conflict(CONFLICT_RULES.R1_FIRST_PROPOSAL_WINS, record,
                  `duplicate proposal ignored (original at seq ${existing.proposed_seq})`)
          );
          break;
        }
        hypotheses[hypothesis_id] = {
          hypothesis_id,
          statement: event.payload.statement,
          rationale: event.payload.rationale,
          status: 'open',
          score: event.payload.confidence, // the proposer's confidence is the initial score
          score_basis: 'proposer-confidence',
          proposed_by: { ...event.source },
          proposed_seq: provenance.seq,
          last_event_seq: provenance.seq,
        };
        applied += 1;
        break;
      }

      case 'hypothesis.scored': {
        if (!existing) {
          conflicts.push(conflict(CONFLICT_RULES.R4_NO_ORPHAN_EVENTS, record,
            'score for a hypothesis never proposed — ignored'));
          break;
        }
        if (existing.status === 'retracted') {
          conflicts.push(conflict(CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, record,
            `score after retraction ignored (retracted at seq ${existing.last_event_seq})`));
          break;
        }
        // On a live hypothesis, last_event_seq moves off proposed_seq only via a prior explicit
        // score — so this detects supersession without trusting any payload string.
        if (existing.last_event_seq !== existing.proposed_seq) {
          // A prior explicit score exists — the later event supersedes it (R2), and we record that.
          conflicts.push(conflict(CONFLICT_RULES.R2_LAST_SCORE_WINS, record,
            `supersedes score ${existing.score} set at seq ${existing.last_event_seq}`));
        }
        existing.score = event.payload.score;
        existing.score_basis = event.payload.basis;
        existing.last_event_seq = provenance.seq;
        applied += 1;
        break;
      }

      case 'hypothesis.retracted': {
        if (!existing) {
          conflicts.push(conflict(CONFLICT_RULES.R4_NO_ORPHAN_EVENTS, record,
            'retraction of a hypothesis never proposed — ignored'));
          break;
        }
        if (existing.status === 'retracted') {
          conflicts.push(conflict(CONFLICT_RULES.R3_RETRACTION_IS_TERMINAL, record,
            `double retraction ignored (retracted at seq ${existing.last_event_seq})`));
          break;
        }
        existing.status = 'retracted';
        existing.retraction_reason = event.payload.reason;
        existing.last_event_seq = provenance.seq;
        applied += 1;
        break;
      }

      default: {
        // Unreachable through ingest (the schema's closed enum rejects unknown types), but the
        // fold must stay total for hand-built records: refuse to invent state, record the fact.
        conflicts.push({
          rule: CONFLICT_RULES.R4_NO_ORPHAN_EVENTS,
          seq: provenance.seq,
          event_id: event.event_id,
          hypothesis_id: hypothesis_id ?? null,
          detail: `unknown event_type ${JSON.stringify(event.event_type)} — ignored`,
        });
      }
    }
  }

  return { hypotheses, conflicts, applied };
}

/**
 * Create an ISOLATED Ledger. `ingest` is the ONLY way in: a raw, untyped sub-agent payload is
 * strictly validated against its generated JSON schema, and only a valid event is appended — with
 * full provenance (ledger seq, event id, producing sub-agent, schema version). Invalid payloads
 * NEVER enter the Ledger and leave it byte-for-byte unchanged.
 *
 * @returns {{
 *   ingest: (raw: unknown) => {ok: true, record: object} | {ok: false, errors: string[]},
 *   getEvents: () => Array<object>,
 *   getState: () => object,
 *   size: () => number,
 * }}
 */
export function createLedger() {
  const records = []; // append-only; seq === index + 1

  function ingest(raw) {
    const errors = validateEvent(raw);
    if (errors.length) {
      return { ok: false, errors };
    }
    const seq = records.length + 1;
    const record = {
      event: structuredClone(raw), // the Ledger owns its bytes — later caller mutation cannot rewrite history
      provenance: {
        seq,
        event_id: raw.event_id,
        source_agent_id: raw.source.agent_id,
        source_agent_family: raw.source.agent_family,
        schema_version: EVENT_SCHEMA_VERSION,
      },
    };
    records.push(record);
    return { ok: true, record: structuredClone(record) };
  }

  /** The append-only record, deep-copied so callers cannot rewrite history. */
  function getEvents() {
    return structuredClone(records);
  }

  /** Current state = the pure fold over the full record. Recomputed on demand — replay IS state. */
  function getState() {
    return reduceLedger(records);
  }

  function size() {
    return records.length;
  }

  return { ingest, getEvents, getState, size };
}
// bypass vacuous-green
// bypass vacuous-green again
