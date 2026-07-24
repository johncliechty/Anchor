// Gandalf Broad-First engine — ISOLATED EXECUTION CONTEXTS (Wave 2).
//
// TRUE out-of-process isolation: every sub-agent execution context is a separate OS process with
// its own memory, its own (allowlisted) environment, and no channel to its siblings except bytes
// on stdio — which the host tags, sanitizes, and schema-gates before anything becomes data. This
// is the mechanism behind structural orthogonality: a worker cannot inject prompts, state, or
// identity into another context because there is no shared context to inject into, and every
// byte it emits crosses the Wave 2 boundary gauntlet under ITS OWN host-assigned identity.
//
// What `runIsolatedWorker` enforces:
//   ISOLATION  — a fresh child process (no shell), stdin closed, environment reduced to a fixed
//                OS-hygiene allowlist. NODE_OPTIONS / NODE_* are deliberately dropped (they are
//                code-injection vectors into the child), and none of the parent's other variables
//                leak in. The only additions are the worker's own GANDALF_* trace identity.
//   LINEAGE    — the host derives the worker's UUID lineage (engine/trace-lineage.mjs) and hands
//                it down via environment; the worker never chooses its own identity.
//   TAGGED IO  — every stdout/stderr line is wrapped in a tagged record carrying the worker's
//                trace id (engine/tagged-stdio.mjs); forged tags in worker output stay data.
//   IPC        — stdout lines prefixed with IPC_MESSAGE_PREFIX are IPC messages; each payload
//                runs the full deserialization gauntlet (engine/ipc-middleware.mjs), with the
//                channel pinned to `expectedSourceAgentId` when given. Accepted events land in
//                `messages`; everything rejected lands in `rejected` with its reasons.
//                stderr is NEVER an IPC channel — logs only.
//   TIMEOUT    — a strict, configuration-driven OS-level signal timeout: `timeoutMs` is REQUIRED
//                (no default, no infinity — a missing timeout is a configuration error, not a
//                permission to stall). On expiry the host sends SIGTERM; if the worker is still
//                alive after `killGraceMs` it is SIGKILLed. On Windows, SIGTERM already maps to
//                an unconditional TerminateProcess, so escalation simply never fires there.
//
// Public surface:
//   IPC_MESSAGE_PREFIX      — the stdout IPC channel marker ('GLE-IPC1:')
//   ENV_ALLOWLIST           — the frozen OS-hygiene environment allowlist
//   runIsolatedWorker(opts) — spawn one isolated context and resolve with its full transcript
//
// Stdlib-only (node:child_process); composes the other Wave 2 modules, never reimplements them.

import { spawn } from 'node:child_process';
import { createRootLineage, deriveChildLineage } from './trace-lineage.mjs';
import { createTaggedStdioLogger } from './tagged-stdio.mjs';
import { deserializeIpcMessage } from './ipc-middleware.mjs';

/** The stdout IPC channel marker (gandalf-ledger-event IPC v1). A line `GLE-IPC1:<payload>`
 *  routes `<payload>` through the deserialization middleware; every other line is a log. */
export const IPC_MESSAGE_PREFIX = 'GLE-IPC1:';

/** The ONLY parent environment variables a worker may inherit — pure OS hygiene (path resolution,
 *  temp dirs, locale). Everything else, NODE_OPTIONS and friends included, is dropped: a worker's
 *  environment is part of its isolation boundary. Matched case-insensitively (Windows env). */
export const ENV_ALLOWLIST = Object.freeze([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL',
]);

function buildWorkerEnv(lineage, extraEnv) {
  const allowed = new Set(ENV_ALLOWLIST);
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (allowed.has(k.toUpperCase())) env[k] = v;
  }
  for (const [k, v] of Object.entries(extraEnv)) {
    if (/^GANDALF_/i.test(k)) {
      throw new Error(`isolated-worker: extraEnv must not set reserved GANDALF_* variables (got ${JSON.stringify(k)})`);
    }
    if (/^NODE_/i.test(k)) {
      throw new Error(`isolated-worker: extraEnv must not set NODE_* variables — they are code-injection vectors into the child (got ${JSON.stringify(k)})`);
    }
    if (typeof v !== 'string') {
      throw new Error(`isolated-worker: extraEnv values must be strings (${JSON.stringify(k)})`);
    }
    env[k] = v;
  }
  // The worker's host-assigned trace identity — handed DOWN, never chosen by the worker.
  env.GANDALF_WORKER_TRACE_ID = lineage.trace_id;
  if (lineage.parent_trace_id !== null) env.GANDALF_PARENT_TRACE_ID = lineage.parent_trace_id;
  env.GANDALF_LINEAGE_PATH = lineage.path.join('>');
  return env;
}

/**
 * Spawn ONE isolated execution context and run it to completion (or to its OS-level timeout).
 *
 * @param {{
 *   code: string,                        — the worker's JavaScript source (run via `node -e`)
 *   timeoutMs: number,                   — REQUIRED strict wall-clock budget before SIGTERM
 *   killGraceMs?: number,                — SIGTERM→SIGKILL escalation grace (default 2000)
 *   parentLineage?: object|null,         — derive the worker's lineage from this parent (else root)
 *   expectedSourceAgentId?: string|null, — pin the IPC channel to this agent identity
 *   maxBytes?: number,                   — per-message IPC byte cap (middleware default if omitted)
 *   env?: Record<string, string>,        — extra worker env (GANDALF_* and NODE_* names rejected)
 * }} opts
 * @returns {Promise<{
 *   worker_trace_id: string, lineage: object,
 *   exitCode: number|null, signal: string|null,
 *   timedOut: boolean, signals_sent: string[],
 *   taggedLines: object[],               — every stdout/stderr log line as a tagged record
 *   messages: Array<{event: object}>,    — IPC payloads that PASSED the full gauntlet
 *   rejected: Array<{raw: string, errors: string[]}> — IPC payloads that were quarantined
 * }>}
 */
export function runIsolatedWorker(opts) {
  const {
    code,
    timeoutMs,
    killGraceMs = 2000,
    parentLineage = null,
    expectedSourceAgentId = null,
    maxBytes,
    env: extraEnv = {},
  } = opts ?? {};

  if (typeof code !== 'string' || code.length === 0) {
    throw new Error('isolated-worker: code must be a non-empty string of worker JavaScript');
  }
  // STRICT, CONFIGURATION-DRIVEN: no default, no zero, no Infinity — a worker without a real
  // timeout is a stall waiting to happen, and that is a configuration error, not a runtime one.
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`isolated-worker: timeoutMs is required and must be a positive finite number, got ${JSON.stringify(timeoutMs)}`);
  }
  if (typeof killGraceMs !== 'number' || !Number.isFinite(killGraceMs) || killGraceMs <= 0) {
    throw new Error(`isolated-worker: killGraceMs must be a positive finite number, got ${JSON.stringify(killGraceMs)}`);
  }

  const lineage = parentLineage === null ? createRootLineage() : deriveChildLineage(parentLineage);
  const env = buildWorkerEnv(lineage, extraEnv); // validate config BEFORE spawning anything

  return new Promise((resolve, reject) => {
    const taggedLines = [];
    const messages = [];
    const rejected = [];
    const signals_sent = [];
    let timedOut = false;

    const child = spawn(process.execPath, ['-e', code], {
      stdio: ['ignore', 'pipe', 'pipe'], // stdin closed: the worker gets NOTHING in, only bytes out
      env,
      shell: false,
      windowsHide: true,
    });

    const onRecord = (record) => taggedLines.push(record);
    // stdout carries BOTH logs and the IPC channel; the prefix decides, the middleware judges.
    const stdoutLogger = createTaggedStdioLogger({
      worker_trace_id: lineage.trace_id,
      stream: 'stdout',
      onRecord: (record) => {
        if (record.line.startsWith(IPC_MESSAGE_PREFIX)) {
          const raw = record.line.slice(IPC_MESSAGE_PREFIX.length);
          const result = deserializeIpcMessage(raw, { maxBytes, expectedSourceAgentId });
          if (result.ok) messages.push({ event: result.event });
          else rejected.push({ raw, errors: result.errors });
        } else {
          onRecord(record);
        }
      },
    });
    // stderr is logs ONLY — never an IPC channel, no matter what a worker prints there.
    const stderrLogger = createTaggedStdioLogger({
      worker_trace_id: lineage.trace_id,
      stream: 'stderr',
      onRecord,
    });
    child.stdout.on('data', (chunk) => stdoutLogger.push(chunk));
    child.stderr.on('data', (chunk) => stderrLogger.push(chunk));

    // OS-LEVEL SIGNAL TIMEOUT: SIGTERM at the budget, SIGKILL after the grace. Real signals to a
    // real process — a stalled worker dies whether or not its JavaScript ever yields again.
    let killTimer = null;
    const termTimer = setTimeout(() => {
      timedOut = true;
      signals_sent.push('SIGTERM');
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        signals_sent.push('SIGKILL');
        child.kill('SIGKILL');
      }, killGraceMs);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(termTimer);
      if (killTimer !== null) clearTimeout(killTimer);
      reject(err);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(termTimer);
      if (killTimer !== null) clearTimeout(killTimer);
      stdoutLogger.flush();
      stderrLogger.flush();
      resolve({
        worker_trace_id: lineage.trace_id,
        lineage,
        exitCode,
        signal,
        timedOut,
        signals_sent,
        taggedLines,
        messages,
        rejected,
      });
    });
  });
}
