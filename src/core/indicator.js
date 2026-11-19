import { improvement } from './baseline.js';

// Below this many games in the time class the rating is too noisy.
export const MIN_GAMES = 30;

// Display cap (a 2700 on a fresh account would otherwise show absurd values).
export const MAX_II = 20;

/**
 * Improvement indicator for one time class.
 *
 *   ii ≈ (your rating − start level) / (typical rating − start level)
 *
 * where "typical" is the median rating of players with the same experience
 * (effective games, see effort.js), and Elo far above typical is weighted by
 * how hard it is to reach (see baseline.js).
 *
 * ii = 1   → typical for your experience
 * ii = 2   → you climbed about twice as far as typical with that experience
 * ii = 0.5 → half as far
 *
 * @param {{rating:number, games:number, provisional:boolean}} perf
 * @param {object} baseline  see baseline.js
 * @param {number} [effort]  effective games (defaults to games in this class)
 */
export function computeIndicator(perf, baseline, effort = perf.games) {
  if (perf.provisional || perf.games < MIN_GAMES) {
    return { status: 'insufficient', ii: null, typical: null, expectedScore: null, flags: {} };
  }
  const r = improvement(baseline, perf.rating, effort);
  return { status: 'ok', ...r, ii: Math.min(r.ii, MAX_II), capped: r.ii > MAX_II };
}

/**
 * Combine per-time-class indicators into one number.
 * Weighted geometric mean: ii is a ratio, so averaging logs is the right
 * thing (2x and 0.5x average to 1x, not 1.25x). Weight = `weight` field
 * (time spent in that class, see report.js), falling back to games.
 * Zero values are clamped to a small epsilon.
 */
export function combineIndicators(entries) {
  const ok = entries.filter((e) => e.status === 'ok');
  const w = (e) => e.weight ?? e.games;
  const total = ok.reduce((s, e) => s + w(e), 0);
  if (total === 0) return null;
  const logSum = ok.reduce((s, e) => s + w(e) * Math.log(Math.max(e.ii, 0.01)), 0);
  return Math.exp(logSum / total);
}
