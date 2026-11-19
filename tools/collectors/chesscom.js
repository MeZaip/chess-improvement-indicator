// Sampling chess.com players directly from the per-country member lists
// (GET /pub/country/{ISO}/players).
//
// Those lists are truncated (~10k names, alphabetical) and the biggest
// countries sometimes error out – fine for us: a username's first letter
// says nothing about rating, and we only need a random pool of accounts.
// This samples random ACCOUNTS (inactive ones included), which is closer to
// "the average player" than walking through recent games, which favours
// people who are still active.
//
// Cost: one /stats request per candidate; accounts with no rated
// bullet/blitz/rapid games are skipped.
//
// Known gap: accounts closed for fair-play violations are not filtered
// (would need one more request per player). Bucket medians are robust to
// the small fraction they represent.

import { normalizeChesscom } from '../../src/providers/chesscom.js';
import { shuffle } from '../lib/frontier.js';

export const DEFAULT_COUNTRIES = [
  'RO', 'MD', 'GB', 'DE', 'FR', 'ES', 'IT', 'PL', 'NL', 'SE', 'TR', 'UA',
  'IN', 'PH', 'ID', 'BR', 'AR', 'MX', 'CA', 'AU', 'US', 'EG', 'NG', 'ZA',
];

const POOL_TARGET = 40_000;

export async function collectChesscom({
  client, target, seen, count = 0, emit,
  countries = DEFAULT_COUNTRIES, log = console.error, rng = Math.random,
}) {
  async function getJson(url) {
    const res = await client.request(url, { headers: { Accept: 'application/json' } });
    return res.ok ? res.json() : null;
  }

  // 1) build a pool of random usernames
  const pool = [];
  for (const iso of shuffle([...countries], rng)) {
    const players = (await getJson(`https://api.chess.com/pub/country/${iso}/players`))?.players;
    if (!players?.length) {
      log(`  country ${iso}: unavailable, skipping`);
      continue;
    }
    // take an equal-ish random share per country so no country dominates
    const share = shuffle([...players], rng).slice(0, Math.ceil(POOL_TARGET / countries.length));
    pool.push(...share.map((p) => p.toLowerCase()));
    log(`  country ${iso}: ${players.length} listed, ${share.length} taken`);
  }
  if (pool.length === 0) throw new Error('could not load any country list');
  shuffle(pool, rng);

  // 2) fetch stats for random accounts until we have enough
  for (const name of pool) {
    if (count >= target) break;
    if (seen.has(name)) continue;
    seen.add(name);
    const stats = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(name)}/stats`);
    if (!stats) continue;
    const player = normalizeChesscom(name, stats);
    if (Object.keys(player.perfs).length === 0) continue;
    emit({ platform: 'chesscom', source: 'random', username: name, perfs: player.perfs, playTimeSeconds: null });
    count++;
  }
  if (count < target) log(`pool exhausted at ${count} players – add more --countries`);
  return count;
}

const TITLES = ['GM', 'IM', 'FM', 'CM', 'NM', 'WGM', 'WIM', 'WFM', 'WCM'];

/**
 * High-rating tail: random titled players (/pub/titled/{title}).
 * Safe for the baseline because it is conditioned on rating (see tools/lib/fit.js).
 */
export async function collectChesscomTail({ client, seen, emit, limit = 1500, log = console.error, rng = Math.random }) {
  const names = [];
  for (const t of TITLES) {
    const res = await client.request(`https://api.chess.com/pub/titled/${t}`, { headers: { Accept: 'application/json' } });
    if (res.ok) names.push(...((await res.json()).players ?? []).map((p) => p.toLowerCase()));
  }
  let added = 0;
  for (const name of shuffle(names.filter((n) => !seen.has(n)), rng).slice(0, limit)) {
    seen.add(name);
    const res = await client.request(`https://api.chess.com/pub/player/${encodeURIComponent(name)}/stats`, { headers: { Accept: 'application/json' } });
    if (!res.ok) continue;
    const player = normalizeChesscom(name, await res.json());
    if (Object.keys(player.perfs).length === 0) continue;
    emit({ platform: 'chesscom', source: 'titled', username: name, perfs: player.perfs, playTimeSeconds: null });
    added++;
  }
  log(`  tail: ${added} titled players added`);
  return added;
}
