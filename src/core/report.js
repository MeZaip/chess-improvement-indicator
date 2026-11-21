import { BASELINE_VERSION, getBaseline } from './baseline.js';
import { effectiveGames, effortParts } from './effort.js';
import { combineIndicators, computeIndicator } from './indicator.js';
import { AVG_GAME_SECONDS, TIME_CLASSES, estimatePlaytimeSeconds } from './timeClasses.js';

/**
 * Turn a normalized player (see providers/*) into the report the badge shows.
 * Pure function — no network, no chrome APIs — so it is unit-testable.
 *
 * Per time class:  ii = medianEffectiveGamesAtRating / yourEffectiveGames
 * Headline:        geometric mean of the per-class ii, weighted by the
 *                  TIME spent in each class (a classical game weighs ~25
 *                  bullet games here).
 *
 * @param {{platform:string, username:string,
 *          perfs:Record<string,{rating:number,games:number,provisional:boolean}>,
 *          playTimeSeconds:number|null}} player
 * @param {null | {platform:string, username:string, perfs:object, status:'confirmed'|'possible'}} [linked]
 *        same person on the other platform; only 'confirmed' accounts are counted
 */
export function buildReport(player, linked = null) {
  const linkedPerfs = linked?.status === 'confirmed' ? linked.perfs : null;
  const classes = [];
  for (const tc of TIME_CLASSES) {
    const perf = player.perfs[tc];
    const baseline = getBaseline(player.platform, tc);
    if (!perf || !baseline) continue;
    const effort = effectiveGames(player.perfs, tc, baseline.transfer, linkedPerfs);
    classes.push({
      timeClass: tc,
      rating: perf.rating,
      games: perf.games,
      effectiveGames: effort,
      effortParts: effortParts(player.perfs, tc, baseline.transfer, linkedPerfs),
      weight: perf.games * AVG_GAME_SECONDS[tc],
      ...computeIndicator(perf, baseline, effort, { linked: linkedPerfs != null }),
    });
  }

  const reported = player.playTimeSeconds;
  return {
    platform: player.platform,
    username: player.username,
    baselineVersion: BASELINE_VERSION,
    overall: combineIndicators(classes),
    classes,
    linked: linked && {
      platform: linked.platform,
      username: linked.username,
      status: linked.status,
      counted: linked.status === 'confirmed',
      games: TIME_CLASSES.reduce((s, tc) => s + (linked.perfs[tc]?.games ?? 0), 0),
    },
    playtime: {
      hours: (reported ?? estimatePlaytimeSeconds(player.perfs)) / 3600,
      estimated: reported == null,
    },
  };
}

/**
 * Replace API ratings with the ones currently shown on the profile page
 * (Chess.com's public API can lag hours behind). Only time classes the
 * player already has, and only plausible values, are used; game counts stay
 * from the API. Returns a new player object and whether anything was applied.
 *
 * @param {{perfs:Record<string,{rating:number}>}} player
 * @param {Record<string, number>|null} pageRatings  e.g. { blitz: 1205 }
 */
export function applyPageRatings(player, pageRatings) {
  if (!pageRatings) return { player, applied: false };
  const perfs = { ...player.perfs };
  let applied = false;
  for (const [tc, rating] of Object.entries(pageRatings)) {
    if (!perfs[tc] || !Number.isInteger(rating) || rating < 100 || rating > 3500) continue;
    if (perfs[tc].rating !== rating) applied = true;
    perfs[tc] = { ...perfs[tc], rating };
  }
  return { player: { ...player, perfs }, applied };
}
