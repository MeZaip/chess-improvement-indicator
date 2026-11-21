import assert from 'node:assert/strict';
import { test } from 'node:test';

import { difficulty, improvement } from '../src/core/baseline.js';
import { fitDifficulty, fitTypicalCurve, isotonic, median, normSf, normSfInv, quantile } from '../tools/lib/fit.js';

// Deterministic RNG + normal noise so the tests are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// Synthetic population: typical rating grows with log(games), spread 250.
const trueTypical = (g) => 1200 + 70 * Math.log(g / 30);
function synthetic(n, seed = 1) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const games = Math.round(30 * Math.exp(rng() * Math.log(2000))); // 30 … 60000
    return { games, rating: Math.round(trueTypical(games) + 250 * gaussian(rng)) };
  });
}

test('helpers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.deepEqual(isotonic([1, 3, 2, 4], [1, 1, 1, 1]), [1, 2.5, 2.5, 4]);
  for (const p of [0.5, 0.1, 0.01, 1e-6]) assert.ok(Math.abs(normSf(normSfInv(p)) - p) / p < 1e-4);
});

test('experience curve recovers the typical rating and is monotone', () => {
  const fit = fitTypicalCurve(synthetic(8000), { minGames: 30 });
  assert.ok(fit);
  for (let i = 1; i < fit.curve.length; i++) assert.ok(fit.curve[i][1] >= fit.curve[i - 1][1]);
  for (const [g, r] of fit.curve) assert.ok(Math.abs(r - trueTypical(g)) < 40, `at ${g}: ${r} vs ${trueTypical(g).toFixed(0)}`);
  // start level ≈ p10 of beginners ≈ typical(~40) − 1.28·250
  assert.ok(Math.abs(fit.start - (trueTypical(40) - 320)) < 80, `start ${fit.start}`);
});

test('difficulty scale matches −ln P(rating ≥ r), with a continuous tail', () => {
  const rng = mulberry32(5);
  const ratings = Array.from({ length: 5000 }, () => 1500 + 300 * gaussian(rng));
  const { knots, reliableMax } = fitDifficulty(ratings);
  const b = { difficulty: knots };
  for (const r of [1200, 1500, 1800, 2100]) {
    const want = -Math.log(normSf((r - 1500) / 300));
    assert.ok(Math.abs(difficulty(b, r) - want) < 0.12, `t(${r}) = ${difficulty(b, r).toFixed(3)} vs ${want.toFixed(3)}`);
  }
  assert.ok(reliableMax > 2100 && reliableMax < 2700);
  // no jump where the fitted tail takes over, and it keeps getting steeper
  const slope = (r) => difficulty(b, r + 25) - difficulty(b, r);
  assert.ok(Math.abs(slope(reliableMax - 25) - slope(reliableMax)) < 0.1);
  assert.ok(slope(reliableMax + 300) > slope(reliableMax - 300));
});

test('end to end: ii over the synthetic population is centred on 1', () => {
  const pts = synthetic(8000, 9);
  const fit = fitTypicalCurve(pts, { minGames: 30 });
  const { knots, reliableMax } = fitDifficulty(pts.map((p) => p.rating));
  const baseline = { curve: fit.curve, start: fit.start, difficulty: knots, reliableMax };
  const iis = pts.map((p) => improvement(baseline, p.rating, p.games).ii).sort((a, b) => a - b);
  const med = quantile(iis, 0.5);
  assert.ok(Math.abs(med - 1) < 0.08, `median ii ${med}`);
  assert.ok(quantile(iis, 0.9) > 1.3 && quantile(iis, 0.1) < 0.8);
});

test('too little data → null', () => {
  assert.equal(fitTypicalCurve(synthetic(100), { minGames: 30 }), null);
});

test('weighted quantile, weighted difficulty and activity weights', async () => {
  const { weightedQuantile } = await import('../tools/lib/fit.js');
  const { activityWeights } = await import('../tools/lib/weights.js');
  assert.equal(weightedQuantile([{ v: 1 }, { v: 2 }, { v: 3 }], 0.5), 2);
  assert.equal(weightedQuantile([{ v: 1, w: 10 }, { v: 2, w: 1 }, { v: 3, w: 1 }], 0.5), 1);

  // two equal-size groups; weighting the low group up makes high ratings rarer
  const ratings = [...Array(500).fill(1200), ...Array(500).fill(2000)];
  const plain = fitDifficulty(ratings);
  const weighted = fitDifficulty(ratings, { weights: ratings.map((r) => (r === 1200 ? 4 : 1)) });
  const at = (k, r) => difficulty({ difficulty: k.knots }, r);
  assert.ok(at(weighted, 1800) > at(plain, 1800));

  const now = Date.parse('2026-11-20T00:00:00Z');
  const mk = (games, ageDays) => ({ perfs: { blitz: { games } }, createdAt: now - ageDays * 864e5, collectedAt: new Date(now).toISOString() });
  const grinder = mk(36500, 365), casual = mk(365, 365), noData = { perfs: { blitz: { games: 10 } } };
  const w = activityWeights([grinder, casual, ...Array(20).fill(0).map((_, i) => mk(365 * (i + 1), 365)), noData]);
  assert.ok(w(casual) > w(grinder) * 10, 'rare players count more');
  assert.ok(w(noData) > 0);
});
