import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMapReduce } from '../../runtime/map-reduce.mjs';

test('given a repo over limits, scoutAndFilter is called before map-reduce and prunes content, stamping degraded:true', async () => {
  const payload = {
    'src/index.js': 'console.log("index");',
    'src/utils.js': 'console.log("utils");',
    'backend/server.js': 'console.log("server");',
    'package.json': '{}'
  };

  const recordedCalls = [];
  const mockAgent = async (prompt, opts) => {
    recordedCalls.push({ prompt, opts });
    if (opts.label === 'scout-pass') {
      return { include: ['src/'] }; // Only include src/ folder files (index.js, utils.js)
    }
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk ${opts.label}`;
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Coherent synthesis report';
    }
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Review the source code',
    agent: mockAgent,
    env: {},
    highContextLimit: 1, // force map-reduce/scouting
    concurrencyLimit: 2
  });

  // Verify call order: scout-pass must be first!
  assert.ok(recordedCalls.length > 0, 'Should have recorded agent calls');
  assert.equal(recordedCalls[0].opts.label, 'scout-pass', 'Scout pass must run first');

  // Verify map calls: only mapped src/ files
  const mapCalls = recordedCalls.filter(c => c.opts.label.startsWith('map-reduce-chunk-'));
  // Since we grouped by top-level dir, the pruned payload contains 'src/index.js' and 'src/utils.js'.
  // This forms one group '/src'. So there should be exactly 1 map call for '/src'.
  assert.equal(mapCalls.length, 1);
  assert.equal(mapCalls[0].opts.label, 'map-reduce-chunk-/src');
  assert.ok(mapCalls[0].prompt.includes('src/index.js'));
  assert.ok(mapCalls[0].prompt.includes('src/utils.js'));
  assert.ok(!mapCalls[0].prompt.includes('backend/server.js'));

  // Verify degraded stamp and properties
  assert.equal(result.degraded, true);
  assert.equal(result.stamp, 'analyzed slice 2 of 4; skipped 2');
  assert.ok(result.includes('analyzed slice 2 of 4; skipped 2'));
  assert.ok(result.includes('[degraded:true]'));
});

test('given a run that drops nothing, degraded is false/undefined and no stamp is attached', async () => {
  const payload = {
    'src/index.js': 'console.log("index");'
  };

  const recordedCalls = [];
  const mockAgent = async (prompt, opts) => {
    recordedCalls.push({ prompt, opts });
    if (opts.label === 'scout-pass') {
      return { include: ['src/'] }; // Matches index.js, so nothing is dropped
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Synthesis report';
    }
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk ${opts.label}`;
    }
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Review code',
    agent: mockAgent,
    env: {},
    highContextLimit: 1, // force map-reduce/scouting
  });

  assert.ok(recordedCalls.some(c => c.opts.label === 'scout-pass'));
  assert.ok(!result.degraded, 'degraded should not be true');
  assert.ok(!result.includes('degraded:true'), 'report should not have degraded stamp');
});

test('scout graceful fallback to full payload when scouting fails', async () => {
  const payload = {
    'src/index.js': 'console.log("index");',
    'backend/server.js': 'console.log("server");'
  };

  const recordedCalls = [];
  const mockAgent = async (prompt, opts) => {
    recordedCalls.push({ prompt, opts });
    if (opts.label === 'scout-pass') {
      throw new Error('Scout model failed');
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Synthesis report';
    }
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk ${opts.label}`;
    }
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Review code',
    agent: mockAgent,
    env: {},
    highContextLimit: 1,
  });

  // Verify it mapped both chunks (full payload fallback)
  const mapCalls = recordedCalls.filter(c => c.opts.label.startsWith('map-reduce-chunk-'));
  assert.equal(mapCalls.length, 2);

  assert.ok(!result.degraded);
  assert.ok(!result.includes('degraded:true'));
});

test('bypasses scouting when GANDALF_SKIP_SCOUT or GANDALF_FORCE_WHOLE_REPO is set', async () => {
  const payload = {
    'src/index.js': 'console.log("index");',
    'backend/server.js': 'console.log("server");'
  };

  const recordedCalls = [];
  const mockAgent = async (prompt, opts) => {
    recordedCalls.push({ prompt, opts });
    if (opts.label === 'scout-pass') {
      return { include: ['src/'] };
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Synthesis report';
    }
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk ${opts.label}`;
    }
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Review code',
    agent: mockAgent,
    env: { GANDALF_SKIP_SCOUT: 'true' },
    highContextLimit: 1,
  });

  // Verify scout-pass was NOT called
  assert.ok(!recordedCalls.some(c => c.opts.label === 'scout-pass'), 'Scout pass should be bypassed');

  // Verify both chunks mapped
  const mapCalls = recordedCalls.filter(c => c.opts.label.startsWith('map-reduce-chunk-'));
  assert.equal(mapCalls.length, 2);
  assert.ok(!result.degraded);
});
