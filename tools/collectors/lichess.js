// Sampling Lichess players.
//
// 1) Seeds: players from recent arena tournaments (GET /api/tournament).
//    Lichess runs rating-limited arenas (≤1300, ≤1500, ≤1700, ...) next to
//    open ones, so the seeds cover the whole rating range.
// 2) Samples: OPPONENTS of seeds in ordinary rated games. Matchmaking pairs
//    similar ratings, so opponents spread the same way as the seeds, but
//    they are regular pool players, not just tournament players.
//    With probability WANDER_P the walk continues from an opponent instead
//    of jumping back to a seed – this adds variety without drifting away.
// 3) Profiles are fetched in bulk (POST /api/users, ≤300 ids per request),
//    so very few requests are needed.
//
// Remaining bias: players met through recent games are active players.

import { normalizeLichess } from '../../src/providers/lichess.js';
import { Frontier } from '../lib/frontier.js';

const BULK_MAX = 300;
const GAMES_PER_STEP = 40;
const PERF_TYPES = 'bullet,blitz,rapid,classical';
const WANDER_P = 0.3;
const SEED_TOURNAMENTS = 25;
const PLAYERS_PER_TOURNAMENT = 150;

function parseNdjson(text) {
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export async function fetchTournamentSeeds(client, { log = console.error, rng = Math.random } = {}) {
  const res = await client.request('https://lichess.org/api/tournament', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`could not list tournaments (HTTP ${res.status})`);
  const list = await res.json();
  const ids = [...(list.finished ?? []), ...(list.started ?? [])]
    .filter((t) => !t.variant || t.variant.key === 'standard')
    .map((t) => t.id);

  const seeds = new Set();
  for (const id of ids.sort(() => rng() - 0.5).slice(0, SEED_TOURNAMENTS)) {
    const r = await client.request(`https://lichess.org/api/tournament/${id}/results?nb=${PLAYERS_PER_TOURNAMENT}`, {
      headers: { Accept: 'application/x-ndjson' },
    });
    if (!r.ok) continue;
    for (const row of parseNdjson(await r.text())) {
      if (row.username) seeds.add(row.username.toLowerCase());
    }
  }
  log(`  ${seeds.size} seed players from ${Math.min(ids.length, SEED_TOURNAMENTS)} tournaments`);
  return [...seeds];
}

/**
 * High-rating tail: top-200 leaderboard per time class, profiles in bulk.
 * Safe for the baseline because it is conditioned on rating (see tools/lib/fit.js).
 */
export async function collectLichessTail({ client, seen, emit, log = console.error }) {
  const ids = new Set();
  for (const perf of PERF_TYPES.split(',')) {
    const res = await client.request(`https://lichess.org/api/player/top/200/${perf}`, {
      headers: { Accept: 'application/vnd.lichess.v3+json' },
    });
    if (!res.ok) continue;
    for (const u of (await res.json()).users ?? []) if (!seen.has(u.id)) ids.add(u.id);
  }
  const all = [...ids];
  let added = 0;
  for (let i = 0; i < all.length; i += BULK_MAX) {
    const batch = all.slice(i, i + BULK_MAX);
    batch.forEach((id) => seen.add(id));
    const res = await client.request('https://lichess.org/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
      body: batch.join(','),
    });
    if (!res.ok) continue;
    for (const u of await res.json()) {
      let player;
      try {
        player = normalizeLichess(u);
      } catch {
        continue;
      }
      if (Object.keys(player.perfs).length === 0) continue;
      emit({ platform: 'lichess', source: 'top', username: player.username, perfs: player.perfs, playTimeSeconds: player.playTimeSeconds, createdAt: player.createdAt, chesscomLinks: player.chesscomLinks });
      added++;
    }
  }
  log(`  tail: ${added} leaderboard players added`);
  return added;
}

export async function collectLichess({ client, seeds, target, seen, count = 0, emit, log = console.error, rng = Math.random }) {
  if (!seeds?.length) seeds = await fetchTournamentSeeds(client, { log, rng });
  if (!seeds.length) throw new Error('no seed players');
  const seedList = seeds.map((s) => s.toLowerCase());
  const frontier = new Frontier(5000, rng);
  const pending = [];
  const pendingSet = new Set();
  let failures = 0;

  async function flush() {
    const batch = pending.splice(0, BULK_MAX);
    batch.forEach((id) => pendingSet.delete(id));
    batch.forEach((id) => seen.add(id)); // also ids missing from the answer: don't retry them
    const res = await client.request('https://lichess.org/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
      body: batch.join(','),
    });
    if (!res.ok) {
      log(`  bulk users: HTTP ${res.status}, skipping batch`);
      return;
    }
    for (const u of await res.json()) {
      let player;
      try {
        player = normalizeLichess(u);
      } catch {
        continue; // closed / ToS violation
      }
      if (Object.keys(player.perfs).length === 0) continue;
      emit({ platform: 'lichess', source: 'random', username: player.username, perfs: player.perfs, playTimeSeconds: player.playTimeSeconds, createdAt: player.createdAt, chesscomLinks: player.chesscomLinks });
      if (++count >= target) return;
    }
  }

  while (count < target) {
    const walker = frontier.size > 0 && rng() < WANDER_P
      ? frontier.pick()
      : seedList[Math.floor(rng() * seedList.length)];

    const url =
      `https://lichess.org/api/games/user/${encodeURIComponent(walker)}?max=${GAMES_PER_STEP}` +
      `&rated=true&perfType=${PERF_TYPES}&moves=false&tags=false&clocks=false&evals=false&opening=false`;
    const res = await client.request(url, { headers: { Accept: 'application/x-ndjson' } });
    if (!res.ok) {
      if (++failures > 50) throw new Error('too many consecutive failures');
      continue;
    }
    failures = 0;

    for (const game of parseNdjson(await res.text())) {
      for (const side of ['white', 'black']) {
        const id = game.players?.[side]?.user?.id;
        if (!id || id === walker) continue;
        frontier.add(id);
        if (!seen.has(id) && !pendingSet.has(id)) {
          pending.push(id);
          pendingSet.add(id);
        }
      }
    }

    // Flush full batches; near the target, flush whatever is pending.
    while (count < target && (pending.length >= BULK_MAX || (pending.length > 0 && count + pending.length >= target))) {
      await flush(); // updates `count` (closure)
    }
  }
  return count;
}
