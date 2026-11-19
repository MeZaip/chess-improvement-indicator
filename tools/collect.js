#!/usr/bin/env node
// Collect a calibration sample of players.
//
//   node tools/collect.js lichess  [--target 5000] [--seeds a,b,c]
//   node tools/collect.js chesscom [--target 5000] [--countries RO,DE,FR]
//   node tools/collect.js <platform> --tail     add strong players (leaderboards /
//                                               titled) so the high-rating end of
//                                               the baseline has enough data
//
// Output: data/raw/<platform>.jsonl (one player per line).
// Resumable: run it again (same or bigger --target) and it continues,
// skipping players already in the file. Ctrl+C is safe.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULT_COUNTRIES, collectChesscom, collectChesscomTail } from './collectors/chesscom.js';
import { collectLichess, collectLichessTail } from './collectors/lichess.js';
import { createClient } from './lib/http.js';

const PLATFORMS = {
  // Lichess asks for one request at a time; on 429 wait a full minute.
  lichess: {
    collect: collectLichess,
    tail: collectLichessTail,
    // optional LICHESS_TOKEN (personal token, no scopes needed) → higher limits
    client: { minIntervalMs: 1000, rateLimitWaitMs: 60_000, authToken: process.env.LICHESS_TOKEN },
  },
  chesscom: { collect: collectChesscom, tail: collectChesscomTail, client: { minIntervalMs: 250, rateLimitWaitMs: 10_000 } },
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: '5000' },
    seeds: { type: 'string' },
    countries: { type: 'string' },
    out: { type: 'string' },
    tail: { type: 'boolean', default: false },
  },
});

const platform = positionals[0];
const cfg = PLATFORMS[platform];
if (!cfg) {
  console.error('usage: node tools/collect.js <lichess|chesscom> [--target N] [--seeds a,b] [--countries RO,DE] [--tail]');
  process.exit(1);
}

const target = Number(values.target);
const outFile = values.out ?? path.join('data', 'raw', `${platform}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });

// Resume: everyone already in the file counts and is skipped.
// Only the random sample counts towards --target (tail players don't).
const seen = new Set();
let already = 0;
if (fs.existsSync(outFile)) {
  for (const line of fs.readFileSync(outFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    seen.add(rec.username.toLowerCase());
    if ((rec.source ?? 'random') === 'random') already++;
  }
}
if (values.tail) {
  console.error(`adding high-rating tail for ${platform} into ${outFile}`);
  const emitTail = (record) => fs.appendFileSync(outFile, JSON.stringify({ ...record, collectedAt: new Date().toISOString() }) + '\n');
  await cfg.tail({ client: createClient(cfg.client), seen, emit: emitTail });
  process.exit(0);
}
if (already >= target) {
  console.error(`${outFile} already has ${already} players (target ${target}). Nothing to do.`);
  process.exit(0);
}

console.error(`collecting ${platform}: ${already} → ${target} players into ${outFile}`);
const started = Date.now();
let count = already;

const emit = (record) => {
  fs.appendFileSync(outFile, JSON.stringify({ ...record, collectedAt: new Date().toISOString() }) + '\n');
  count++;
  if (count % 50 === 0) {
    const rate = (count - already) / ((Date.now() - started) / 1000);
    const eta = rate > 0 ? Math.round((target - count) / rate / 60) : '?';
    console.error(`  ${count}/${target}  (${rate.toFixed(1)}/s, ~${eta} min left)`);
  }
};

process.on('SIGINT', () => {
  console.error(`\nstopped at ${count} players – run the same command again to resume.`);
  process.exit(0);
});

try {
  await cfg.collect({
    client: createClient(cfg.client),
    target,
    seen,
    count: already,
    emit,
    seeds: values.seeds?.split(','),
    countries: values.countries?.split(',') ?? DEFAULT_COUNTRIES,
  });
  console.error(`done: ${count} players in ${outFile}`);
} catch (err) {
  console.error(`error: ${err.message} (progress is saved, run again to resume)`);
  process.exit(1);
}
