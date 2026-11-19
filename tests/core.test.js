import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expectedRating, gamesToReach, getBaseline } from '../src/core/baseline.js';
import { MIN_GAMES, combineIndicators, computeIndicator } from '../src/core/indicator.js';
import { buildReport } from '../src/core/report.js';
import { normalizeChesscom } from '../src/providers/chesscom.js';
import { normalizeLichess } from '../src/providers/lichess.js';

const blitz = getBaseline('lichess', 'blitz');

test('gamesToReach is the inverse of expectedRating', () => {
  for (const g of [10, 100, 1000, 10000]) {
    assert.ok(Math.abs(gamesToReach(blitz, expectedRating(blitz, g)) - g) < 1e-6);
  }
});

test('an exactly-average player has ii = 1', () => {
  const games = 1000;
  const r = computeIndicator({ rating: expectedRating(blitz, games), games, provisional: false }, blitz);
  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(r.ii - 1) < 1e-9);
});

test('reaching the average rating in half the games gives ii = 2', () => {
  const rating = expectedRating(blitz, 2000);
  const r = computeIndicator({ rating, games: 1000, provisional: false }, blitz);
  assert.ok(Math.abs(r.ii - 2) < 1e-9);
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
