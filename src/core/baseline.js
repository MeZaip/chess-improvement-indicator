// Baseline model: the rating an AVERAGE player has after `g` games
// in a given platform + time class.
//
//   expectedRating(g) = r0 + a * ln(1 + g / g0)
//
//   r0 – rating level after the provisional period (where people "settle")
//   a  – how many points the average player gains per e-fold of games
//   g0 – how many games it takes before the log curve kicks in
//
// The inverse tells us how many games the average player needs to reach
// rating r:
//
//   gamesToReach(r) = g0 * (exp((r - r0) / a) - 1)
//
// !!! The numbers below are HAND-PICKED PLACEHOLDERS so the pipeline works
// end to end. They must be replaced by values fitted on a real sample of
// players (see README → "Calibration"). Lichess (Glicko-2, starts at 1500)
// and chess.com (Glicko, self-selected start) are on different scales, so
// each platform has its own parameters.

export const BASELINE_VERSION = 'placeholder-0';

export const BASELINES = {
  lichess: {
    bullet:    { r0: 1350, a: 160, g0: 250 },
    blitz:     { r0: 1350, a: 150, g0: 200 },
    rapid:     { r0: 1400, a: 140, g0: 150 },
    classical: { r0: 1450, a: 130, g0: 80 },
  },
  chesscom: {
    bullet:    { r0: 600, a: 190, g0: 200 },
    blitz:     { r0: 650, a: 180, g0: 150 },
    rapid:     { r0: 650, a: 170, g0: 100 },
  },
};

export function getBaseline(platform, timeClass) {
  return BASELINES[platform]?.[timeClass] ?? null;
}

export function expectedRating({ r0, a, g0 }, games) {
  return r0 + a * Math.log1p(games / g0);
}

export function gamesToReach({ r0, a, g0 }, rating) {
  if (rating <= r0) return 0;
  return g0 * Math.expm1((rating - r0) / a);
}
