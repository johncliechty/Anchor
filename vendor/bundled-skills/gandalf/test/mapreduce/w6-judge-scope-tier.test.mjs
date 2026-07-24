import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideTier,
  looksLikeWholeRepo,
  runMapReduce,
  GANDALF_REPO_FILE_THRESHOLD,
} from '../../runtime/map-reduce.mjs';

/** Build an object-dictionary payload of `n` small files under src/. */
function makeRepoPayload(n, bytesPerFile = 200) {
  const payload = {};
  for (let i = 0; i < n; i++) {
    payload[`src/file${i}.js`] = 'x'.repeat(bytesPerFile);
  }
  return payload;
}

test('decideTier DEFAULTS to "direct" for a small, focused payload', () => {
  const payload = { 'src/helper.js': 'console.log("hello");' };
  const tier = decideTier({
    payload,
    objective: 'Why does helper.js log on import?',
    env: {},
  });
  assert.equal(tier, 'direct');
});

test('decideTier stays "direct" even with default (large) limits when payload is tiny', () => {
  // No explicit limit → default 100k tokens / 500k bytes ceiling. A tiny payload must NOT escalate.
  const payload = { 'a.js': 'const a = 1;', 'b.js': 'const b = 2;' };
  assert.equal(decideTier({ payload, env: {} }), 'direct');
});

test('looksLikeWholeRepo flips above the file threshold', () => {
  assert.equal(looksLikeWholeRepo(makeRepoPayload(GANDALF_REPO_FILE_THRESHOLD)), false);
  assert.equal(looksLikeWholeRepo(makeRepoPayload(GANDALF_REPO_FILE_THRESHOLD + 1)), true);
});

test('WHOLE-REPO GUARD: a whole-repo payload + focused question stays "scout" WITHOUT opt-in', () => {
  const payload = makeRepoPayload(60); // > threshold, exceeds a tight limit
  const tier = decideTier({
    payload,
    objective: 'Where is the auth middleware defined?',
    env: {},
    highContextLimit: 1, // force "exceeds limits"
  });
  // Must NOT jump to map-reduce: scout-first to curate.
  assert.equal(tier, 'scout');
});

test('WHOLE-REPO GUARD: explicit opt-in + scout bypass is required to reach "mapreduce"', () => {
  const payload = makeRepoPayload(60);
  const tier = decideTier({
    payload,
    objective: 'Audit the whole repo',
    env: { GANDALF_ALLOW_REPO_SCALE: '1', GANDALF_FORCE_WHOLE_REPO: 'true' },
    highContextLimit: 1,
  });
  assert.equal(tier, 'mapreduce');
});

test('runMapReduce does NOT fan out a whole repo on a focused question without opt-in', async () => {
  const payload = makeRepoPayload(60);

  const calls = [];
  const mockAgent = async (prompt, opts) => {
    calls.push({ prompt, label: opts.label });
    if (opts.label === 'scout-pass') {
      // Scout fails to curate (includes everything) → payload stays whole-repo scale.
      return { include: ['src/'] };
    }
    if (opts.label.startsWith('map-reduce-chunk-')) return `Summary ${opts.label}`;
    if (opts.label === 'map-reduce-synthesis') return 'synth';
    return 'direct degraded report';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Where is the auth middleware?',
    agent: mockAgent,
    env: {}, // no GANDALF_ALLOW_REPO_SCALE
    highContextLimit: 1, // force escalation
    concurrencyLimit: 2,
  });

  // No Map-Reduce fan-out happened.
  const fanout = calls.filter(c => c.label.startsWith('map-reduce-chunk-') || c.label === 'map-reduce-synthesis');
  assert.equal(fanout.length, 0, 'whole-repo fan-out must be gated without opt-in');

  // Instead, a bounded, honestly-degraded direct pass ran.
  assert.ok(calls.some(c => c.label === 'map-reduce-direct'), 'a degraded direct pass should run');
  assert.equal(result.degraded, true);
  assert.ok(result.stamp.includes('GANDALF_ALLOW_REPO_SCALE=1'), 'stamp should name the opt-in flag');
  assert.ok(result.includes('[degraded:true]'));
});

test('runMapReduce DOES fan out a whole repo when GANDALF_ALLOW_REPO_SCALE=1', async () => {
  const payload = makeRepoPayload(60);

  const calls = [];
  const mockAgent = async (prompt, opts) => {
    calls.push({ prompt, label: opts.label });
    if (opts.label === 'scout-pass') return { include: ['src/'] };
    if (opts.label.startsWith('map-reduce-chunk-')) return `Summary ${opts.label}`;
    if (opts.label.startsWith('map-reduce-synth-')) return `Synth ${opts.label}`;
    if (opts.label === 'map-reduce-synthesis') return 'final synthesis';
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Audit the entire repository',
    agent: mockAgent,
    env: { GANDALF_ALLOW_REPO_SCALE: '1' },
    highContextLimit: 1,
    concurrencyLimit: 3,
  });

  const fanout = calls.filter(c => c.label.startsWith('map-reduce-chunk-'));
  assert.ok(fanout.length > 0, 'opt-in should allow the Map-Reduce fan-out');
  assert.equal(result.toString().includes('final synthesis') || result === 'final synthesis', true);
});
