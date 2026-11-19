// Service worker: the only place that talks to the network.
// Content scripts send {type:'getReport', platform, username} and get back
// {ok:true, report} or {ok:false, error}.

import { BASELINE_VERSION } from './core/baseline.js';
import { buildReport } from './core/report.js';
import { fetchChesscomPlayer, tryFetchChesscomPlayer } from './providers/chesscom.js';
import { fetchLichessPlayer, tryFetchLichessPlayer } from './providers/lichess.js';

const PROVIDERS = {
  lichess: fetchLichessPlayer,
  chesscom: fetchChesscomPlayer,
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 3; // bump when the report shape changes (baseline changes are automatic)

/**
 * Find the same person on the other platform (see core/linking.js).
 *   confirmed – the Lichess profile links to the chess.com account → counted
 *   possible  – same username exists, no link → shown, not counted
 * Never throws: a failed lookup just means "no linked account".
 */
async function findLinkedAccount(player) {
  if (player.platform === 'lichess') {
    const links = player.chesscomLinks;
    if (links.length === 1) {
      const other = await tryFetchChesscomPlayer(links[0]);
      return other ? { ...other, status: 'confirmed' } : null;
    }
    if (links.length > 1) return null; // ambiguous
    const other = await tryFetchChesscomPlayer(player.username);
    return other && Object.keys(other.perfs).length ? { ...other, status: 'possible' } : null;
  }

  if (player.platform === 'chesscom') {
    const other = await tryFetchLichessPlayer(player.username);
    if (!other) return null;
    if (other.chesscomLinks.includes(player.username.toLowerCase())) return { ...other, status: 'confirmed' };
    return Object.keys(other.perfs).length ? { ...other, status: 'possible' } : null;
  }
  return null;
}

async function getReport(platform, username) {
  const key = `report:v${CACHE_VERSION}:${BASELINE_VERSION}:${platform}:${username.toLowerCase()}`;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.report;

  const fetchPlayer = PROVIDERS[platform];
  if (!fetchPlayer) throw new Error(`unknown platform ${platform}`);

  const player = await fetchPlayer(username);
  const linked = await findLinkedAccount(player);
  const report = buildReport(player, linked);
  await chrome.storage.local.set({ [key]: { at: Date.now(), report } });
  return report;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'getReport') return false;
  getReport(msg.platform, msg.username)
    .then((report) => sendResponse({ ok: true, report }))
    .catch((err) => sendResponse({ ok: false, error: err.code ?? err.message }));
  return true; // keep the channel open for the async response
});
