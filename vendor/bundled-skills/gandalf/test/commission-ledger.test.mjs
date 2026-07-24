// Gandalf advisor — Wave W2a: the unforgeable commission-id LEDGER + the provenance ENVELOPE
// extension + the (inert) commission-verifier INJECTION SEAM.
//
// W2a builds the MECHANISM only — it does NOT yet change the runtime stamp derivation (that is W2b).
// So every assertion here is ADDITIVE: the ledger mints/resolves, the envelope carries three new
// cross-family fields, and the injection seam defaults to a no-op that leaves today's behavior
// byte-identical. (The 182-test Increment-1 gate stays green independently of this file.)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMISSION_ID_PREFIX,
  canonicalCommissionTuple,
  createCommissionLedger,
  mintCommission,
  resolveCommission,
} from '../seam/commission-ledger.mjs';
import {
  composeRefutationProvenance,
  computeResultDigest,
  vetElevationRefutation,
  NOOP_COMMISSION_VERIFIER,
  REFUTATION_PROVENANCE_KIND,
} from '../seam/refute.mjs';
import { applySeamPass } from '../runtime/seam-pass.mjs';
import { validateShape } from './harness.mjs';
import { emptyConformantOutput, elevationRefutedHonest } from './fixtures.mjs';

const TUPLE = Object.freeze({
  drafter_family: 'fable-5',
  refuter_family: 'gemini',
  result_digest: 'a'.repeat(64),
});

// === the ledger: mint → resolve round-trip ================================================
test('commission-ledger: a minted id resolves to its exact tuple', () => {
  const led = createCommissionLedger({ secret: 'run-secret-A' });
  const id = led.mintCommission(TUPLE);
  assert.equal(typeof id, 'string');
  assert.ok(id.startsWith(`${COMMISSION_ID_PREFIX}.`), 'the id carries the versioned prefix');
  assert.ok(led.isMinted(id), 'the ledger records the minted id');
  const resolved = led.resolveCommission(id);
  assert.deepEqual(resolved, {
    drafter_family: 'fable-5',
    refuter_family: 'gemini',
    result_digest: 'a'.repeat(64),
  });
});

test('commission-ledger: mint is content-bound regardless of caller key order (canonical tuple)', () => {
  const led = createCommissionLedger({ secret: 's' });
  const id1 = led.mintCommission({ drafter_family: 'fable-5', refuter_family: 'gemini', result_digest: 'b'.repeat(64) });
  const id2 = led.mintCommission({ result_digest: 'b'.repeat(64), refuter_family: 'gemini', drafter_family: 'fable-5' });
  assert.equal(id1, id2, 'the id is a function of the canonical tuple, not the caller key order');
  // canonicalCommissionTuple normalizes key order to a single stable serialization.
  assert.equal(
    canonicalCommissionTuple({ result_digest: 'b'.repeat(64), refuter_family: 'gemini', drafter_family: 'fable-5' }),
    canonicalCommissionTuple({ drafter_family: 'fable-5', refuter_family: 'gemini', result_digest: 'b'.repeat(64) }),
    'the canonical serialization is independent of caller key order'
  );
});

// === a forged / random id resolves to null ================================================
test('commission-ledger: a forged / random id resolves to null (never authentic)', () => {
  const led = createCommissionLedger({ secret: 'run-secret-A' });
  led.mintCommission(TUPLE); // ledger is non-empty, but none of these were minted
  for (const forged of [
    'gcl1.deadbeef.cafef00d',
    'not-even-close',
    `${COMMISSION_ID_PREFIX}.only-two-parts`,
    '',
    'gcl1..',
  ]) {
    assert.equal(led.resolveCommission(forged), null, `forged id ${JSON.stringify(forged)} must resolve to null`);
  }
  // Non-string inputs never throw, always null.
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.equal(led.resolveCommission(bad), null);
  }
});

// === a tampered tuple (different digest) fails ============================================
test('commission-ledger: a TAMPERED tuple (swapped result_digest) fails the content-binding', () => {
  const led = createCommissionLedger({ secret: 'run-secret-A' });
  const id = led.mintCommission(TUPLE);
  const [prefix, payloadB64, mac] = id.split('.');
  // Decode the bound tuple, swap ONLY the result_digest, re-encode — keep the original signature.
  const tuple = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  tuple.result_digest = 'c'.repeat(64); // tamper
  const tamperedPayload = Buffer.from(JSON.stringify(tuple), 'utf8').toString('base64url');
  const tamperedId = `${prefix}.${tamperedPayload}.${mac}`;
  assert.equal(led.resolveCommission(tamperedId), null, 'a tampered tuple no longer re-derives the signature — null');
  // Corrupting the signature itself likewise fails.
  const badMac = mac.slice(0, -1) + (mac.endsWith('0') ? '1' : '0');
  assert.equal(led.resolveCommission(`${prefix}.${payloadB64}.${badMac}`), null, 'a corrupted signature resolves to null');
  // The untouched, genuinely-minted id still resolves (proves the tamper — not the harness — caused the null).
  assert.ok(led.resolveCommission(id), 'the authentic id still resolves');
});

// === cross-ledger / cross-run isolation ==================================================
test('commission-ledger: an id minted by another ledger (different secret/run) resolves to null', () => {
  const ledA = createCommissionLedger({ secret: 'secret-A' });
  const ledB = createCommissionLedger({ secret: 'secret-B' });
  const idA = ledA.mintCommission(TUPLE);
  assert.equal(ledB.resolveCommission(idA), null, 'a foreign secret cannot resolve ledger A\'s id');
  assert.ok(ledA.resolveCommission(idA), 'its own ledger still resolves it');
  // Even a SAME-secret sibling ledger rejects it: resolve requires minted-THIS-run membership.
  const ledA2 = createCommissionLedger({ secret: 'secret-A' });
  assert.equal(ledA2.resolveCommission(idA), null, 'same secret but not minted here ⇒ null (orchestrator-minted-this-run)');
});

test('commission-ledger: mintCommission rejects a malformed tuple (never mints a forgeable id)', () => {
  const led = createCommissionLedger({ secret: 's' });
  assert.throws(() => led.mintCommission({ drafter_family: '', refuter_family: 'g', result_digest: 'x' }), /non-empty/);
  assert.throws(() => led.mintCommission({ drafter_family: 'f', refuter_family: 'g' }), /non-empty/);
  assert.throws(() => led.mintCommission(), /non-empty/);
});

test('commission-ledger: the module-default ledger round-trips within the process', () => {
  const id = mintCommission(TUPLE);
  assert.deepEqual(resolveCommission(id), {
    drafter_family: 'fable-5',
    refuter_family: 'gemini',
    result_digest: 'a'.repeat(64),
  });
  assert.equal(resolveCommission('gcl1.forged.forged'), null);
});

// === the envelope extension: 3 new cross-family fields ====================================
test('composeRefutationProvenance: additively carries drafter_family, refuter_family, result_digest', () => {
  const prov = composeRefutationProvenance({
    defeater: 'A replay benchmark showing the last acked write is lost on a mid-flush crash.',
    survived: true,
    verdict: 'survived the independent refutation',
    drafter_family: 'fable-5',
    refuter_family: 'gemini',
  });
  assert.equal(prov.kind, REFUTATION_PROVENANCE_KIND);
  assert.equal(prov.drafter_family, 'fable-5');
  assert.equal(prov.refuter_family, 'gemini');
  assert.match(prov.result_digest, /^[0-9a-f]{64}$/, 'result_digest is a SHA-256 hex digest');
  // W2b: `independent` is no longer self-stamped on the envelope — cross-family independence is
  // DERIVED at the vet seam against the ledger (isCrossFamilyRefutation), never asserted at mint.
  assert.equal(prov.independent, undefined, 'independence is derived, not self-stamped');
  assert.equal(prov.survived, true);
  assert.equal(prov.refuter_commission_id, null, 'commission_id still defaults to null (honor-system until W2b)');
  // Omitting the families defaults them to null — purely additive, never throws.
  const bare = composeRefutationProvenance({ defeater: 'A concrete falsifying observation on workload W.' });
  assert.equal(bare.drafter_family, null);
  assert.equal(bare.refuter_family, null);
  assert.match(bare.result_digest, /^[0-9a-f]{64}$/);
});

test('computeResultDigest: stable for identical content, differs when the refutation content changes', () => {
  const a = computeResultDigest({ defeater: '  a defeater  ', survived: true, verdict: 'v' });
  const b = computeResultDigest({ defeater: 'a defeater', survived: true, verdict: 'v' });
  assert.equal(a, b, 'the defeater is trimmed/canonicalized ⇒ same digest');
  assert.notEqual(a, computeResultDigest({ defeater: 'a defeater', survived: false, verdict: 'v' }), 'verdict flip changes the digest');
  assert.notEqual(a, computeResultDigest({ defeater: 'a DIFFERENT defeater', survived: true, verdict: 'v' }), 'defeater change changes the digest');
});

test('W2a end-to-end: a refutation envelope mints a resolvable, content-bound commission-id', () => {
  const led = createCommissionLedger({ secret: 'e2e' });
  const prov = composeRefutationProvenance({
    defeater: 'A crash-injection test showing the last acked write is lost on replay.',
    survived: true,
    drafter_family: 'fable-5',
    refuter_family: 'gemini',
  });
  const id = led.mintCommission({
    drafter_family: prov.drafter_family,
    refuter_family: prov.refuter_family,
    result_digest: prov.result_digest,
  });
  const resolved = led.resolveCommission(id);
  assert.equal(resolved.result_digest, prov.result_digest, 'the id is bound to the envelope\'s result_digest');
  assert.equal(resolved.drafter_family, 'fable-5');
  assert.equal(resolved.refuter_family, 'gemini');
});

// === the injection seam defaults to a no-op (today's behavior unchanged) ===================
test('injection seam: NOOP_COMMISSION_VERIFIER resolves nothing (the inert W2a default)', () => {
  assert.equal(NOOP_COMMISSION_VERIFIER('anything'), null);
  assert.equal(NOOP_COMMISSION_VERIFIER(), null);
});

test('injection seam: vetElevationRefutation ignores an injected verifier in W2a (byte-identical verdict)', () => {
  const led = createCommissionLedger({ secret: 's' });
  const base = vetElevationRefutation(elevationRefutedHonest());
  const withNoop = vetElevationRefutation(elevationRefutedHonest(), {});
  const withResolver = vetElevationRefutation(elevationRefutedHonest(), { resolveCommission: led.resolveCommission });
  // A resolver that would REJECT everything must STILL not change the W2a verdict (the gate is W2b).
  const withRejecting = vetElevationRefutation(elevationRefutedHonest(), { resolveCommission: () => null });
  assert.deepEqual(withNoop, base, 'passing {} is identical to passing nothing');
  assert.deepEqual(withResolver, base, 'an injected resolver does not change the W2a verdict');
  assert.deepEqual(withRejecting, base, 'even an all-rejecting resolver is inert in W2a');
  assert.equal(base.tier, 'PROMISING', 'the honestly-refuted elevation keeps its tier');
});

test('injection seam: applySeamPass output is identical with or without an injected resolveCommission', () => {
  const rawDraft = {
    reasoning: 'a deep-think read',
    verdict: 'this is mostly sound',
    findings: [],
    nitpicks: [],
    elevations: [
      {
        id: 'e-1',
        value_if_true: 'high',
        rung: 'CLAIMED',
        reasoning: 'a forward suggestion',
        verdict: 'worth doing',
        what_would_refute_it: 'A benchmark on workload W showing no measurable improvement.',
      },
    ],
  };
  const without = applySeamPass(rawDraft);
  const withResolver = applySeamPass(rawDraft, { resolveCommission: () => ({ drafter_family: 'x', refuter_family: 'y', result_digest: 'z' }) });
  assert.deepEqual(withResolver, without, 'the injected verifier is inert in W2a — output is byte-identical');
});

// === the schema still validates an elevation carrying the extended provenance ==============
test('schema: an elevation whose refutation_provenance carries the 3 new fields is shape-conformant', () => {
  const out = emptyConformantOutput();
  out.elevations.push({
    id: 'e-ext',
    tier: 'PROMISING',
    value_if_true: 'high',
    rung: 'CLAIMED',
    reasoning: 'a frame that survived an independent cross-family refuter',
    verdict: 'promising',
    what_would_refute_it: 'A replay benchmark showing the WAL loses the last acked write.',
    refutation_provenance: composeRefutationProvenance({
      defeater: 'A replay benchmark showing the WAL loses the last acked write.',
      survived: true,
      drafter_family: 'fable-5',
      refuter_family: 'gemini',
    }),
  });
  assert.deepEqual(validateShape(out), [], 'the extended provenance fields are allowed (additive schema)');
});
