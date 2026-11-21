// Sampling weights for the Lichess calibration sample.
//
// Lichess players were found as opponents in recent games, so a player's
// chance of being sampled grows with how often they play. Weighting each
// player by 1 / (rated games per day since the account was created) undoes
// most of that. Rates are clipped to the 5th–95th percentile so a handful of
// extreme accounts can't dominate. Players without the needed data get the
// median weight.

const TIME_CLASSES = ['bullet', 'blitz', 'rapid', 'classical'];
const DAY = 864e5;

function playRate(s) {
  const at = Date.parse(s.collectedAt);
  if (!s.createdAt || !Number.isFinite(at)) return null;
  const days = Math.max(30, (at - s.createdAt) / DAY);
  const games = TIME_CLASSES.reduce((n, t) => n + (s.perfs?.[t]?.games ?? 0), 0);
  return games > 0 ? games / days : null;
}

/** @returns {(sample) => number} weight function for the given samples */
export function activityWeights(samples) {
  const rates = samples.map(playRate).filter((r) => r != null).sort((a, b) => a - b);
  if (rates.length === 0) return () => 1;
  const q = (x) => rates[Math.floor((rates.length - 1) * x)];
  const lo = q(0.05), hi = q(0.95), mid = q(0.5);
  const cache = new Map();
  return (s) => {
    if (!cache.has(s)) {
      const r = playRate(s) ?? mid;
      cache.set(s, mid / Math.min(Math.max(r, lo), hi)); // normalised: median player = 1
    }
    return cache.get(s);
  };
}
