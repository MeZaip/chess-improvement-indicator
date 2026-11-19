// The model behind ii. Parameters per platform × time class are fitted by
// tools/fit.js on a RANDOM sample of players and live in baselineParams.js:
//
//   transfer    weights of games in other time classes (see effort.js)
//   curve       [effectiveGames, typicalRating] – median rating of players
//               with that much experience (non-decreasing)
//   start       start level: rating of weak beginners (p10 at minimal experience)
//   difficulty  [rating, t] with t(r) = −ln P(rating ≥ r) in the population:
//               how rare a rating is. Each Elo is worth more where t rises
//               faster, i.e. at the top.
//   reliableMax above this rating the difficulty scale is extrapolated
//
// ii for a player with rating r and E effective games, T = typicalRating(E):
//
//   r ≤ T + BAND:  ii = (r − start) / (T − start)          plain Elo, linear
//   r > T + BAND:  same, but every Elo above T + BAND counts as
//                  t'(r) / t'(T + BAND) Elo – harder Elo weighs more
//
// The linear band (±150 around typical, about the size of rating noise)
// keeps ordinary fluctuations from swinging the number; ii is continuous
// and increasing in r, and equals 1 exactly at the typical rating.

import { BASELINES, BASELINE_VERSION, FIT_META } from './baselineParams.js';

export { BASELINES, BASELINE_VERSION, FIT_META };

export const BAND = 150;
const MIN_SPAN = 50; // guards against a typical rating sitting on top of the start level

export function getBaseline(platform, timeClass) {
  return BASELINES[platform]?.[timeClass] ?? null;
}

/** Piecewise-linear interpolation through [x, y] knots, linear extrapolation at both ends. */
function interp(knots, x) {
  const n = knots.length;
  if (n === 1) return knots[0][1];
  let i = 1;
  if (x >= knots[n - 1][0]) i = n - 1;
  else if (x > knots[0][0]) while (knots[i][0] < x) i++;
  const [x1, y1] = knots[i - 1];
  const [x2, y2] = knots[i];
  return x2 === x1 ? y1 : y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
}

/**
 * Rating gained per e-fold of games over the upper half of the curve
 * (weighted least squares on [ln games, rating]); used to continue the
 * curve past the most experienced players in the sample instead of
 * freezing it there. Never negative.
 */
function upperSlope(curve) {
  const pts = curve.slice(Math.floor(curve.length / 2)).map(([g, r]) => [Math.log(g), r]);
  if (pts.length < 2) return 0;
  const mx = pts.reduce((a, [x]) => a + x, 0) / pts.length;
  const my = pts.reduce((a, [, y]) => a + y, 0) / pts.length;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  return sxx > 0 ? Math.max(sxy / sxx, 0) : 0;
}

/**
 * Median rating of players with `games` effective games: interpolated in
 * log-games inside the data; below it clamped to the first point; above it
 * the upper trend is continued (flagged as beyondExperience by improvement()).
 */
export function typicalRating({ curve }, games) {
  if (games <= curve[0][0]) return curve[0][1];
  const [gLast, rLast] = curve[curve.length - 1];
  if (games >= gLast) return rLast + upperSlope(curve) * Math.log(games / gLast);
  return interp(curve.map(([g, r]) => [Math.log(g), r]), Math.log(games));
}

/** Difficulty t(r) = −ln P(rating ≥ r). */
export function difficulty({ difficulty: knots }, rating) {
  return interp(knots, rating);
}

/** Expected score against an opponent rated `opp` (Elo formula). */
export function expectedScore(rating, opp) {
  return 1 / (1 + 10 ** ((opp - rating) / 400));
}

/**
 * @returns {{ii:number, typical:number, expectedScore:number,
 *            flags:{belowStart:boolean, extrapolated:boolean, beyondExperience:boolean}}}
 */
export function improvement(baseline, rating, games) {
  const T = typicalRating(baseline, games);
  const r0 = baseline.start;
  const span = Math.max(T - r0, MIN_SPAN);
  const K = T + BAND;

  let ii;
  if (rating <= K) {
    ii = (rating - r0) / span;
  } else {
    const slopeK = (difficulty(baseline, K + 12.5) - difficulty(baseline, K - 12.5)) / 25;
    const extraElo = slopeK > 0 ? (difficulty(baseline, rating) - difficulty(baseline, K)) / slopeK : rating - K;
    ii = (K - r0 + extraElo) / span;
  }

  const lastCurveGames = baseline.curve[baseline.curve.length - 1][0];
  return {
    ii: Math.max(ii, 0),
    typical: T,
    expectedScore: expectedScore(rating, T),
    flags: {
      belowStart: rating < r0,
      extrapolated: rating > baseline.reliableMax,
      beyondExperience: games > lastCurveGames,
    },
  };
}
