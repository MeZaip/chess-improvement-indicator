import { checkResponse } from './errors.js';

// https://www.chess.com/news/view/published-data-api#pubapi-endpoint-player-stats
// Note: chess.com refreshes these endpoints at most once every ~24h.
export async function fetchChesscomPlayer(username) {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`);
  return normalizeChesscom(username, await checkResponse(res).json());
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
