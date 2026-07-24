import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import {
  limitConcurrency,
  acquireSlot,
  releaseSlot
} from '../../runtime/map-reduce.mjs';

async function withTmp(fn) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'map-reduce-lock-test-'));
  try {
    await fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

test('given GANDALF_MAX_CONCURRENCY = N and N+2 tasks requesting slot concurrently, high-water mark never exceeds N and all complete', async () => {
  await withTmp(async (lockDir) => {
    const originalEnv = process.env.GANDALF_LOCK_DIR;
    const originalConcurrency = process.env.GANDALF_MAX_CONCURRENCY;

    const N = 3;
    process.env.GANDALF_LOCK_DIR = lockDir;
    process.env.GANDALF_MAX_CONCURRENCY = String(N);

    try {
      let activeTasks = 0;
      let maxActiveTasks = 0;
      let completedCount = 0;

      const makeTask = (id, delay) => {
        return async () => {
          activeTasks++;
          if (activeTasks > maxActiveTasks) {
            maxActiveTasks = activeTasks;
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          activeTasks--;
          completedCount++;
          return id;
        };
      };

      const tasks = [
        makeTask(1, 20),
        makeTask(2, 30),
        makeTask(3, 10),
        makeTask(4, 25),
        makeTask(5, 15)
      ];

      const results = await limitConcurrency(tasks);

      assert.equal(completedCount, 5, 'All N+2 tasks should complete');
      assert.deepEqual(results.sort(), [1, 2, 3, 4, 5], 'Results should match all task completions');
      assert.ok(maxActiveTasks <= N, `High-water mark of simultaneously active tasks (${maxActiveTasks}) should not exceed N (${N})`);

      // Verify that all locks were cleaned up and no directories remain in lockDir
      const remainingSlots = fs.readdirSync(lockDir);
      assert.equal(remainingSlots.length, 0, 'All slot lock directories should be deleted');
    } finally {
      if (originalEnv === undefined) delete process.env.GANDALF_LOCK_DIR;
      else process.env.GANDALF_LOCK_DIR = originalEnv;

      if (originalConcurrency === undefined) delete process.env.GANDALF_MAX_CONCURRENCY;
      else process.env.GANDALF_MAX_CONCURRENCY = originalConcurrency;
    }
  });
});

test('no slot leak on error when tasks fail', async () => {
  await withTmp(async (lockDir) => {
    const originalEnv = process.env.GANDALF_LOCK_DIR;
    const originalConcurrency = process.env.GANDALF_MAX_CONCURRENCY;

    const N = 2;
    process.env.GANDALF_LOCK_DIR = lockDir;
    process.env.GANDALF_MAX_CONCURRENCY = String(N);

    try {
      const makeSuccessfulTask = (id) => async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return id;
      };

      const makeFailingTask = () => async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Task failed');
      };

      const tasks = [
        makeSuccessfulTask(1),
        makeFailingTask(),
        makeSuccessfulTask(2)
      ];

      // Since limitConcurrency aborts on error, it should reject.
      await assert.rejects(async () => {
        await limitConcurrency(tasks);
      }, /Task failed/);

      // Give a tiny moment for any cleanup to settle if async
      await new Promise(resolve => setTimeout(resolve, 20));

      // Assert that there are no slot lock directories left (i.e. no slot leak)
      const remainingSlots = fs.readdirSync(lockDir);
      assert.equal(remainingSlots.length, 0, 'No slot lock directories should leak on error');
    } finally {
      if (originalEnv === undefined) delete process.env.GANDALF_LOCK_DIR;
      else process.env.GANDALF_LOCK_DIR = originalEnv;

      if (originalConcurrency === undefined) delete process.env.GANDALF_MAX_CONCURRENCY;
      else process.env.GANDALF_MAX_CONCURRENCY = originalConcurrency;
    }
  });
});

test('given the cross-process lock-dir, when two independent handles contend for the slot, exactly one acquires it and the other waits', async () => {
  await withTmp(async (lockDir) => {
    const N = 1; // Only 1 slot available
    
    // Acquire slot 0 in handle A
    const slotA = await acquireSlot(lockDir, N);
    assert.equal(slotA, 0, 'Handle A should acquire the first slot');

    let handleBAcquired = false;
    let handleBFinished = false;

    // Start handle B which tries to acquire slot 0 (blocks)
    const handleBPromise = (async () => {
      const slotB = await acquireSlot(lockDir, N);
      handleBAcquired = true;
      assert.equal(slotB, 0, 'Handle B should eventually acquire slot 0');
      releaseSlot(lockDir, slotB);
      handleBFinished = true;
    })();

    // Wait a short duration to ensure handle B has had a chance to try and block
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(handleBAcquired, false, 'Handle B should be blocked because slot 0 is held by Handle A');

    // Release slot 0 from handle A
    releaseSlot(lockDir, slotA);

    // Wait for handle B to complete
    await handleBPromise;
    assert.equal(handleBAcquired, true, 'Handle B should have acquired the slot after release');
    assert.equal(handleBFinished, true, 'Handle B should successfully run and release');
  });
});

test('given the cross-process lock-dir, when two independent processes contend for the last slot, exactly one acquires it and the other waits', async () => {
  await withTmp(async (lockDir) => {
    const N = 1; // Only 1 slot
    
    // Process A: acquire slot in this process
    const slotA = await acquireSlot(lockDir, N);
    assert.equal(slotA, 0, 'Process A should acquire the slot');

    // Process B: spawn a separate process to contend
    let childOutput = '';

    const child = spawn(process.execPath, [
      '--input-type=module',
      '-e',
      `
        import { acquireSlot, releaseSlot } from './runtime/map-reduce.mjs';

        const lockDir = process.env.GANDALF_LOCK_DIR;
        const N = parseInt(process.env.GANDALF_MAX_CONCURRENCY, 10);

        (async () => {
          console.log('TRYING');
          const slot = await acquireSlot(lockDir, N);
          console.log('ACQUIRED');
          setTimeout(() => {
            releaseSlot(lockDir, slot);
            console.log('RELEASED');
          }, 50);
        })().catch(err => {
          console.error(err);
          process.exit(1);
        });
      `
    ], {
      env: {
        ...process.env,
        GANDALF_LOCK_DIR: lockDir,
        GANDALF_MAX_CONCURRENCY: String(N)
      },
      cwd: process.cwd()
    });

    child.stdout.on('data', (data) => {
      childOutput += data.toString();
    });

    child.stderr.on('data', (data) => {
      childOutput += '\nSTDERR: ' + data.toString();
    });

    // Wait for the child to print 'TRYING' (meaning it has started and is attempting to acquire the slot)
    let tries = 0;
    while (!childOutput.includes('TRYING') && tries < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      tries++;
    }

    // Give the child a brief moment to execute acquireSlot and block
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify child has not acquired the slot yet (childOutput does not have ACQUIRED)
    assert.ok(!childOutput.includes('ACQUIRED'), 'Child process should be blocked');

    // Release Process A's slot
    releaseSlot(lockDir, slotA);

    // Wait for child process to finish
    await new Promise((resolve) => {
      child.on('close', resolve);
    });

    assert.ok(childOutput.includes('ACQUIRED'), 'Child process should eventually acquire the slot');
    assert.ok(childOutput.includes('RELEASED'), 'Child process should release the slot');
  });
});
