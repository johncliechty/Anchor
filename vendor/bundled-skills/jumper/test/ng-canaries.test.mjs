// test/ng-canaries.test.mjs — P2 2026-07-25: the North Star's NG-1/NG-2/NG-4 as
// EXECUTABLE canaries against the real engine (canaries/canary-set.v2.json documents
// them; the v1 file was the untouched template with zero jumper canaries). Hermetic:
// the same label-keyed mock shape as portfolio.test.js; pinned families so host
// prefs cannot leak in.
process.env.CODING_FAMILY = 'claude';
process.env.REVIEW_FAMILY = 'gemini';

import test from 'node:test';
import assert from 'node:assert';
import { Jumper, runGandalf } from '../index.js';

function makeMock({ sameDomain = false, preStamped = false } = {}) {
  const counts = {};
  const mock = async (opts) => {
    const label = opts.label;
    counts[label] = (counts[label] || 0) + 1;
    switch (label) {
      case 'GandalfDraft': return {
        reasoning: 'r', verdict: 'v', findings: [], nitpicks: [],
        // NG-2 bait when preStamped: the drafter SELF-ASSIGNS the top tier + cross_model.
        elevations: preStamped ? [{ reasoning: 'adopt pattern X', tier: 'GROUNDED', cross_model: true }] : [],
      };
      case 'Synthesizer': return { analysis: 'a', steeringFlags: [] };
      case 'PetersonQuery': return {
        anomalousData: ['x'],
        scamperAnalysis: { substitute: 's', combine: 'c', adapt: 'a', modify: 'm', putToOtherUse: 'p', eliminate: 'e', reverse: 'r' },
        coreContradictions: [{ description: 'd', conflictingDemands: 'cd' }],
      };
      case 'HesseGlassBead': return {
        foreignDomain: sameDomain ? 'music theory' : `domain-${counts[label]}`,
        analogyReasoning: 'ar',
        structuralMapping: [{ originalElement: 'o', foreignElement: 'f', mappingRationale: 'mr' }],
        mappedContradictions: [{ originalContradiction: 'oc', foreignContradiction: 'fc', structuralParallel: 'sp' }],
      };
      case 'DiracTransfer': return {
        trizPrinciplesApplied: ['Segmentation'], analogicalResolution: 'ares',
        symmetricalResolution: 'sres', resolutionReasoning: 'rr',
      };
      case 'KillFilterGate1and2': return {
        gate1: { passed: true, reasoning: 'viable' },
        gate2: { passed: true, reasoning: 'sound analogy' },
      };
      case 'KillFilterGate3': return { passed: true, reasoning: 'symmetric' };
      case 'GroundingExecutionProtocol': return {
        domainType: 'software', validationSetup: 'vs',
        concreteSteps: [{ stepNumber: 1, description: 'd', verificationMethod: 'v' }],
        successMetrics: ['m'], risksAndMitigations: ['r'],
      };
      default: throw new Error(`Unexpected label: ${label}`);
    }
  };
  mock.counts = counts;
  return mock;
}

test('NG-1: there is NO gate-bypass mode — skipKillFilter is ignored and every result carries 3-gate gateLogs', async () => {
  const mock = makeMock();
  const result = await new Jumper({ runAgent: mock }).run('problem', {
    fanOut: 1, liveRefuter: false, skipKillFilter: true,
  });
  assert.equal(result.passed, true);
  assert.ok(mock.counts.KillFilterGate1and2 >= 1 && mock.counts.KillFilterGate3 >= 1,
    'the kill gates RAN despite skipKillFilter:true — the option does not exist');
  assert.ok(Array.isArray(result.gateLogs) && result.gateLogs.length === 3,
    `every returned concept carries the full 3-gate gateLogs (got ${result.gateLogs?.length})`);
});

test('NG-2: a pre-stamped Gandalf draft is RE-GRADED — the self-assigned GROUNDED tier cannot survive without a ledger commission', async () => {
  const mock = makeMock({ preStamped: true });
  const graded = await runGandalf('artifact', { runAgent: mock, liveRefuter: false });
  assert.equal(graded.elevations.length, 1);
  assert.equal(graded.elevations[0].tier, 'SPECULATIVE',
    'the drafter said GROUNDED; the deterministic seam pass must floor it (tiers are earned in code, never self-assigned)');
  assert.notEqual(graded.cross_model, true, 'cross_model cannot be inherited from the draft');
});

test('NG-4: all-same-sphere survivors surface their TRUE (identical) foreignDomain — diversity is never fabricated', async () => {
  const result = await new Jumper({ runAgent: makeMock({ sameDomain: true }) }).run('problem', {
    fanOut: 3, liveRefuter: false,
  });
  assert.equal(result.passed, true);
  const domains = result.survivors.map((s) => s.foreignDomain);
  assert.ok(domains.length >= 2, 'portfolio mode returned multiple survivors');
  assert.ok(domains.every((d) => d === 'music theory'),
    `every survivor must carry its true domain (got ${JSON.stringify(domains)}) — the engine must not relabel one domain as several`);
});
