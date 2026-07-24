import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { runMapReduce } from '../../runtime/map-reduce.mjs';
import { getGitignorePatterns, isIgnored } from '../../runtime/context-sizer.mjs';

// Get the repo root directory <path> Foundry
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');

// Helper to recursively scan repo files respecting gitignores
function getRepoFiles(projectDir) {
  const patterns = getGitignorePatterns(projectDir);
  const files = [];

  function traverse(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const relPath = path.relative(projectDir, fullPath);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (isIgnored(relPath, patterns, true)) {
          continue;
        }
        traverse(fullPath);
      } else if (stat.isFile()) {
        if (isIgnored(relPath, patterns, false)) {
          continue;
        }
        files.push(relPath);
      }
    }
  }

  traverse(projectDir);
  return files;
}

// Helper to count active sub-agent processes (agy or claude)
function countSubagentProcesses() {
  try {
    if (process.platform === 'win32') {
      const command = 'powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*claude*\' -or $_.CommandLine -like \'*agy*\' } | Measure-Object | Select-Object -ExpandProperty Count"';
      const stdout = execSync(command, { encoding: 'utf8' });
      const count = parseInt(stdout.trim(), 10);
      return isNaN(count) ? 0 : count;
    } else {
      const command = 'ps aux | grep -E "claude|agy" | grep -v grep | wc -l';
      const stdout = execSync(command, { encoding: 'utf8' });
      const count = parseInt(stdout.trim(), 10);
      return isNaN(count) ? 0 : count;
    }
  } catch (err) {
    return 0;
  }
}

test('Wave 5 Acceptance: summarize Skill-Foundry root dir end-to-end', async () => {
  // 1. Take process count before run
  const preCount = countSubagentProcesses();

  // 2. Track peak RSS
  let peakRss = 0;
  const rssTracker = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) {
      peakRss = rss;
    }
  }, 5);

  // 3. Scan the repository to build payload
  const payload = getRepoFiles(repoRoot);
  assert.ok(payload.length > 0, 'Payload must not be empty');

  // Verify that there are some files inside skills/gandalf/runtime and some files outside
  const runtimeFiles = payload.filter(f => f.replace(/\\/g, '/').startsWith('skills/gandalf/runtime/'));
  assert.ok(runtimeFiles.length > 0, 'Expected some runtime files');
  assert.ok(payload.length > runtimeFiles.length, 'Expected some files outside runtime directory');

  // 4. Set up mock agent to handle deterministic scout and chunking
  const recordedCalls = [];
  const mockAgent = async (prompt, opts) => {
    recordedCalls.push({ prompt, label: opts.label });

    if (opts.label === 'scout-pass') {
      // Return include list matching only gandalf runtime files (drops other files)
      return { include: ['skills/gandalf/runtime/'] };
    }

    if (opts.label.startsWith('map-reduce-chunk-')) {
      return `Summary of chunk: ${opts.label}`;
    }

    if (opts.label.startsWith('map-reduce-synth-')) {
      return `Synthesized chunk: ${opts.label}`;
    }

    if (opts.label === 'map-reduce-synthesis') {
      return 'Coherent synthesis report of Skill Foundry';
    }

    return 'mock response';
  };

  // 5. Run Map-Reduce end-to-end
  const maxChunkBytes = 10000; // Small size to force recursive splitting of runtime files (e.g. map-reduce.mjs)
  const highContextLimit = 1;  // Force Map-Reduce by setting context limit to 1 token

  const result = await runMapReduce({
    projectDir: repoRoot,
    payload,
    userObjective: 'Summarize the Skill-Foundry root directory',
    agent: mockAgent,
    env: {
      GANDALF_MAX_CHUNK_BYTES: String(maxChunkBytes),
      GANDALF_MAX_CONCURRENCY: '3'
    },
    highContextLimit,
    concurrencyLimit: 3
  });

  // Clean up RSS tracker
  clearInterval(rssTracker);
  const finalRss = process.memoryUsage().rss;
  if (finalRss > peakRss) {
    peakRss = finalRss;
  }

  // 6. Assertions on Result
  assert.ok(result, 'Result should not be empty');
  assert.equal(result.degraded, true, 'Result should be degraded');
  assert.ok(result.stamp, 'Result must have a stamp');
  assert.ok(result.stamp.startsWith('analyzed slice '), 'Stamp should start with "analyzed slice"');
  assert.ok(result.includes('[degraded:true]'), 'Advisory report must contain degradation flag');
  assert.ok(result.includes(result.stamp), 'Advisory report must contain degradation stamp');

  // 7. Verify Process Census
  const postCount = countSubagentProcesses();
  assert.equal(postCount, preCount, `Post-run process census (${postCount}) should equal pre-run process census (${preCount})`);

  // 8. Verify Peak RSS stayed under configured memory ceiling
  const maxRssCeiling = parseInt(process.env.GANDALF_MAX_RSS || '524288000', 10); // Default 500MB
  assert.ok(peakRss < maxRssCeiling, `Peak RSS (${peakRss} bytes) should be below ceiling (${maxRssCeiling} bytes)`);
});
