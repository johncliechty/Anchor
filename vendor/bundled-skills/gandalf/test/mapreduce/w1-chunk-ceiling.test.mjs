import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runMapReduce,
  serializeChunk,
  GANDALF_MAX_CHUNK_BYTES
} from '../../runtime/map-reduce.mjs';

async function withTmp(fn) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'map-reduce-scale-test-'));
  try {
    await fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

test('GANDALF_MAX_CHUNK_BYTES has a committed default', () => {
  assert.ok(typeof GANDALF_MAX_CHUNK_BYTES === 'number');
  assert.ok(GANDALF_MAX_CHUNK_BYTES > 0);
});

test('given a synthetic fat flat directory, payload is split recursively so no map payload exceeds GANDALF_MAX_CHUNK_BYTES', async () => {
  const payload = {
    'huge.txt': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10',
    'small1.txt': 'small data 1',
    'small2.txt': 'small data 2',
    'small3.txt': 'small data 3'
  };

  const recordedPayloads = [];
  const mockAgent = async (prompt, opts) => {
    recordedPayloads.push({ prompt, label: opts.label });
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk: ${opts.label}`;
    }
    if (opts.label.startsWith('map-reduce-synth-')) {
      return `Synthesized: ${opts.label}`;
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Final Synthesized Coherent Report';
    }
    return 'response';
  };

  const maxChunkBytes = 150;
  const result = await runMapReduce({
    payload,
    userObjective: 'Summarize the files',
    agent: mockAgent,
    env: { GANDALF_MAX_CHUNK_BYTES: String(maxChunkBytes) },
    highContextLimit: 1
  });

  assert.equal(result, 'Final Synthesized Coherent Report');

  const chunkCalls = recordedPayloads.filter(c => c.label.startsWith('map-reduce-chunk-'));
  assert.ok(chunkCalls.length > 0, 'Expected at least one map call');

  for (const call of chunkCalls) {
    const startIdx = call.prompt.indexOf('Codebase Chunk Files:\n');
    assert.ok(startIdx !== -1);
    const content = call.prompt.substring(startIdx + 'Codebase Chunk Files:\n'.length);
    const serializedSize = Buffer.byteLength(content.trim());
    assert.ok(
      serializedSize <= maxChunkBytes,
      `Expected serialized size ${serializedSize} to be <= max ${maxChunkBytes}`
    );
  }
});

test('given a single file larger than the ceiling, it is split at line boundaries into sub-chunks each <= ceiling', async () => {
  const fileContent = 'line1_data_here\nline2_more_data\nline3_even_more_data\nline4_yet_more';
  const payload = {
    'huge.txt': fileContent
  };

  const recordedPayloads = [];
  const mockAgent = async (prompt, opts) => {
    recordedPayloads.push({ prompt, label: opts.label });
    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk: ${opts.label}`;
    }
    if (opts.label.startsWith('map-reduce-synth-')) {
      return `Synthesized: ${opts.label}`;
    }
    if (opts.label === 'map-reduce-synthesis') {
      return 'Final Synthesized Coherent Report';
    }
    return 'response';
  };

  const maxChunkBytes = 75;
  const result = await runMapReduce({
    payload,
    userObjective: 'Summarize huge.txt',
    agent: mockAgent,
    env: { GANDALF_MAX_CHUNK_BYTES: String(maxChunkBytes) },
    highContextLimit: 1
  });

  assert.equal(result, 'Final Synthesized Coherent Report');

  const chunkCalls = recordedPayloads.filter(c => c.label.startsWith('map-reduce-chunk-'));
  assert.ok(chunkCalls.length > 0);

  const receivedContents = [];
  for (const call of chunkCalls) {
    const startIdx = call.prompt.indexOf('Codebase Chunk Files:\n');
    assert.ok(startIdx !== -1);
    const content = call.prompt.substring(startIdx + 'Codebase Chunk Files:\n'.length);
    const serializedSize = Buffer.byteLength(content.trim());
    assert.ok(
      serializedSize <= maxChunkBytes,
      `Expected size ${serializedSize} <= max ${maxChunkBytes}`
    );

    const match = content.match(/```\r?\n([\s\S]*?)\r?\n```/);
    assert.ok(match, 'Expected content to be fenced in triple backticks');
    receivedContents.push(match[1]);
  }

  const reassembled = receivedContents.join('\n');
  assert.equal(reassembled, fileContent, 'Reassembled content should match original file content');
});

test('given a payload with file path string, it resolves and reads content from disk to split if needed', async () => {
  await withTmp(async (dir) => {
    const fileContent = 'line1_on_disk\nline2_on_disk\nline3_on_disk';
    const filePath = 'file.txt';
    fs.writeFileSync(join(dir, filePath), fileContent, 'utf8');

    const payload = [filePath];

    const recordedPayloads = [];
    const mockAgent = async (prompt, opts) => {
      recordedPayloads.push({ prompt, label: opts.label });
      return 'response';
    };

    const maxChunkBytes = 60;
    await runMapReduce({
      projectDir: dir,
      payload,
      userObjective: 'Test disk read split',
      agent: mockAgent,
      env: { GANDALF_MAX_CHUNK_BYTES: String(maxChunkBytes) },
      highContextLimit: 1
    });

    const chunkCalls = recordedPayloads.filter(c => c.label.startsWith('map-reduce-chunk-'));
    assert.ok(chunkCalls.length > 0);

    const receivedContents = [];
    for (const call of chunkCalls) {
      const match = call.prompt.match(/```\r?\n([\s\S]*?)\r?\n```/);
      assert.ok(match);
      receivedContents.push(match[1]);
    }

    const reassembled = receivedContents.map(c => c.replace(/\r/g, '')).join('\n');
    assert.equal(reassembled, fileContent);
  });
});
