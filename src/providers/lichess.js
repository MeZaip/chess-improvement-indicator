import { TIME_CLASSES } from '../core/timeClasses.js';
import { ProviderError, checkResponse } from './errors.js';

// https://lichess.org/api#tag/Users/operation/apiUser
export async function fetchLichessPlayer(username) {
  const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
    headers: { Accept: 'application/json' },
  });
  return normalizeLichess(await checkResponse(res).json());
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
  };
}
