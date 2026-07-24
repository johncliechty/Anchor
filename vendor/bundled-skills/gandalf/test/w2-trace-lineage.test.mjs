// Gandalf Broad-First engine — Wave 2 suite: UUID LINEAGE TRACING.
// Proves the out-of-process half of provenance: every execution context's trace identity is a
// strict v4 UUID, child identities are DERIVED from their parent's (root→self path continuity),
// lineages are frozen value objects that cannot be re-ancestored in flight, and a malformed
// lineage is rejected with every violation named — a broken chain never silently extends.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newTraceId,
  isTraceId,
  createRootLineage,
  deriveChildLineage,
  validateLineage,
  assertValidLineage,
} from '../engine/trace-lineage.mjs';

test('newTraceId mints strict v4 UUIDs, unique across calls', () => {
  const ids = Array.from({ length: 50 }, () => newTraceId());
  for (const id of ids) assert.equal(isTraceId(id), true, `${id} must be a v4 UUID`);
  assert.equal(new Set(ids).size, ids.length, 'trace ids must not collide');
});

test('isTraceId is strict: rejects non-strings, close-but-wrong shapes, and uppercase', () => {
  const good = newTraceId();
  assert.equal(isTraceId(good), true);
  for (const bad of [
    null, undefined, 42, {}, '',
    'not-a-uuid',
    good.toUpperCase(),                 // strict lowercase only — exactly what newTraceId mints
    good.replace('-', ''),              // structure matters
    good.slice(0, 14) + '1' + good.slice(15), // version nibble must be 4
  ]) {
    assert.equal(isTraceId(bad), false, `must reject ${JSON.stringify(bad)}`);
  }
});

test('a root lineage has no parent and a single-entry path ending in itself', () => {
  const root = createRootLineage();
  assert.equal(isTraceId(root.trace_id), true);
  assert.equal(root.parent_trace_id, null);
  assert.deepEqual(root.path, [root.trace_id]);
  assert.deepEqual(validateLineage(root), []);
});

test('a child lineage extends the parent path; a grandchild carries the full root→self chain', () => {
  const root = createRootLineage();
  const child = deriveChildLineage(root);
  const grandchild = deriveChildLineage(child);

  assert.equal(child.parent_trace_id, root.trace_id);
  assert.deepEqual(child.path, [root.trace_id, child.trace_id]);
  assert.equal(grandchild.parent_trace_id, child.trace_id);
  assert.deepEqual(grandchild.path, [root.trace_id, child.trace_id, grandchild.trace_id]);
  assert.deepEqual(validateLineage(grandchild), []);
});

test('two children of one parent get DISTINCT identities sharing the parent prefix', () => {
  const root = createRootLineage();
  const a = deriveChildLineage(root);
  const b = deriveChildLineage(root);
  assert.notEqual(a.trace_id, b.trace_id, 'sibling contexts must never share an identity');
  assert.deepEqual(a.path.slice(0, -1), b.path.slice(0, -1), 'siblings share exactly the ancestry prefix');
});

test('lineages are frozen — ancestry cannot be rewritten in flight', () => {
  const child = deriveChildLineage(createRootLineage());
  assert.equal(Object.isFrozen(child), true);
  assert.equal(Object.isFrozen(child.path), true);
  assert.throws(() => { 'use strict'; child.parent_trace_id = newTraceId(); });
  assert.throws(() => { 'use strict'; child.path.push(newTraceId()); });
});

test('validateLineage names every violation: bad UUIDs, broken continuity, cycles', () => {
  assert.deepEqual(validateLineage(null).length, 1);
  assert.deepEqual(validateLineage('root').length, 1);

  const root = createRootLineage();
  const child = deriveChildLineage(root);

  const badId = { ...child, path: [...child.path], trace_id: 'nope' };
  assert.ok(validateLineage(badId).some((e) => /trace_id: not a v4 UUID/.test(e)));

  const brokenTail = { ...child, path: [root.trace_id, newTraceId()] };
  assert.ok(validateLineage(brokenTail).some((e) => /last entry must be trace_id/.test(e)));

  const brokenParent = { ...child, parent_trace_id: newTraceId() };
  assert.ok(validateLineage(brokenParent).some((e) => /second-to-last entry must be parent_trace_id/.test(e)));

  const fatRoot = { ...root, path: [newTraceId(), root.trace_id] };
  assert.ok(validateLineage(fatRoot).some((e) => /root lineage must have a single-entry path/.test(e)));

  const cyclic = {
    trace_id: root.trace_id,
    parent_trace_id: root.trace_id,
    path: [root.trace_id, root.trace_id],
  };
  assert.ok(validateLineage(cyclic).some((e) => /acyclic/.test(e)));
});

test('deriveChildLineage refuses a malformed parent — a broken chain never silently extends', () => {
  assert.throws(() => deriveChildLineage({ trace_id: 'nope', parent_trace_id: null, path: ['nope'] }),
    /trace-lineage validation FAILED/);
  assert.throws(() => assertValidLineage({}), /trace-lineage validation FAILED/);
});
