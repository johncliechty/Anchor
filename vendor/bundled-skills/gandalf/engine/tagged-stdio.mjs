// Gandalf Broad-First engine — TAGGED STDIO STREAMS (Wave 2).
//
// Everything a worker writes to stdout/stderr is raw, UNTRUSTED bytes. Before any of it reaches
// an observer (console, log file, orchestrator), the HOST wraps each physical line in a tagged
// record carrying the worker's `worker_trace_id` and the stream it arrived on. The tag is applied
// OUTSIDE the worker process, and the worker's bytes land inside the record as a JSON STRING
// VALUE — so a worker that prints a forged tag (`{"worker_trace_id":"someone-else",...}`) merely
// produces a log LINE whose content is that forgery, still attributed to the real producer. Tag
// impersonation across execution contexts is structurally impossible, not merely discouraged.
//
// The tagged-record wire format (one JSON object per physical line, version-pinned):
//   { v: 'gts1', worker_trace_id, stream: 'stdout'|'stderr', line }
//
// Public surface:
//   TAGGED_STDIO_VERSION                 — the wire-format version id ('gts1')
//   tagLine({worker_trace_id, stream, line})   — build one frozen tagged record
//   serializeTaggedLine(record)          — record → single physical line of JSON (no raw newlines)
//   parseTaggedLine(text)                — strict inverse; → record | null (never throws)
//   createLineSplitter(onLine)           — chunk-safe splitter: {push(chunk), flush()}
//   createTaggedStdioLogger({worker_trace_id, stream, onRecord}) — the worker_trace_id logger:
//       {push(chunk), flush()}; every complete line is emitted as one tagged record
//
// Stdlib-only, no I/O of its own — the caller supplies the sink (`onRecord`).

/** The tagged-stdio wire-format version (gandalf-tagged-stdio v1). */
export const TAGGED_STDIO_VERSION = 'gts1';

const STREAMS = Object.freeze(['stdout', 'stderr']);

/**
 * Build one tagged record for a single physical line of worker output. The line is stored as an
 * opaque string value — never parsed, never trusted. Frozen so a record in flight cannot be
 * re-attributed. Throws on a malformed tag request (host-side bug), never on line content (data).
 */
export function tagLine({ worker_trace_id, stream, line }) {
  if (typeof worker_trace_id !== 'string' || worker_trace_id.length === 0) {
    throw new Error('tagged-stdio: worker_trace_id must be a non-empty string');
  }
  if (!STREAMS.includes(stream)) {
    throw new Error(`tagged-stdio: stream must be one of ${STREAMS.join('|')}, got ${JSON.stringify(stream)}`);
  }
  if (typeof line !== 'string') {
    throw new Error('tagged-stdio: line must be a string');
  }
  return Object.freeze({ v: TAGGED_STDIO_VERSION, worker_trace_id, stream, line });
}

/** Serialize a tagged record to exactly one physical line. JSON.stringify escapes every control
 *  character in the payload, so worker bytes can never break out of the record into a second
 *  physical line (no log-forging via embedded newlines). */
export function serializeTaggedLine(record) {
  return JSON.stringify(record);
}

/**
 * Strict inverse of serializeTaggedLine: parse one physical line back into a tagged record.
 * Returns null on ANYTHING that is not exactly a well-formed v1 tagged record (bad JSON, wrong
 * version, wrong types, missing or extra keys). Never throws — untrusted input is data.
 */
export function parseTaggedLine(text) {
  if (typeof text !== 'string') return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'line,stream,v,worker_trace_id') return null;
  if (value.v !== TAGGED_STDIO_VERSION) return null;
  if (typeof value.worker_trace_id !== 'string' || value.worker_trace_id.length === 0) return null;
  if (!STREAMS.includes(value.stream)) return null;
  if (typeof value.line !== 'string') return null;
  return Object.freeze({ v: value.v, worker_trace_id: value.worker_trace_id, stream: value.stream, line: value.line });
}

/**
 * A chunk-safe line splitter for a byte stream. Chunks may split lines anywhere — including
 * mid-multibyte-character — so buffering is done on BYTES (Buffer.concat) and each complete line
 * is decoded as UTF-8 only once it is whole. Accepts string or Buffer chunks. `\r\n` and `\n`
 * both terminate a line (the `\r` is stripped); `flush()` emits any trailing partial line.
 *
 * @param {(line: string) => void} onLine
 * @returns {{push: (chunk: string|Buffer) => void, flush: () => void}}
 */
export function createLineSplitter(onLine) {
  let leftover = Buffer.alloc(0);

  function emit(buf) {
    const line = buf.toString('utf8');
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
  }

  function push(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    leftover = leftover.length === 0 ? incoming : Buffer.concat([leftover, incoming]);
    let nl;
    while ((nl = leftover.indexOf(0x0a)) !== -1) {
      emit(leftover.subarray(0, nl));
      leftover = leftover.subarray(nl + 1);
    }
  }

  function flush() {
    if (leftover.length > 0) {
      emit(leftover);
      leftover = Buffer.alloc(0);
    }
  }

  return { push, flush };
}

/**
 * THE `worker_trace_id` LOGGER: wire a worker's stdout or stderr into tagged records. Feed it raw
 * chunks as they arrive; every complete physical line is emitted to `onRecord` as one frozen
 * tagged record carrying the worker's trace id and stream name. Call `flush()` after the stream
 * ends so a final unterminated line is not lost.
 *
 * @param {{worker_trace_id: string, stream: 'stdout'|'stderr', onRecord: (record: object) => void}} opts
 * @returns {{push: (chunk: string|Buffer) => void, flush: () => void}}
 */
export function createTaggedStdioLogger({ worker_trace_id, stream, onRecord }) {
  if (typeof onRecord !== 'function') {
    throw new Error('tagged-stdio: onRecord must be a function');
  }
  tagLine({ worker_trace_id, stream, line: '' }); // fail fast on a bad tag config, before any data flows
  return createLineSplitter((line) => onRecord(tagLine({ worker_trace_id, stream, line })));
}
