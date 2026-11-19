// Fitting the ii model (see src/core/baseline.js) from a RANDOM sample.
//
// Only the random sample is used: leaderboard / titled players are a
// different population (strong OTB players with few online games) and
// distort both the experience curve and the rating distribution.

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

// Weighted pool-adjacent-violators: closest non-decreasing sequence.
export function isotonic(values, weights) {
  const blocks = [];
  values.forEach((v, i) => {
    blocks.push({ v, w: weights[i], len: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
      const b = blocks.pop();
      const a = blocks[blocks.length - 1];
      a.v = (a.v * a.w + b.v * b.w) / (a.w + b.w);
      a.w += b.w;
      a.len += b.len;
    }
  });
  return blocks.flatMap((b) => Array(b.len).fill(b.v));
}

// ---------------------------------------------------------------------------
// 1) Experience curve: median rating per bucket of effective games.

/**
 * @param {{rating:number, games:number}[]} points  games = effective games
 * @returns {null | {curve:[number,number][], start:number, bins:object[], n:number}}
 */
export function fitTypicalCurve(points, { minGames = 30, ratio = 1.6, minBin = 15, minPlayers = 200, minBins = 4 } = {}) {
  const usable = points.filter((p) => p.games >= minGames);
  if (usable.length < minPlayers) return null;

  const groups = new Map();
  for (const p of usable) {
    const k = Math.floor(Math.log(p.games / minGames) / Math.log(ratio));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const raw = [...groups.entries()].sort(([a], [b]) => a - b).map(([, ps]) => ps).filter((ps) => ps.length >= minBin);
  if (raw.length < minBins) return null;

  const bins = raw.map((ps) => {
    const rs = ps.map((p) => p.rating).sort((a, b) => a - b);
    return { games: median(ps.map((p) => p.games)), medianRating: quantile(rs, 0.5), p25: quantile(rs, 0.25), p75: quantile(rs, 0.75), n: ps.length };
  });
  const iso = isotonic(bins.map((b) => b.medianRating), bins.map((b) => b.n));
  bins.forEach((b, i) => (b.typical = iso[i]));

  // Start level: weak beginners = p10 of the two least-experienced buckets.
  const beginners = [...raw[0], ...(raw[1] ?? [])].map((p) => p.rating).sort((a, b) => a - b);
  const start = Math.round(quantile(beginners, 0.1));

  return {
    curve: bins.map((b) => [Math.round(b.games), Math.round(b.typical)]),
    start,
    bins,
    n: usable.length,
  };
}

// ---------------------------------------------------------------------------
// 2) Difficulty scale: t(r) = −ln P(rating ≥ r), kernel-smoothed.

// Complementary error function (Numerical Recipes erfcc, |error| < 1.2e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normSf = (z) => 0.5 * erfc(z / Math.SQRT2);

// Inverse of normSf (bisection; plenty fast for a handful of calls).
export function normSfInv(p) {
  let lo = -40, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normSf(mid) > p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * @param {number[]} ratings  one rating per player (random sample)
 * @returns {{knots:[number,number][], reliableMax:number}}
 */
export function fitDifficulty(ratings, { step = 25, bandwidth = 50, tailMin = 30, extendBy = 600 } = {}) {
  const xs = [...ratings].sort((a, b) => a - b);
  const n = xs.length;

  // smoothed survival function: average of normal kernels around each rating
  const sfSmooth = (r) => {
    let s = 0;
    for (const x of xs) s += normSf((r - x) / bandwidth);
    return (s + 0.5) / (n + 1);
  };

  // where the data gets thin: fewer than `tailMin` players at or above r
  const reliableMax = xs[Math.max(0, n - tailMin)];

  // normal tail anchored at q80 and reliableMax, continuous at reliableMax
  const q80 = quantile(xs, 0.8);
  const s1 = sfSmooth(q80), s2 = sfSmooth(reliableMax);
  const z1 = normSfInv(s1), z2 = normSfInv(s2);
  const sigma = z2 > z1 ? (reliableMax - q80) / (z2 - z1) : 200;
  const mu = reliableMax - z2 * sigma;
  const sfTail = (r) => normSf((r - mu) / sigma);

  const from = Math.floor(xs[0] / step) * step;
  const to = Math.ceil((xs[n - 1] + extendBy) / step) * step;
  const knots = [];
  for (let r = from; r <= to; r += step) {
    const sf = r <= reliableMax ? sfSmooth(r) : sfTail(r);
    knots.push([r, Math.round(-Math.log(Math.max(sf, 1e-300)) * 1e4) / 1e4]);
  }
  // numerical safety: keep t non-decreasing
  for (let i = 1; i < knots.length; i++) if (knots[i][1] < knots[i - 1][1]) knots[i][1] = knots[i - 1][1];
  return { knots, reliableMax: Math.round(reliableMax) };
}

// ---------------------------------------------------------------------------
// 3) Transfer between time classes (see src/core/effort.js).

function r2(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
}

export const TRANSFER_GRID = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

/**
 * Find weights w_Y ∈ [0, 1] such that ln(games_X + Σ w_Y·games_Y) explains
 * the rating in X best (R², coordinate descent on a grid).
 *
 * Weights are capped at 1 on purpose: unconstrained, the fit says a bullet
 * game is worth 10 blitz games, which is reverse causation (strong players
 * play lots of bullet), not transfer.
 *
 * @param {{perfs:Record<string,{rating,games,provisional}>}[]} samples
 * @returns {{transfer:Record<string,number>, r2Own:number, r2:number, n:number} | null}
 */
export function fitTransfer(samples, timeClass, timeClasses, { minGames = 30, minPlayers = 500, grid = TRANSFER_GRID, rounds = 4 } = {}) {
  const ps = samples.filter((s) => {
    const p = s.perfs?.[timeClass];
    return p && !p.provisional && p.games >= minGames;
  });
  if (ps.length < minPlayers) return null;

  const others = timeClasses.filter((t) => t !== timeClass);
  const ys = ps.map((s) => s.perfs[timeClass].rating);
  const g = (s, t) => s.perfs[t]?.games ?? 0;
  const score = (w) =>
    r2(ps.map((s) => Math.log(g(s, timeClass) + others.reduce((acc, t) => acc + w[t] * g(s, t), 0))), ys);

  let w = Object.fromEntries(others.map((t) => [t, 0]));
  const r2Own = score(w);
  let best = r2Own;
  for (let it = 0; it < rounds; it++) {
    let improved = false;
    for (const t of others) {
      for (const v of grid) {
        const cand = { ...w, [t]: v };
        const s = score(cand);
        if (s > best + 1e-9) { best = s; w = cand; improved = true; }
      }
    }
    if (!improved) break;
  }
  return { transfer: w, r2Own, r2: best, n: ps.length };
}
