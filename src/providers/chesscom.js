import { checkResponse } from './errors.js';

// https://www.chess.com/news/view/published-data-api#pubapi-endpoint-player-stats
// Note: chess.com refreshes these endpoints at most once every ~24h.
// Note: chess.com serves these from a CDN and refreshes them at most every
// 12–24 h, so a fresh request can still return slightly old ratings.
export async function fetchChesscomPlayer(username, { fresh = false } = {}) {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, {
    cache: fresh ? 'no-cache' : 'default',
  });
  return normalizeChesscom(username, await checkResponse(res).json());
}

/** Like fetchChesscomPlayer, but returns null instead of throwing (for optional lookups). */
export async function tryFetchChesscomPlayer(username, opts) {
  try {
    return await fetchChesscomPlayer(username, opts);
  } catch {
    return null;
  }
}

const KEYS = { bullet: 'chess_bullet', blitz: 'chess_blitz', rapid: 'chess_rapid' };

// chess.com has no "provisional" flag; a high RD is the closest signal.
const PROVISIONAL_RD = 150;

export function normalizeChesscom(username, data) {
  const perfs = {};
  for (const [tc, key] of Object.entries(KEYS)) {
    const s = data[key];
    if (!s?.last || !s.record) continue;
    const { win = 0, loss = 0, draw = 0 } = s.record;
    const games = win + loss + draw;
    if (games === 0) continue;
    perfs[tc] = {
      rating: s.last.rating,
      games,
      provisional: (s.last.rd ?? 0) >= PROVISIONAL_RD,
    };
  }

  return {
    platform: 'chesscom',
    username,
    perfs,
    // chess.com does not expose playtime → estimated from games per time class.
    playTimeSeconds: null,
  };
}
