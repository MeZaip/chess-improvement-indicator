import { expectedRating, gamesToReach } from './baseline.js';

// Below this many games the rating is too noisy to say anything.
export const MIN_GAMES = 30;

// Cap so a strong OTB player opening a fresh account doesn't show 4000x.
export const MAX_II = 20;

/**
 * Improvement indicator for one time class.
 *
 * Same idea as osu! ii: compare the effort the AVERAGE player needs to reach
 * this rating with the effort this player actually spent.
 *
 *   ii = gamesToReach(rating) / games
 *
 * ii = 1   → improving like the average player
 * ii = 2   → reached this rating in half the games
 * ii = 0.5 → needed twice as many games as average
 *
 * @param {{rating:number, games:number, provisional:boolean}} perf
 * @param {{r0:number, a:number, g0:number}} baseline
 */
export function computeIndicator(perf, baseline) {
  const { rating, games, provisional } = perf;
  const expected = expectedRating(baseline, games);

  if (provisional || games < MIN_GAMES) {
    return { status: 'insufficient', ii: null, expectedRating: expected, expectedGames: null };
  }

  const expectedGames = gamesToReach(baseline, rating);
  const ii = Math.min(expectedGames / games, MAX_II);
  return { status: 'ok', ii, expectedRating: expected, expectedGames };
}

/**
 * Combine per-time-class indicators into one number.
 * Games-weighted geometric mean: ii is a ratio, so averaging logs is the
 * right thing (2x and 0.5x should average to 1x, not 1.25x).
 * Zero values (rating below the baseline floor) are clamped to a small epsilon.
 */
export function combineIndicators(entries) {
  const ok = entries.filter((e) => e.status === 'ok');
  const totalGames = ok.reduce((s, e) => s + e.games, 0);
  if (totalGames === 0) return null;
  const logSum = ok.reduce((s, e) => s + e.games * Math.log(Math.max(e.ii, 0.01)), 0);
  return Math.exp(logSum / totalGames);
}
