// Gandalf Broad-First engine — Wave 2 suite: TAGGED STDIO STREAMS (the worker_trace_id logger).
// Proves strict observability at the process boundary: every physical line a worker emits is
// wrapped host-side in a version-pinned record carrying the REAL worker_trace_id and stream;
// chunk boundaries (mid-line, mid-multibyte-character, \r\n) never corrupt lines; serialization
// can never leak a second physical line; and a worker printing a FORGED tag produces only a log
// line whose CONTENT is the forgery — tag impersonation is structurally impossible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAGGED_STDIO_VERSION,
  tagLine,
  serializeTaggedLine,
  parseTaggedLine,
  createLineSplitter,
  createTaggedStdioLogger,
} from '../engine/tagged-stdio.mjs';

const WTID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('every emitted record carries the worker_trace_id, the stream, and the exact line', () => {
  const records = [];
  const logger = createTaggedStdioLogger({ worker_trace_id: WTID, stream: 'stdout', onRecord: (r) => records.push(r) });
  logger.push('hello\nworld\n');
  logger.flush();

  assert.deepEqual(records, [
    { v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdout', line: 'hello' },
    { v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdout', line: 'world' },
  ]);
  assert.equal(Object.isFrozen(records[0]), true, 'a record in flight cannot be re-attributed');
});

test('chunk boundaries never corrupt lines: mid-line splits, \\r\\n, and a flushed trailing partial', () => {
  const lines = [];
  const splitter = createLineSplitter((l) => lines.push(l));
  splitter.push('first li');
  splitter.push('ne\r\nsecond');
  splitter.push(' line\ntrailing partial');
  splitter.flush();
  assert.deepEqual(lines, ['first line', 'second line', 'trailing partial']);
});

test('a multibyte character split across chunk boundaries decodes intact (byte-level buffering)', () => {
  const lines = [];
  const splitter = createLineSplitter((l) => lines.push(l));
  const bytes = Buffer.from('naïve—line\n', 'utf8');
  splitter.push(bytes.subarray(0, 4)); // cuts inside the two-byte 'ï'
  splitter.push(bytes.subarray(4));
  assert.deepEqual(lines, ['naïve—line']);
});

test('serializeTaggedLine emits exactly ONE physical line even when the payload holds newlines/escapes', () => {
  const record = tagLine({ worker_trace_id: WTID, stream: 'stderr', line: 'evil\npayload\r\u001b[31mred' });
  const wire = serializeTaggedLine(record);
  assert.equal(wire.includes('\n'), false, 'worker bytes must never break out into a second line');
  assert.equal(wire.includes('\r'), false);
  assert.deepEqual(parseTaggedLine(wire), record, 'the escape round-trips losslessly');
});

test('IMPERSONATION IS STRUCTURAL: a forged tag printed by a worker stays data under the real tag', () => {
  const forged = JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: 'forged-honest-worker', stream: 'stdout', line: 'I am someone else' });
  const records = [];
  const logger = createTaggedStdioLogger({ worker_trace_id: WTID, stream: 'stdout', onRecord: (r) => records.push(r) });
  logger.push(forged + '\n');

  assert.equal(records.length, 1);
  assert.equal(records[0].worker_trace_id, WTID, 'attribution comes from the host, never from worker bytes');
  assert.equal(records[0].line, forged, 'the forgery is preserved verbatim — as content');

  // Even after a serialize/parse round-trip, the outer (real) attribution is what parses.
  const reparsed = parseTaggedLine(serializeTaggedLine(records[0]));
  assert.equal(reparsed.worker_trace_id, WTID);
  assert.equal(reparsed.line, forged);
});

test('parseTaggedLine is strict: bad JSON, wrong version, extra/missing keys, wrong types → null', () => {
  const good = serializeTaggedLine(tagLine({ worker_trace_id: WTID, stream: 'stdout', line: 'x' }));
  assert.notEqual(parseTaggedLine(good), null);
  for (const bad of [
    'not json',
    '[]',
    'null',
    JSON.stringify({ v: 'gts0', worker_trace_id: WTID, stream: 'stdout', line: 'x' }),
    JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdout' }),
    JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdout', line: 'x', extra: 1 }),
    JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: '', stream: 'stdout', line: 'x' }),
    JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdio', line: 'x' }),
    JSON.stringify({ v: TAGGED_STDIO_VERSION, worker_trace_id: WTID, stream: 'stdout', line: 42 }),
  ]) {
    assert.equal(parseTaggedLine(bad), null, `must reject ${bad}`);
  }
});

test('tagLine fails fast on host-side misconfiguration (bad trace id, stream, or line type)', () => {
  assert.throws(() => tagLine({ worker_trace_id: '', stream: 'stdout', line: 'x' }), /worker_trace_id/);
  assert.throws(() => tagLine({ worker_trace_id: WTID, stream: 'stdio', line: 'x' }), /stream/);
  assert.throws(() => tagLine({ worker_trace_id: WTID, stream: 'stdout', line: 42 }), /line/);
  assert.throws(() => createTaggedStdioLogger({ worker_trace_id: '', stream: 'stdout', onRecord: () => {} }),
    /worker_trace_id/, 'the logger validates its tag config BEFORE any data flows');
  assert.throws(() => createTaggedStdioLogger({ worker_trace_id: WTID, stream: 'stdout' }), /onRecord/);
});
