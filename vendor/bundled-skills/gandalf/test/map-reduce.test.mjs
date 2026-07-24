import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  calculatePayloadSize,
  estimatePayloadTokens,
  getTopLevelDir,
  groupPayloadByTopLevelDir,
  serializeChunk,
  limitConcurrency,
  runMapReduce
} from '../runtime/map-reduce.mjs';

function withTmp(fn) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'map-reduce-test-'));
  try {
    return fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

test('getTopLevelDir extracts top level directory and prefixes with slash', () => {
  assert.equal(getTopLevelDir('backend/server.js'), '/backend');
  assert.equal(getTopLevelDir('/frontend/src/App.js'), '/frontend');
  assert.equal(getTopLevelDir('package.json'), '/');
  assert.equal(getTopLevelDir('src/components/button.js'), '/src');
  assert.equal(getTopLevelDir('docs/README.md'), '/docs');
  assert.equal(getTopLevelDir(''), '/');
});

test('groupPayloadByTopLevelDir groups array of objects payload correctly', () => {
  const payload = [
    { path: 'backend/server.js', content: 'server code' },
    { path: 'frontend/src/App.js', content: 'react code' },
    { path: 'package.json', content: 'manifest' },
    { path: 'backend/config.json', content: 'config' }
  ];

  const grouped = groupPayloadByTopLevelDir(payload);

  assert.deepEqual(grouped['/backend'], [
    { path: 'backend/server.js', content: 'server code' },
    { path: 'backend/config.json', content: 'config' }
  ]);
  assert.deepEqual(grouped['/frontend'], [
    { path: 'frontend/src/App.js', content: 'react code' }
  ]);
  assert.deepEqual(grouped['/'], [
    { path: 'package.json', content: 'manifest' }
  ]);
});

test('groupPayloadByTopLevelDir groups object dictionary payload correctly', () => {
  const payload = {
    'backend/server.js': 'server code',
    'frontend/src/App.js': 'react code',
    'package.json': 'manifest'
  };

  const grouped = groupPayloadByTopLevelDir(payload);

  assert.deepEqual(grouped['/backend'], {
    'backend/server.js': 'server code'
  });
  assert.deepEqual(grouped['/frontend'], {
    'frontend/src/App.js': 'react code'
  });
  assert.deepEqual(grouped['/'], {
    'package.json': 'manifest'
  });
});

test('groupPayloadByTopLevelDir groups array of strings payload correctly', () => {
  const payload = [
    'backend/server.js',
    'frontend/src/App.js',
    'package.json'
  ];

  const grouped = groupPayloadByTopLevelDir(payload);

  assert.deepEqual(grouped['/backend'], ['backend/server.js']);
  assert.deepEqual(grouped['/frontend'], ['frontend/src/App.js']);
  assert.deepEqual(grouped['/'], ['package.json']);
});

test('limitConcurrency processes tasks with a maximum concurrent limit', async () => {
  let activeTasks = 0;
  let maxConcurrent = 0;

  const makeTask = (delay) => {
    return async () => {
      activeTasks++;
      if (activeTasks > maxConcurrent) {
        maxConcurrent = activeTasks;
      }
      // wait a bit
      await new Promise(resolve => setTimeout(resolve, delay));
      activeTasks--;
      return delay;
    };
  };

  const tasks = [makeTask(20), makeTask(30), makeTask(10), makeTask(20), makeTask(15)];

  const results = await limitConcurrency(tasks, 2);

  assert.deepEqual(results, [20, 30, 10, 20, 15]);
  assert.ok(maxConcurrent <= 2, `Expected max concurrency to be <= 2, got ${maxConcurrent}`);
});

test('runMapReduce executes direct analysis when payload is within High-Context limit', async () => {
  const payload = {
    'src/helper.js': 'console.log("hello");'
  };

  const calls = [];
  const mockAgent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    return 'direct advisory report';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Review helper.js',
    agent: mockAgent,
    highContextLimit: 100 // 100 tokens, payload is ~22 bytes / 4 = 6 tokens
  });

  assert.equal(result, 'direct advisory report');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.label, 'map-reduce-direct');
  assert.ok(calls[0].prompt.includes('Review helper.js'));
  assert.ok(calls[0].prompt.includes('src/helper.js'));
});

test('runMapReduce executes Map-Reduce when payload exceeds High-Context limit', async () => {
  const payload = {
    'backend/server.js': 'app.listen(3000);',
    'frontend/index.js': 'ReactDOM.render();',
    'package.json': '{}'
  };

  const calls = [];
  const mockAgent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of ${opts.label}`;
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'synthesized coherent advisory report';
    }
    return 'default';
  };

  const result = await runMapReduce({
    payload,
    userObjective: 'Check for performance issues',
    agent: mockAgent,
    highContextLimit: 2, // low limit to force map-reduce (payload is ~38 bytes / 4 = 10 tokens)
    concurrencyLimit: 2
  });

  assert.equal(result, 'synthesized coherent advisory report');
  
  // We expect 5 total calls: 1 scout-pass (Wave-4 scout-first default) + 3 chunks
  // (backend, frontend, root) + 1 synthesis. Scout runs FIRST; with this stub it
  // does not prune, so all 3 chunks are still mapped.
  assert.equal(calls.length, 5);

  const scoutCall = calls.find(c => c.opts.label === 'scout-pass');
  assert.ok(scoutCall, 'scout-pass should run before map-reduce when payload exceeds the limit');
  assert.equal(calls[0].opts.label, 'scout-pass', 'scout-pass must be the FIRST call');

  const chunkCalls = calls.filter(c => c.opts.label.startsWith('map-reduce-chunk-'));
  assert.equal(chunkCalls.length, 3);

  const labels = chunkCalls.map(c => c.opts.label).sort();
  assert.deepEqual(labels, [
    'map-reduce-chunk-/',
    'map-reduce-chunk-/backend',
    'map-reduce-chunk-/frontend'
  ]);

  const synthCall = calls.find(c => c.opts.label === 'map-reduce-synthesis');
  assert.ok(synthCall);
  assert.ok(synthCall.prompt.includes('Summary of map-reduce-chunk-/backend'));
  assert.ok(synthCall.prompt.includes('Summary of map-reduce-chunk-/frontend'));
  assert.ok(synthCall.prompt.includes('Summary of map-reduce-chunk-/'));
  assert.ok(synthCall.prompt.includes('Check for performance issues'));
});
