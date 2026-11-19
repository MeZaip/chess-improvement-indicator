// Enrich calibration records with their CONFIRMED account on the other
// platform, using exactly the same rule as the extension (src/core/linking.js).
//
// lichess records:  re-fetch profiles in bulk (300/request) → createdAt +
//                   chess.com links → fetch the linked chess.com stats.
// chesscom records: look up the same name on Lichess in bulk → keep it only
//                   if that Lichess profile links back to this chess.com name.

import { normalizeChesscom } from '../../src/providers/chesscom.js';
import { normalizeLichess } from '../../src/providers/lichess.js';
import { chesscomLinksFromLichessProfile } from '../../src/core/linking.js';

const BULK_MAX = 300;

/**
 * Bulk Lichess lookup. `answered` holds every id whose batch got a valid
 * response: an id in `answered` but not in `users` really doesn't exist,
 * an id outside `answered` is unknown (request failed) and must be retried.
 */
async function lichessBulk(client, ids, log) {
  const users = new Map();
  const answered = new Set();
  for (let i = 0; i < ids.length; i += BULK_MAX) {
    const batch = ids.slice(i, i + BULK_MAX);
    const res = await client.lichess.request('https://lichess.org/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
      body: batch.join(','),
    });
    if (!res.ok) {
      log(`  lichess bulk: HTTP ${res.status} – ${batch.length} players left for the next run`);
      continue;
    }
    for (const u of await res.json()) users.set(u.id, u);
    batch.forEach((id) => answered.add(id));
  }
  return { users, answered };
}

const LOOKUP_FAILED = Symbol('lookup failed');

/** chess.com stats; null = no such account, LOOKUP_FAILED = try again later. */
async function chesscomStats(client, name) {
  const res = await client.chesscom.request(`https://api.chess.com/pub/player/${encodeURIComponent(name)}/stats`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) return LOOKUP_FAILED;
  return normalizeChesscom(name, await res.json());
}

function lichessPerfs(u) {
  try {
    return normalizeLichess(u).perfs;
  } catch {
    return null; // closed / ToS violation
  }
}

/**
 * @param {object[]} records  rows of data/raw/<platform>.jsonl (mutated in place)
 * @param {{lichess:{request}, chesscom:{request}}} client
 * @returns {{checked:number, linked:number}}
 */
export async function linkRecords(platform, records, client, { log = console.error } = {}) {
  const todo = records.filter((r) => !r.linkCheckedAt);
  const now = new Date().toISOString();
  let linked = 0;
  let checked = 0;

  if (platform === 'lichess') {
    // newer records already carry createdAt + chesscomLinks from collection
    const refetch = todo.filter((r) => !Array.isArray(r.chesscomLinks));
    const { users } = await lichessBulk(client, refetch.map((r) => r.username.toLowerCase()), log);
    for (const r of todo) {
      if (!Array.isArray(r.chesscomLinks)) {
        const u = users.get(r.username.toLowerCase());
        if (!u) continue; // failed batch or account gone – retried next run
        r.createdAt = u.createdAt ?? null;
        r.chesscomLinks = chesscomLinksFromLichessProfile(u.profile);
      }
      let link = null;
      if (r.chesscomLinks.length === 1) {
        const other = await chesscomStats(client, r.chesscomLinks[0]);
        if (other === LOOKUP_FAILED) continue; // retried next run
        if (other && Object.keys(other.perfs).length) {
          link = { platform: 'chesscom', username: other.username, perfs: other.perfs, status: 'confirmed' };
          linked++;
        }
      }
      r.linked = link;
      r.linkCheckedAt = now;
      if (++checked % 500 === 0) log(`  ${checked}/${todo.length} checked, ${linked} linked`);
    }
  } else if (platform === 'chesscom') {
    const { users, answered } = await lichessBulk(client, todo.map((r) => r.username.toLowerCase()), log);
    for (const r of todo) {
      const name = r.username.toLowerCase();
      if (!answered.has(name)) continue; // failed batch – retried next run
      const u = users.get(name);
      r.linked = null;
      if (u && chesscomLinksFromLichessProfile(u.profile).includes(name)) {
        const perfs = lichessPerfs(u);
        if (perfs && Object.keys(perfs).length) {
          r.linked = { platform: 'lichess', username: u.username, perfs, status: 'confirmed' };
          linked++;
        }
      }
      r.linkCheckedAt = now;
      checked++;
    }
  }
  return { checked, linked, pending: todo.length - checked };
}
