import assert from 'node:assert/strict';
import { test } from 'node:test';

import { effectiveGames } from '../src/core/effort.js';
import { chesscomLinksFromLichessProfile, lichessConfirmsChesscom, linkedChesscomName } from '../src/core/linking.js';
import { buildReport } from '../src/core/report.js';
import { normalizeLichess } from '../src/providers/lichess.js';
import { createClient } from '../tools/lib/http.js';
import { linkRecords } from '../tools/lib/link.js';

test('finds chess.com links in Lichess profile links and bio', () => {
  assert.deepEqual(chesscomLinksFromLichessProfile({ links: 'github.com/x\r\nhttps://www.chess.com/member/Some_Guy' }), ['some_guy']);
  assert.deepEqual(chesscomLinksFromLichessProfile({ bio: 'also on chess.com/players/abc-12 :)' }), ['abc-12']);
  assert.deepEqual(chesscomLinksFromLichessProfile({ links: 'twitter.com/x', bio: 'hi' }), []);
  assert.deepEqual(chesscomLinksFromLichessProfile(undefined), []);
  assert.equal(linkedChesscomName({ links: 'chess.com/member/a1b\nchess.com/member/c2d' }), null, 'ambiguous');
  assert.ok(lichessConfirmsChesscom({ links: 'chess.com/member/Foo' }, 'FOO'));
});

test('normalizeLichess exposes links and createdAt', () => {
  const p = normalizeLichess({ username: 'X', createdAt: 123, perfs: {}, profile: { links: 'chess.com/member/xx_chess' } });
  assert.deepEqual(p.chesscomLinks, ['xx_chess']);
  assert.equal(p.createdAt, 123);
});

test('effective games add the linked account', () => {
  const own = { blitz: { games: 1000 }, bullet: { games: 500 } };
  const other = { blitz: { games: 300 }, bullet: { games: 200 }, rapid: { games: 50 } };
  assert.equal(effectiveGames(own, 'blitz', { bullet: 1, rapid: 0, classical: 0 }, other), 1000 + 300 + 500 + 200);
});

test('only confirmed accounts are counted in the report', () => {
  const player = { platform: 'lichess', username: 'p', playTimeSeconds: null, perfs: { blitz: { rating: 1700, games: 1000, provisional: false } } };
  const other = { platform: 'chesscom', username: 'p', perfs: { blitz: { rating: 1300, games: 3000, provisional: false } } };
  const blitz = (r) => r.classes.find((c) => c.timeClass === 'blitz');

  const possible = buildReport(player, { ...other, status: 'possible' });
  assert.equal(blitz(possible).effectiveGames, 1000);
  assert.deepEqual(possible.linked, { platform: 'chesscom', username: 'p', status: 'possible', counted: false, games: 3000 });

  const confirmed = buildReport(player, { ...other, status: 'confirmed' });
  assert.equal(blitz(confirmed).effectiveGames, 4000);
  assert.ok(blitz(confirmed).ii < blitz(possible).ii);
  assert.equal(buildReport(player).linked, null);
});

const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const fake = (handler) => createClient({ minIntervalMs: 0, sleep: async () => {}, log: () => {}, fetchImpl: async (u, i) => handler(u, i) });

test('tools/link: lichess sample → refetch profiles → linked chess.com stats', async () => {
  const lichess = fake((url, init) => {
    assert.equal(url, 'https://lichess.org/api/users');
    return json(init.body.split(',').map((id) => ({
      id, username: id, createdAt: 1,
      profile: id === 'a' ? { links: 'chess.com/member/A_cc' } : id === 'b' ? { bio: 'no links' } : undefined,
    })));
  });
  const chesscom = fake((url) => {
    assert.match(url, /player\/a_cc\/stats$/);
    return json({ chess_blitz: { last: { rating: 1500, rd: 50 }, record: { win: 10, loss: 10, draw: 0 } } });
  });
  const records = [{ username: 'a', perfs: {} }, { username: 'b', perfs: {} }, { username: 'c', perfs: {}, linkCheckedAt: 'x' }];
  const res = await linkRecords('lichess', records, { lichess, chesscom }, { log: () => {} });
  assert.deepEqual(res, { checked: 2, linked: 1, pending: 0 });
  assert.equal(records[0].linked.username, 'a_cc');
  assert.equal(records[0].linked.perfs.blitz.games, 20);
  assert.equal(records[1].linked, null);
  assert.equal(records[2].linked, undefined, 'already checked records are skipped');
});

test('tools/link: chess.com sample → same name on Lichess only if it links back', async () => {
  const lichess = fake((_url, init) => json(init.body.split(',').map((id) => ({
    id, username: id,
    perfs: { blitz: { games: 50, rating: 1600 } },
    profile: id === 'yes' ? { links: 'https://chess.com/member/yes' } : { links: 'chess.com/member/someoneelse' },
  }))));
  const records = [{ username: 'yes', perfs: {} }, { username: 'no', perfs: {} }];
  const res = await linkRecords('chesscom', records, { lichess, chesscom: null }, { log: () => {} });
  assert.deepEqual(res, { checked: 2, linked: 1, pending: 0 });
  assert.equal(records[0].linked.platform, 'lichess');
  assert.equal(records[1].linked, null);
});

test('tools/link: failed lookups stay unchecked so a re-run retries them', async () => {
  const lichessDown = fake(() => new Response('', { status: 429 }));
  const cc = [{ username: 'x', perfs: {} }];
  await assert.rejects(linkRecords('chesscom', cc, { lichess: lichessDown, chesscom: null }, { log: () => {} }), { code: 'rate_limited' });
  assert.equal(cc[0].linkCheckedAt, undefined);

  const lichessUp = fake((_u, init) => json(init.body.split(',').map((id) => ({ id, username: id, profile: { links: `chess.com/member/${id}00` } }))));
  const chesscomDown = fake(() => new Response('', { status: 503 }));
  const li = [{ username: 'y', perfs: {} }];
  const r2 = await linkRecords('lichess', li, { lichess: lichessUp, chesscom: chesscomDown }, { log: () => {} });
  assert.equal(r2.pending, 1);
  assert.equal(li[0].linkCheckedAt, undefined);
  assert.deepEqual(li[0].chesscomLinks, ['y00'], 'profile data is kept for the next run');
});

test('a confirmed linked account lowers the minimum games on this site', () => {
  const player = { platform: 'lichess', username: 'p', playTimeSeconds: null, perfs: { rapid: { rating: 1519, games: 23, provisional: false } } };
  const other = { platform: 'chesscom', username: 'p', perfs: { rapid: { rating: 900, games: 1345, provisional: false } } };
  const rapid = (r) => r.classes.find((c) => c.timeClass === 'rapid');

  const alone = rapid(buildReport(player));
  assert.equal(alone.status, 'insufficient');
  assert.equal(alone.reason, 'few_games');
  assert.equal(alone.minGames, 30);

  const possible = rapid(buildReport(player, { ...other, status: 'possible' }));
  assert.equal(possible.status, 'insufficient', 'unconfirmed accounts change nothing');

  const linked = rapid(buildReport(player, { ...other, status: 'confirmed' }));
  assert.equal(linked.status, 'ok');
  assert.equal(linked.effectiveGames, 23 + 1345);

  const prov = rapid(buildReport({ ...player, perfs: { rapid: { rating: 1519, games: 23, provisional: true } } }, { ...other, status: 'confirmed' }));
  assert.equal(prov.reason, 'provisional');
});
