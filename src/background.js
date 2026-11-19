// Service worker: the only place that talks to the network.
// Content scripts send {type:'getReport', platform, username} and get back
// {ok:true, report} or {ok:false, error}.

import { buildReport } from './core/report.js';
import { fetchChesscomPlayer } from './providers/chesscom.js';
import { fetchLichessPlayer } from './providers/lichess.js';

const PROVIDERS = {
  lichess: fetchLichessPlayer,
  chesscom: fetchChesscomPlayer,
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = 1; // bump when the report shape or baseline changes

async function getReport(platform, username) {
  const key = `report:v${CACHE_VERSION}:${platform}:${username.toLowerCase()}`;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.report;

  const fetchPlayer = PROVIDERS[platform];
  if (!fetchPlayer) throw new Error(`unknown platform ${platform}`);

  const report = buildReport(await fetchPlayer(username));
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
