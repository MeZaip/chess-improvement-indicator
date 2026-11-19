// Collectors against a fake API (no network): checks request flow,
// parsing, dedup, skipping closed accounts and stopping at the target.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectChesscom } from '../tools/collectors/chesscom.js';
import { collectLichess, collectLichessTail } from '../tools/collectors/lichess.js';
import { createClient } from '../tools/lib/http.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ndjson = (rows) => new Response(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const quiet = () => {};
const cyclingRng = () => { let i = 0; return () => ((i++ * 0.618034) % 1); };

function fakeClient(handler) {
  const calls = [];
  const client = createClient({
    minIntervalMs: 0,
    sleep: async () => {},
    log: quiet,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
  });
  return { client, calls };
}

test('http client gives up with RateLimitedError when 429 persists', async () => {
  const { client } = fakeClient(() => new Response('', { status: 429 }));
  await assert.rejects(client.request('https://lichess.org/x'), { code: 'rate_limited' });
});

test('http client sends the bearer token when given', async () => {
  let seen;
  const c = createClient({ minIntervalMs: 0, authToken: 'tok', fetchImpl: async (_u, init) => ((seen = init.headers), json({})) });
  await c.request('https://x');
  assert.equal(seen.Authorization, 'Bearer tok');
});

test('http client retries after 429', async () => {
  let n = 0;
  const { client } = fakeClient(() => (++n === 1 ? new Response('', { status: 429 }) : json({ ok: true })));
  const res = await client.request('https://x');
  assert.equal(res.status, 200);
  assert.equal(n, 2);
});

test('lichess: tournament seeds → opponents → bulk profiles', async () => {
  // player i has opponents i+1 … i+5 (a chain, so the walk keeps finding new people)
  const user = (id) => ({ id, username: id.toUpperCase(), perfs: { blitz: { games: 100, rating: 1500, prov: false } }, playTime: { total: 1000 } });
  const { client, calls } = fakeClient((url, init) => {
    if (url === 'https://lichess.org/api/tournament') return json({ finished: [{ id: 't1', variant: { key: 'standard' } }], started: [] });
    if (url.startsWith('https://lichess.org/api/tournament/t1/results')) return ndjson([{ username: 'p0' }, { username: 'p1' }]);
    const m = url.match(/games\/user\/p(\d+)/);
    if (m) {
      const i = Number(m[1]);
      return ndjson([1, 2, 3, 4, 5].map((d) => ({ players: { white: { user: { id: `p${i}` } }, black: { user: { id: `p${i + d}` } } } })));
    }
    if (url === 'https://lichess.org/api/users') {
      const ids = init.body.split(',');
      return json(ids.map((id) => (id === 'p3' ? { id, username: 'P3', closed: true } : user(id))));
    }
    throw new Error(`unexpected ${url}`);
  });

  const out = [];
  const seen = new Set();
  await collectLichess({ client, target: 20, seen, emit: (r) => out.push(r), log: quiet, rng: cyclingRng() });

  assert.equal(out.length, 20);
  assert.equal(new Set(out.map((r) => r.username)).size, 20, 'no duplicates');
  assert.ok(!out.some((r) => r.username === 'P3'), 'closed account skipped');
  assert.ok(calls.some((c) => c.url === 'https://lichess.org/api/users' && c.init.method === 'POST'));
  assert.ok(calls.every((c) => c.init.headers['User-Agent'].includes('chess-improvement-indicator')));
});

test('chesscom: country pool → stats, skips empty and failed accounts', async () => {
  const names = Array.from({ length: 30 }, (_, i) => `u${i}`);
  const { client } = fakeClient((url) => {
    if (url.includes('/country/RO/')) return json({ players: names });
    if (url.includes('/country/')) return json({ code: 0 }, 500);
    const m = url.match(/player\/u(\d+)\/stats/);
    if (m) {
      const i = Number(m[1]);
      if (i % 5 === 0) return json({}, 404);              // gone
      if (i % 5 === 1) return json({ tactics: {} });     // no rated games
      return json({ chess_blitz: { last: { rating: 800 + i, rd: 50 }, record: { win: 40, loss: 40, draw: 5 } } });
    }
    throw new Error(`unexpected ${url}`);
  });

  const out = [];
  await collectChesscom({ client, target: 10, seen: new Set(), emit: (r) => out.push(r), countries: ['RO', 'DE'], log: quiet });
  assert.equal(out.length, 10);
  assert.ok(out.every((r) => r.perfs.blitz.games === 85));
});

test('lichess tail: leaderboard ids → bulk profiles, marked as source=top', async () => {
  const { client } = fakeClient((url, init) => {
    const m = url.match(/player\/top\/200\/(\w+)/);
    if (m) return json({ users: [{ id: `${m[1]}1` }, { id: 'shared' }] });
    if (url === 'https://lichess.org/api/users') {
      return json(init.body.split(',').map((id) => ({ id, username: id, perfs: { blitz: { games: 5000, rating: 2900 } } })));
    }
    throw new Error(`unexpected ${url}`);
  });
  const out = [];
  await collectLichessTail({ client, seen: new Set(['bullet1']), emit: (r) => out.push(r), log: quiet });
  assert.deepEqual(out.map((r) => r.username).sort(), ['blitz1', 'classical1', 'rapid1', 'shared']);
  assert.ok(out.every((r) => r.source === 'top'));
});
