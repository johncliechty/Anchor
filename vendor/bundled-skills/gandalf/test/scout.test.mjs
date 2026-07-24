import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateTreeText,
  isPathIncluded,
  prunePayload,
  runScoutPass,
  scoutAndFilter
} from '../runtime/scout.mjs';

// Helper to create a temporary directory for testing and clean it up afterwards
function withTmp(fn) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'scout-test-'));
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

test('generateTreeText generates a deterministic indented tree respecting gitignores', () => {
  withTmp((dir) => {
    // Create directory structure:
    // /file-b.txt
    // /file-a.txt
    // /src/index.js
    // /src/utils/helper.js
    // /node_modules/ignored.js (ignored by default)
    // /temp/file.txt (ignored by custom gitignore)

    fs.writeFileSync(join(dir, 'file-b.txt'), 'content b', 'utf8');
    fs.writeFileSync(join(dir, 'file-a.txt'), 'content a', 'utf8');
    
    fs.mkdirSync(join(dir, 'src'));
    fs.writeFileSync(join(dir, 'src', 'index.js'), 'index content', 'utf8');
    
    fs.mkdirSync(join(dir, 'src', 'utils'));
    fs.writeFileSync(join(dir, 'src', 'utils', 'helper.js'), 'helper content', 'utf8');
    
    fs.mkdirSync(join(dir, 'node_modules'));
    fs.writeFileSync(join(dir, 'node_modules', 'ignored.js'), 'ignored content', 'utf8');

    fs.mkdirSync(join(dir, 'temp'));
    fs.writeFileSync(join(dir, 'temp', 'file.txt'), 'temp content', 'utf8');

    // Create .gitignore
    const gitignoreContent = `
# Ignore temp directory
temp/
`;
    fs.writeFileSync(join(dir, '.gitignore'), gitignoreContent, 'utf8');

    const tree = generateTreeText(dir);
    const lines = tree.split('\n');

    // Sort order:
    // .gitignore
    // file-a.txt
    // file-b.txt
    // src/
    //   index.js
    //   utils/
    //     helper.js
    // Note node_modules and temp should be excluded.
    
    const expected = [
      '.gitignore',
      'file-a.txt',
      'file-b.txt',
      'src/',
      '  index.js',
      '  utils/',
      '    helper.js'
    ];

    assert.deepEqual(lines, expected);
  });
});

test('isPathIncluded handles exact and prefix directory matches correctly', () => {
  const includeList = ['src/', 'package.json', 'config/config.json', 'docs'];

  // Exact file matches
  assert.ok(isPathIncluded('package.json', includeList));
  assert.ok(isPathIncluded('config/config.json', includeList));

  // Directory prefix matches (both with/without trailing slash in include list)
  assert.ok(isPathIncluded('src/index.js', includeList));
  assert.ok(isPathIncluded('src/components/button.js', includeList));
  assert.ok(isPathIncluded('docs/README.md', includeList));
  assert.ok(isPathIncluded('docs/api/endpoints.json', includeList));

  // Non-matching files
  assert.ok(!isPathIncluded('README.md', includeList));
  assert.ok(!isPathIncluded('src-other/index.js', includeList));
  assert.ok(!isPathIncluded('config/other.json', includeList));
});

test('prunePayload filters array of file objects correctly', () => {
  const payload = [
    { path: 'src/index.js', content: 'import ...' },
    { path: 'src/utils.js', content: 'export ...' },
    { path: 'package.json', content: '{}' },
    { path: 'README.md', content: '# Readme' }
  ];
  const includeList = ['src/'];

  const pruned = prunePayload(payload, includeList);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0].path, 'src/index.js');
  assert.equal(pruned[1].path, 'src/utils.js');
});

test('prunePayload filters array of string paths correctly', () => {
  const payload = ['src/index.js', 'src/utils.js', 'package.json', 'README.md'];
  const includeList = ['package.json'];

  const pruned = prunePayload(payload, includeList);
  assert.deepEqual(pruned, ['package.json']);
});

test('prunePayload filters dictionary object payload correctly', () => {
  const payload = {
    'src/index.js': 'import ...',
    'src/utils.js': 'export ...',
    'package.json': '{}',
    'README.md': '# Readme'
  };
  const includeList = ['src/', 'package.json'];

  const pruned = prunePayload(payload, includeList);
  assert.deepEqual(pruned, {
    'src/index.js': 'import ...',
    'src/utils.js': 'export ...',
    'package.json': '{}'
  });
});

test('runScoutPass calls mock agent and returns include list', async () => {
  withTmp(async (dir) => {
    fs.writeFileSync(join(dir, 'file.txt'), 'test', 'utf8');

    const mockAgent = async (prompt, opts) => {
      assert.ok(prompt.includes('User Objective:'));
      assert.ok(prompt.includes('file.txt'));
      assert.deepEqual(opts.schema.required, ['include']);
      return { include: ['file.txt'] };
    };

    const includeList = await runScoutPass({
      projectDir: dir,
      userObjective: 'Find file.txt',
      agent: mockAgent
    });

    assert.deepEqual(includeList, ['file.txt']);
  });
});

test('runScoutPass gracefully returns null on malformed response or throwing API failure', async () => {
  withTmp(async (dir) => {
    fs.writeFileSync(join(dir, 'file.txt'), 'test', 'utf8');

    // Case 1: Malformed JSON response
    const mockAgentMalformed = async () => {
      return { malformed: 'no-include' };
    };

    const res1 = await runScoutPass({
      projectDir: dir,
      userObjective: 'Find file.txt',
      agent: mockAgentMalformed
    });
    assert.equal(res1, null);

    // Case 2: Throwing API failure
    const mockAgentThrow = async () => {
      throw new Error('API connection lost');
    };

    const res2 = await runScoutPass({
      projectDir: dir,
      userObjective: 'Find file.txt',
      agent: mockAgentThrow
    });
    assert.equal(res2, null);
  });
});

test('scoutAndFilter successfully filters payload when scout succeeds', async () => {
  withTmp(async (dir) => {
    fs.writeFileSync(join(dir, 'file.txt'), 'test', 'utf8');

    const payload = {
      'file.txt': 'test content',
      'ignored.txt': 'ignored content'
    };

    const mockAgent = async () => {
      return { include: ['file.txt'] };
    };

    const filtered = await scoutAndFilter({
      projectDir: dir,
      payload,
      userObjective: 'Need file.txt only',
      agent: mockAgent
    });

    assert.deepEqual(filtered, { 'file.txt': 'test content' });
  });
});

test('scoutAndFilter falls back to full payload when scout fails', async () => {
  withTmp(async (dir) => {
    fs.writeFileSync(join(dir, 'file.txt'), 'test', 'utf8');

    const payload = {
      'file.txt': 'test content',
      'ignored.txt': 'ignored content'
    };

    const mockAgentThrow = async () => {
      throw new Error('Failed to reach LLM');
    };

    const filtered = await scoutAndFilter({
      projectDir: dir,
      payload,
      userObjective: 'Need file.txt only',
      agent: mockAgentThrow
    });

    // Falls back to unfiltered payload
    assert.deepEqual(filtered, payload);
  });
});
