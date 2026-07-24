import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanDirectory, isIgnored, runRouter, sizePayloadBytes } from '../runtime/context-sizer.mjs';

function withTmp(fn) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'sizer-test-'));
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

test('isIgnored respects basic patterns', () => {
  const patterns = ['.git/', 'node_modules/', '*.log', 'build/', '/root-only.txt'];
  
  // check directories
  assert.ok(isIgnored('.git', patterns, true));
  assert.ok(isIgnored('.git/config', patterns, false));
  assert.ok(isIgnored('node_modules', patterns, true));
  assert.ok(isIgnored('node_modules/lodash/index.js', patterns, false));
  assert.ok(isIgnored('dist/app.log', patterns, false));
  assert.ok(isIgnored('build/main.js', patterns, false));
  
  // check anchored patterns
  assert.ok(isIgnored('root-only.txt', patterns, false));
  assert.ok(!isIgnored('subdir/root-only.txt', patterns, false));
  
  // check non-ignored files
  assert.ok(!isIgnored('src/index.js', patterns, false));
  assert.ok(!isIgnored('package.json', patterns, false));
});

test('scanDirectory recursively sums bytes and estimates tokens correctly', () => {
  withTmp((dir) => {
    // Create directory structure:
    // /file1.txt (100 bytes)
    // /src/file2.txt (200 bytes)
    // /src/sub/file3.txt (300 bytes)
    // /.git/ignored.txt (500 bytes - should be ignored by default)
    // /node_modules/pkg/index.js (1000 bytes - should be ignored by default)
    
    fs.writeFileSync(join(dir, 'file1.txt'), 'a'.repeat(100), 'utf8');
    
    fs.mkdirSync(join(dir, 'src'));
    fs.writeFileSync(join(dir, 'src', 'file2.txt'), 'b'.repeat(200), 'utf8');
    
    fs.mkdirSync(join(dir, 'src', 'sub'));
    fs.writeFileSync(join(dir, 'src', 'sub', 'file3.txt'), 'c'.repeat(300), 'utf8');
    
    fs.mkdirSync(join(dir, '.git'));
    fs.writeFileSync(join(dir, '.git', 'ignored.txt'), 'x'.repeat(500), 'utf8');
    
    fs.mkdirSync(join(dir, 'node_modules'));
    fs.mkdirSync(join(dir, 'node_modules', 'pkg'));
    fs.writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'y'.repeat(1000), 'utf8');

    const result = scanDirectory(dir);
    
    // Expected: 100 + 200 + 300 = 600 bytes
    // Expected tokens: 600 / 4 = 150 tokens
    assert.equal(result.totalBytes, 600);
    assert.equal(result.tokens, 150);
  });
});

test('scanDirectory respects custom .gitignore patterns', () => {
  withTmp((dir) => {
    fs.writeFileSync(join(dir, 'file1.txt'), 'a'.repeat(100), 'utf8');
    
    fs.mkdirSync(join(dir, 'temp'));
    fs.writeFileSync(join(dir, 'temp', 'file2.txt'), 'b'.repeat(200), 'utf8');
    
    fs.writeFileSync(join(dir, 'app.log'), 'c'.repeat(300), 'utf8');
    
    // Write .gitignore
    // Ignore temp/ directory and all *.log files
    const gitignoreContent = `
# Ignore temp directory
temp/

# Ignore log files
*.log
`;
    fs.writeFileSync(join(dir, '.gitignore'), gitignoreContent, 'utf8');

    const result = scanDirectory(dir);
    
    // Expected: Only file1.txt (100 bytes) + .gitignore (~50 bytes, but let's count it dynamically)
    // The temp/ folder and app.log should be skipped.
    const gitignoreSize = fs.statSync(join(dir, '.gitignore')).size;
    assert.equal(result.totalBytes, 100 + gitignoreSize);
    assert.equal(result.tokens, Math.ceil((100 + gitignoreSize) / 4));
  });
});

test('runRouter dynamic routing behavior', () => {
  withTmp((dir) => {
    // Create a 400-byte file (100 tokens heuristic)
    fs.writeFileSync(join(dir, 'file.txt'), 'a'.repeat(400), 'utf8');

    const testEnv = {
      GANDALF_FRONTIER_MODEL: 'test-frontier-model',
      GANDALF_HIGH_CONTEXT_MODEL: 'test-high-context-model',
    };

    // Case 1: Under threshold (100 tokens <= 150 threshold)
    const res1 = runRouter({
      projectDir: dir,
      env: testEnv,
      overrideMax: 150
    });
    
    assert.equal(res1.tokenHeuristic, 100);
    assert.equal(res1.frontierMax, 150);
    assert.equal(res1.selectedModel, 'test-frontier-model');
    assert.equal(res1.overridden, false);
    assert.equal(testEnv.GEMINI_MODEL, 'test-frontier-model');
    assert.equal(testEnv.TRIO_MODEL, 'test-frontier-model');
    assert.equal(testEnv.GANDALF_ROUTED_MODEL, 'test-frontier-model');

    // Case 2: Exceeds threshold (100 tokens > 50 threshold)
    const res2 = runRouter({
      projectDir: dir,
      env: testEnv,
      overrideMax: 50
    });
    
    assert.equal(res2.tokenHeuristic, 100);
    assert.equal(res2.frontierMax, 50);
    assert.equal(res2.selectedModel, 'test-high-context-model');
    assert.equal(res2.overridden, true);
    assert.equal(testEnv.GEMINI_MODEL, 'test-high-context-model');
    assert.equal(testEnv.TRIO_MODEL, 'test-high-context-model');
    assert.equal(testEnv.GANDALF_ROUTED_MODEL, 'test-high-context-model');
  });
});

test('runRouter sizes the ARTIFACT (tokens estimate), not the whole cwd', () => {
  withTmp((dir) => {
    // The directory is HUGE (4000 bytes ≈ 1000 tokens). If the router sized cwd it would override.
    fs.writeFileSync(join(dir, 'huge.txt'), 'a'.repeat(4000), 'utf8');

    const testEnv = {
      GANDALF_FRONTIER_MODEL: 'frontier-model',
      GANDALF_HIGH_CONTEXT_MODEL: 'high-context-model',
    };

    // A small focused artifact (10 tokens) is passed explicitly; threshold is 150 tokens.
    const res = runRouter({
      projectDir: dir,
      tokens: 10,
      env: testEnv,
      overrideMax: 150,
    });

    // The artifact (10 tokens), NOT the 1000-token cwd, drives the decision: no override.
    assert.equal(res.tokenHeuristic, 10);
    assert.equal(res.overridden, false);
    assert.equal(res.selectedModel, 'frontier-model');
    assert.equal(testEnv.GEMINI_MODEL, 'frontier-model');
  });
});

test('runRouter sizes an in-memory payload artifact rather than cwd', () => {
  withTmp((dir) => {
    fs.writeFileSync(join(dir, 'huge.txt'), 'a'.repeat(4000), 'utf8');

    const testEnv = {
      GANDALF_FRONTIER_MODEL: 'frontier-model',
      GANDALF_HIGH_CONTEXT_MODEL: 'high-context-model',
    };

    const payload = { 'note.md': 'short scoped artifact' }; // ~21 bytes ≈ 6 tokens
    const res = runRouter({ projectDir: dir, payload, env: testEnv, overrideMax: 150 });

    assert.ok(res.tokenHeuristic < 150, 'payload token estimate must be small, not the cwd size');
    assert.equal(res.overridden, false);
    assert.equal(res.selectedModel, 'frontier-model');
  });
});

test('sizePayloadBytes sums payload shapes without scanning disk', () => {
  assert.equal(sizePayloadBytes({ 'a.txt': 'abcd' }), 4);
  assert.equal(sizePayloadBytes([{ path: 'a', content: 'abcd' }]), 4);
  assert.equal(sizePayloadBytes(['hello']), 5);
  assert.equal(sizePayloadBytes('hello'), 5);
});
