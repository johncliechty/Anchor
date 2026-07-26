// P2 2026-07-25 — the OpenAlex fallback provider: an S2 outage no longer truncates the
// walk silently OR kills it; the provider switch is stamped. Hermetic (stub fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performSnowballSearch, fetchReferencesOpenAlex } from '../src/search.mjs';

const okJson = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj });
const s2_429 = { ok: false, status: 429, statusText: 'Too Many Requests', headers: { get: () => '0' }, json: async () => ({}) };

function stubFetch({ s2Down = true } = {}) {
  const calls = [];
  return Object.assign(async (url) => {
    calls.push(url);
    if (url.includes('api.semanticscholar.org')) {
      if (s2Down && url.includes('/references')) return s2_429;
      return okJson({ data: [] });
    }
    if (url.includes('api.openalex.org/works?search=')) {
      return okJson({ results: [{ id: 'https://openalex.org/W1', referenced_works: ['https://openalex.org/W2', 'https://openalex.org/W3'] }] });
    }
    if (url.includes('api.openalex.org/works?filter=openalex_id:')) {
      return okJson({ results: [
        { id: 'https://openalex.org/W2', title: 'Fallback Paper Two', publication_year: 2021, cited_by_count: 10,
          primary_location: { source: { display_name: 'Nature' } }, authorships: [], open_access: {} },
        { id: 'https://openalex.org/W3', title: 'Fallback Paper Three', publication_year: 2022, cited_by_count: 5,
          primary_location: { source: { display_name: 'Science' } }, authorships: [], open_access: {} },
      ] });
    }
    if (url.includes('api.openalex.org/works/W')) {
      return okJson({ id: url.split('/').pop(), referenced_works: [] });
    }
    throw new Error(`unexpected url: ${url}`);
  }, { calls });
}

test('fetchReferencesOpenAlex maps works to the paper shape with openalex: ids + provider stamp', async () => {
  const refs = await fetchReferencesOpenAlex('Some Seed Title', { fetch: stubFetch(), maxRetries: 0, backoffFactor: 1, sleep: async () => {} });
  assert.equal(refs.length, 2);
  assert.equal(refs[0].paperId, 'openalex:W2');
  assert.equal(refs[0].provider, 'openalex');
  assert.equal(refs[0].venue, 'Nature');
});

test('snowball: S2 reference outage falls back to OpenAlex — papers land, the switch is STAMPED, nothing silent', async () => {
  const f = stubFetch({ s2Down: true });
  const seed = 'SEED123';
  // Pre-seed the paper map path: performSnowballSearch fetches the seed's refs first;
  // the seed needs a title for the by-title fallback, which the walk stores on entry.
  const result = await performSnowballSearch(seed, { venues: [] }, {
    fetch: f, depth: 1, maxRetries: 0, backoffFactor: 1, sleep: async () => {},
    seedPaper: { paperId: seed, title: 'Some Seed Title' },
  });
  const ids = result.graph.nodes.map((n) => n.paperId);
  assert.ok(ids.includes('openalex:W2') && ids.includes('openalex:W3'),
    `the fallback papers entered the graph (got ${JSON.stringify(ids)})`);
  assert.equal(result.providerFallbacks.length, 1, 'the provider switch is recorded');
  assert.equal(result.providerFallbacks[0].provider, 'openalex');
  assert.match(result.providerFallbacks[0].s2_error, /429/);
  assert.equal(result.fetchFailures.length, 0, 'a successful fallback is not a loss');
});
