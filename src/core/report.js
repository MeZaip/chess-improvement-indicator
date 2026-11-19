import { BASELINE_VERSION, getBaseline } from './baseline.js';
import { combineIndicators, computeIndicator } from './indicator.js';
import { TIME_CLASSES, estimatePlaytimeSeconds } from './timeClasses.js';

/**
 * Turn a normalized player (see providers/*) into the report the badge shows.
 * Pure function — no network, no chrome APIs — so it is unit-testable.
 *
 * @param {{platform:string, username:string,
 *          perfs:Record<string,{rating:number,games:number,provisional:boolean}>,
 *          playTimeSeconds:number|null}} player
 */
export function buildReport(player) {
  const classes = [];
  for (const tc of TIME_CLASSES) {
    const perf = player.perfs[tc];
    const baseline = getBaseline(player.platform, tc);
    if (!perf || !baseline) continue;
    classes.push({ timeClass: tc, rating: perf.rating, games: perf.games, ...computeIndicator(perf, baseline) });
  }

  const reported = player.playTimeSeconds;
  return {
    platform: player.platform,
    username: player.username,
    baselineVersion: BASELINE_VERSION,
    overall: combineIndicators(classes),
    classes,
    playtime: {
      hours: (reported ?? estimatePlaytimeSeconds(player.perfs)) / 3600,
      estimated: reported == null,
    },
  };
}
