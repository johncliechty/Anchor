// Gandalf Broad-First engine — CORE EVENT SCHEMA (Wave 1).
//
// Every event that wants to enter the Ledger is a raw, UNTYPED payload produced by a sub-agent
// (typically an LLM). Nothing enters the Ledger without first passing STRICT validation against a
// GENERATED JSON schema — the event-sourcing contract's front door. This module is both halves of
// that contract:
//
//   1. NATIVE LLM SCHEMA GENERATION INTEGRATION — `generateEventSchema(eventType)` emits a
//      self-contained, strict JSON Schema (additionalProperties:false, every property required)
//      in the exact shape native LLM structured-output / tool-input APIs accept, so the host can
//      constrain a sub-agent's decoding to the schema. The SAME generated schema is what ingestion
//      validates against — what the LLM was constrained to and what the Ledger admits are one
//      artifact, never two drifting copies.
//
//   2. STRICT INGESTION VALIDATION — `validateEvent(raw)` → string[] of errors (empty ⇒ admissible).
//      Unknown keys, missing keys, wrong types, and out-of-enum event types are all hard errors:
//      a payload either conforms exactly or it never touches the Ledger.
//
// Stdlib-only and pure: the validator is the same strict subset the test harness uses
// (type / const / enum / min-max / items / required / additionalProperties), reimplemented here
// because runtime code must not import from test/.
//
// Public surface:
//   EVENT_SCHEMA_VERSION            — the versioned schema id ('gle1', gandalf-ledger-event v1)
//   LEDGER_EVENT_TYPES              — the closed enum of admissible event types
//   generateEventSchema(eventType)  — strict, LLM-structured-output-ready schema for one type
//   generateEnvelopeSchema()        — strict schema for the full envelope (event_type as enum)
//   validateEvent(raw)              — → string[] of errors (empty array ⇒ valid)
//   assertValidEvent(raw)           — throws with the joined errors on any violation

/** The versioned event-schema id (gandalf-ledger-event v1). Every generated schema and every
 *  admitted event carries it, so a future v2 can coexist without ambiguity. */
export const EVENT_SCHEMA_VERSION = 'gle1';

/** The CLOSED enum of event types the Ledger admits in Wave 1. The Broad-First engine explores
 *  hypotheses, so the base vocabulary is the hypothesis lifecycle; later waves extend this enum
 *  (never loosen it). */
export const LEDGER_EVENT_TYPES = Object.freeze([
  'hypothesis.proposed', // a sub-agent puts a new hypothesis on the table
  'hypothesis.scored',   // a sub-agent (re)scores an existing hypothesis
  'hypothesis.retracted',// a sub-agent withdraws a hypothesis (terminal)
]);

// Per-type PAYLOAD schemas. Strict: every property required, additionalProperties:false —
// the exact discipline native LLM structured output enforces, so a generated schema can be
// handed to the host's constrained-decoding API verbatim.
const PAYLOAD_SCHEMAS = Object.freeze({
  'hypothesis.proposed': {
    type: 'object',
    properties: {
      hypothesis_id: { type: 'string', minLength: 1 },
      statement: { type: 'string', minLength: 1 },
      rationale: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['hypothesis_id', 'statement', 'rationale', 'confidence'],
    additionalProperties: false,
  },
  'hypothesis.scored': {
    type: 'object',
    properties: {
      hypothesis_id: { type: 'string', minLength: 1 },
      score: { type: 'number', minimum: 0, maximum: 1 },
      basis: { type: 'string', minLength: 1 },
    },
    required: ['hypothesis_id', 'score', 'basis'],
    additionalProperties: false,
  },
  'hypothesis.retracted': {
    type: 'object',
    properties: {
      hypothesis_id: { type: 'string', minLength: 1 },
      reason: { type: 'string', minLength: 1 },
    },
    required: ['hypothesis_id', 'reason'],
    additionalProperties: false,
  },
});

// The envelope every event wears regardless of type. `source` is the PRODUCER-side provenance
// (which sub-agent said this); the Ledger adds its own ingestion-side provenance on append.
function envelopeSchemaFor(eventTypeSchema) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${EVENT_SCHEMA_VERSION}/ledger-event`,
    type: 'object',
    properties: {
      event_id: { type: 'string', minLength: 1 },
      event_type: eventTypeSchema,
      source: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', minLength: 1 },
          agent_family: { type: 'string', minLength: 1 },
        },
        required: ['agent_id', 'agent_family'],
        additionalProperties: false,
      },
      payload: { type: 'object' }, // refined per-type below; kept loose only in the generic envelope
    },
    required: ['event_id', 'event_type', 'source', 'payload'],
    additionalProperties: false,
  };
}

/**
 * NATIVE LLM SCHEMA GENERATION: emit the self-contained strict JSON Schema for one event type —
 * envelope + that type's exact payload schema, event_type pinned by `const`. The result follows
 * the structured-output discipline (all properties required, additionalProperties:false at every
 * level) so it can be passed directly as a native LLM structured-output / tool-input schema, and
 * it is byte-for-byte the schema `validateEvent` enforces at ingestion. Throws on an unknown type
 * (never generates a permissive schema). Pure; returns a fresh deep object each call.
 *
 * @param {string} eventType — one of LEDGER_EVENT_TYPES
 * @returns {object} a strict JSON Schema
 */
export function generateEventSchema(eventType) {
  const payload = PAYLOAD_SCHEMAS[eventType];
  if (!payload) {
    throw new Error(
      `event-schema: unknown event type ${JSON.stringify(eventType)} — admissible: ${LEDGER_EVENT_TYPES.join(', ')}`
    );
  }
  const schema = envelopeSchemaFor({ const: eventType });
  schema.$id = `${EVENT_SCHEMA_VERSION}/${eventType}`;
  schema.properties.payload = structuredClone(payload);
  return schema;
}

/** Generate the strict envelope schema admitting ANY known event type (event_type as the closed
 *  enum). Used by ingestion as the first-pass gate before the per-type schema is applied. Pure. */
export function generateEnvelopeSchema() {
  return envelopeSchemaFor({ enum: [...LEDGER_EVENT_TYPES] });
}

// --- strict validator (same subset semantics as the test harness's validateShape) --------------
function typeOk(value, t) {
  switch (t) {
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'array': return Array.isArray(value);
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'null': return value === null;
    default: throw new Error(`event-schema: unsupported schema type ${JSON.stringify(t)}`);
  }
}
function describe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function validate(value, schema, path, errors) {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${describe(value)}`);
      return; // type mismatch — deeper checks would be noise
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]`);
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: string length ${value.length} < minLength ${schema.minLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: ${value.length} items < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: ${value.length} items > maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, `${path}[${i}]`, errors));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.required) {
      for (const k of schema.required) if (!(k in value)) errors.push(`${path}: missing required key '${k}'`);
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) if (k in value) validate(value[k], sub, `${path}.${k}`, errors);
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const k of Object.keys(value)) if (!(k in schema.properties)) errors.push(`${path}: unexpected key '${k}'`);
    }
  }
}

/**
 * Validate a raw, untyped event payload against the GENERATED strict schema for its declared type.
 * Two passes: the envelope gate (shape + event_type in the closed enum), then the per-type schema
 * (which re-checks the envelope with event_type pinned and the payload fully typed). Both passes
 * always run when a per-type schema is generable (an object event with a known type), so a single
 * rejection reports EVERY violation — envelope-level and payload-level together — deduplicated.
 * The per-type pass is skipped only when it cannot exist (non-object event or out-of-enum type).
 * Returns an array of error strings — empty array ⇒ the event is admissible. Pure; never throws
 * on data.
 *
 * @param {unknown} raw — the untyped payload as produced by a sub-agent
 * @returns {string[]} errors (empty ⇒ valid)
 */
export function validateEvent(raw) {
  const errors = [];
  validate(raw, generateEnvelopeSchema(), '$', errors);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)
      || !LEDGER_EVENT_TYPES.includes(raw.event_type)) {
    return errors; // no per-type schema exists for this event — the envelope errors are the story
  }
  const perTypeErrors = [];
  validate(raw, generateEventSchema(raw.event_type), '$', perTypeErrors);
  for (const e of perTypeErrors) {
    if (!errors.includes(e)) errors.push(e); // the per-type pass re-checks the envelope — dedupe
  }
  return errors;
}

/** Assert a raw event is admissible; throws with every violation joined on failure. */
export function assertValidEvent(raw) {
  const errors = validateEvent(raw);
  if (errors.length) {
    throw new Error(`ledger-event validation FAILED:\n  - ${errors.join('\n  - ')}`);
  }
}
