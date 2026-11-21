import { chesscomLinksFromLichessProfile } from '../core/linking.js';
import { TIME_CLASSES } from '../core/timeClasses.js';
import { ProviderError, checkResponse } from './errors.js';

// https://lichess.org/api#tag/Users/operation/apiUser
export async function fetchLichessPlayer(username, { fresh = false } = {}) {
  const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
    headers: { Accept: 'application/json' },
    cache: fresh ? 'no-cache' : 'default',
    credentials: 'omit', // never send the user's Lichess cookies
  });
  return normalizeLichess(await checkResponse(res).json());
}

/** Like fetchLichessPlayer, but returns null instead of throwing (for optional lookups). */
export async function tryFetchLichessPlayer(username, opts) {
  try {
    return await fetchLichessPlayer(username, opts);
  } catch {
    return null;
  }
}

export function normalizeLichess(data) {
  if (data.closed || data.disabled || data.tosViolation) throw new ProviderError('closed');

  const perfs = {};
  for (const tc of TIME_CLASSES) {
    const p = data.perfs?.[tc];
    if (p && p.games > 0) {
      perfs[tc] = { rating: p.rating, games: p.games, provisional: Boolean(p.prov) };
    }
  }

  return {
    platform: 'lichess',
    username: data.username,
    perfs,
    // Lichess reports real total playtime (all variants, seconds).
    playTimeSeconds: data.playTime?.total ?? null,
    createdAt: data.createdAt ?? null,
    // chess.com accounts this player links from their profile (lowercase)
    chesscomLinks: chesscomLinksFromLichessProfile(data.profile),
  };
}
