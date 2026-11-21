import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BAND, difficulty, expectedScore, getBaseline, improvement, typicalRating } from '../src/core/baseline.js';
import { MIN_GAMES, combineIndicators, computeIndicator } from '../src/core/indicator.js';
import { applyPageRatings, buildReport } from '../src/core/report.js';
import { normalizeChesscom } from '../src/providers/chesscom.js';
import { normalizeLichess } from '../src/providers/lichess.js';

// Hand-made model: typical 1300 → 1900 over 30 → 30000 games, start 900,
// difficulty from a normal distribution (mean 1500, sd 300).
const normT = (r) => {
  const z = (r - 1500) / 300;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return -Math.log(z > 0 ? p : 1 - p);
};
const blitz = {
  curve: [[30, 1300], [300, 1500], [3000, 1700], [30000, 1900]],
  start: 900,
  difficulty: Array.from({ length: 81 }, (_, i) => [i * 50, normT(i * 50)]),
  reliableMax: 2500,
};

test('every supported time class has a baseline of the current shape', () => {
  for (const tc of ['bullet', 'blitz', 'rapid', 'classical']) assert.ok(getBaseline('lichess', tc)?.curve.length);
  for (const tc of ['bullet', 'blitz', 'rapid']) assert.ok(getBaseline('chesscom', tc)?.difficulty.length);
});

test('typical rating interpolates in log-games and clamps outside the curve', () => {
  assert.equal(typicalRating(blitz, 300), 1500);
  assert.ok(Math.abs(typicalRating(blitz, Math.sqrt(300 * 3000)) - 1600) < 1e-9);
  assert.equal(typicalRating(blitz, 10), 1300);
  // past the last point the upper trend continues (≈ 200 per ×10 games here)
  const far = typicalRating(blitz, 300000);
  assert.ok(far > 1900 && Math.abs(far - 2100) < 20, `extrapolated ${far}`);
});

test('ii is 1 at the typical rating, linear inside the band', () => {
  const at = (r) => improvement(blitz, r, 3000).ii;
  assert.ok(Math.abs(at(1700) - 1) < 1e-9);
  assert.ok(Math.abs(at(1300) - 0.5) < 1e-9); // (1300-900)/(1700-900)
  assert.ok(Math.abs(at(1700 + BAND) - (1700 + BAND - 900) / 800) < 1e-9);
  assert.equal(at(800), 0, 'never negative');
});

test('ii is continuous and increasing, and Elo above the band weighs more', () => {
  const at = (r) => improvement(blitz, r, 3000).ii;
  let prev = -1;
  for (let r = 900; r <= 3200; r += 10) {
    const v = at(r);
    assert.ok(v > prev, `increasing at ${r}`);
    assert.ok(v - prev < 0.5 || prev < 0, `no jump at ${r}`);
    prev = v;
  }
  const step = (r) => at(r + 100) - at(r);
  assert.ok(step(2400) > step(2000) && step(2000) > step(1300), 'higher Elo is worth more');
});

test('more experience lowers ii for the same rating', () => {
  assert.ok(improvement(blitz, 2000, 300).ii > improvement(blitz, 2000, 30000).ii);
});

test('flags and expected score', () => {
  assert.ok(improvement(blitz, 850, 3000).flags.belowStart);
  assert.ok(improvement(blitz, 2600, 3000).flags.extrapolated);
  assert.ok(improvement(blitz, 1700, 1e6).flags.beyondExperience);
  assert.ok(Math.abs(expectedScore(1700, 1700) - 0.5) < 1e-12);
  assert.ok(Math.abs(expectedScore(2100, 1700) - 10 / 11) < 1e-12);
  assert.ok(difficulty(blitz, 2000) > difficulty(blitz, 1500));
});

test('too few games or provisional → insufficient', () => {
  assert.equal(computeIndicator({ rating: 1800, games: MIN_GAMES - 1, provisional: false }, blitz).status, 'insufficient');
  assert.equal(computeIndicator({ rating: 1800, games: 500, provisional: true }, blitz).status, 'insufficient');
});

test('combine is a games-weighted geometric mean', () => {
  const combined = combineIndicators([
    { status: 'ok', ii: 2, games: 100 },
    { status: 'ok', ii: 0.5, games: 100 },
    { status: 'insufficient', ii: null, games: 5 },
  ]);
  assert.ok(Math.abs(combined - 1) < 1e-9);
  assert.equal(combineIndicators([]), null);
});

test('lichess normalizer (shape from the official API docs)', () => {
  const p = normalizeLichess({
    username: 'Bobby',
    perfs: {
      bullet: { games: 67, rating: 1675, rd: 53, prog: -13 },
      blitz: { games: 22, rating: 1844, rd: 115, prog: 38, prov: true },
      chess960: { games: 5, rating: 1500, rd: 200 },
    },
    playTime: { total: 12865, tv: 0 },
  });
  assert.deepEqual(Object.keys(p.perfs), ['bullet', 'blitz']);
  assert.equal(p.perfs.blitz.provisional, true);
  assert.equal(p.playTimeSeconds, 12865);
  assert.throws(() => normalizeLichess({ username: 'x', closed: true }), { code: 'closed' });
});

test('chess.com normalizer (shape from the PubAPI docs)', () => {
  const p = normalizeChesscom('someone', {
    chess_blitz: { last: { rating: 1200, date: 1, rd: 60 }, best: { rating: 1300 }, record: { win: 300, loss: 250, draw: 50 } },
    chess_daily: { last: { rating: 1400, rd: 80 }, record: { win: 10, loss: 2, draw: 0 } },
  });
  assert.deepEqual(p.perfs, { blitz: { rating: 1200, games: 600, provisional: false } });
  assert.equal(p.playTimeSeconds, null);
});

test('buildReport end to end', () => {
  const report = buildReport(normalizeChesscom('someone', {
    chess_blitz: { last: { rating: 1200, rd: 60 }, record: { win: 300, loss: 250, draw: 50 } },
    chess_rapid: { last: { rating: 1000, rd: 200 }, record: { win: 3, loss: 2, draw: 0 } },
  }));
  assert.equal(report.classes.length, 2);
  assert.equal(report.classes[1].status, 'insufficient');
  assert.ok(report.overall > 0);
  assert.equal(report.playtime.estimated, true);
});

test('page ratings replace API ratings, only for known time classes and plausible values', () => {
  const player = { platform: 'chesscom', username: 'x', playTimeSeconds: null, perfs: {
    blitz: { rating: 1181, games: 858, provisional: false }, rapid: { rating: 1197, games: 71, provisional: false } } };
  const { player: p, applied } = applyPageRatings(player, { blitz: 1205, bullet: 1093, rapid: 99999 });
  assert.equal(applied, true);
  assert.equal(p.perfs.blitz.rating, 1205);
  assert.equal(p.perfs.blitz.games, 858, 'game counts stay from the API');
  assert.equal(p.perfs.rapid.rating, 1197, 'implausible value ignored');
  assert.equal(p.perfs.bullet, undefined, 'no new time classes invented');
  assert.equal(player.perfs.blitz.rating, 1181, 'input not mutated');
  assert.equal(applyPageRatings(player, null).applied, false);
  assert.equal(applyPageRatings(player, { blitz: 1181 }).applied, false);
});
