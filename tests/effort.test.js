import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultTransfer, effectiveGames } from '../src/core/effort.js';
import { combineIndicators } from '../src/core/indicator.js';
import { buildReport } from '../src/core/report.js';
import { fitTransfer } from '../tools/lib/fit.js';

const TCS = ['bullet', 'blitz', 'rapid', 'classical'];

test('default transfer: faster time classes count fully, slower not at all', () => {
  assert.deepEqual(defaultTransfer('rapid'), { bullet: 1, blitz: 1, classical: 0 });
  assert.deepEqual(defaultTransfer('bullet'), { blitz: 0, rapid: 0, classical: 0 });
});

test('effective games', () => {
  const perfs = { bullet: { games: 1000 }, blitz: { games: 400 }, rapid: { games: 100 } };
  assert.equal(effectiveGames(perfs, 'rapid'), 1500);
  assert.equal(effectiveGames(perfs, 'bullet'), 1000);
  assert.equal(effectiveGames(perfs, 'rapid', { bullet: 0.5, blitz: 0 }), 600);
});

test('headline is weighted by time, not by game count', () => {
  // 1000 bullet games (~2 min) vs 100 rapid games (~20 min): equal time → plain geometric mean
  const c = combineIndicators([
    { status: 'ok', ii: 4, games: 1000, weight: 1000 * 120 },
    { status: 'ok', ii: 1, games: 100, weight: 100 * 1200 },
  ]);
  assert.ok(Math.abs(c - 2) < 1e-9);
});

test('report uses effective games: a blitz grinder does not get a huge rapid ii', () => {
  const grinder = {
    platform: 'lichess', username: 'g', playTimeSeconds: null,
    perfs: { blitz: { rating: 1800, games: 5000, provisional: false }, rapid: { rating: 1800, games: 100, provisional: false } },
  };
  const rapid = buildReport(grinder).classes.find((c) => c.timeClass === 'rapid');
  assert.equal(rapid.effectiveGames, 5100);
  assert.equal(rapid.games, 100);
});

test('fitTransfer recovers which time classes matter', () => {
  let seed = 3;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const samples = Array.from({ length: 3000 }, () => {
    const g = { bullet: Math.round(Math.exp(3 + 6 * rng())), blitz: Math.round(Math.exp(3 + 6 * rng())), rapid: Math.round(Math.exp(3.5 + 4 * rng())) };
    // truth: rapid rating driven by rapid + blitz, bullet irrelevant
    const rating = 900 + 120 * Math.log(g.rapid + g.blitz) + 60 * gauss();
    return { perfs: { bullet: { rating: 1500, games: g.bullet }, blitz: { rating: 1500, games: g.blitz }, rapid: { rating, games: g.rapid, provisional: false } } };
  });
  const fit = fitTransfer(samples, 'rapid', TCS, { minGames: 30 });
  assert.ok(fit.transfer.blitz >= 0.75, JSON.stringify(fit.transfer));
  assert.ok(fit.transfer.bullet <= 0.1, JSON.stringify(fit.transfer));
  assert.ok(fit.r2 > fit.r2Own);
  assert.equal(fitTransfer(samples.slice(0, 100), 'rapid', TCS), null);
});

test('effortParts explains the extra effective games', async () => {
  const { effortParts } = await import('../src/core/effort.js');
  const perfs = { bullet: { games: 1965 }, blitz: { games: 7709 }, rapid: { games: 1918 } };
  const transfer = { bullet: 0.3, rapid: 0.05, classical: 0 };
  const parts = effortParts(perfs, 'blitz', transfer);
  assert.deepEqual(parts.map((p) => [p.timeClass, p.games, p.weight]), [['bullet', 1965, 0.3], ['rapid', 1918, 0.05]]);
  const extra = parts.reduce((s, p) => s + p.games * p.weight, 0);
  assert.ok(Math.abs(extra - (effectiveGames(perfs, 'blitz', transfer) - 7709)) < 1e-9);
  assert.equal(Math.round(extra), 685);
  const linked = effortParts(perfs, 'blitz', transfer, { blitz: { games: 50 }, bullet: { games: 10 } });
  assert.ok(linked.some((p) => p.linked && p.timeClass === 'blitz' && p.weight === 1));
});
