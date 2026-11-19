#!/usr/bin/env node
// Fit the ii model from data/raw/*.jsonl and regenerate src/core/baselineParams.js.
//
//   node tools/fit.js            fit + write params + data/fit-report.json
//   node tools/fit.js --dry-run  only print the report
//
// Uses ONLY the random sample (source "random"); leaderboard / titled
// players are a different population and would bias the model.
// Per platform × time class:
//   1) transfer weights from other time classes (or the default rule)
//   2) experience curve: median rating per bucket of effective games + start level
//   3) difficulty scale from the rating distribution
// Time classes without enough data keep their previous parameters.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { BASELINES, FIT_META, improvement } from '../src/core/baseline.js';
import { defaultTransfer, effectiveGames } from '../src/core/effort.js';
import { MIN_GAMES } from '../src/core/indicator.js';
import { TIME_CLASSES } from '../src/core/timeClasses.js';
import { fitDifficulty, fitTransfer, fitTypicalCurve, quantile } from './lib/fit.js';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'min-players': { type: 'string', default: '200' },
    'min-transfer-players': { type: 'string', default: '500' },
    data: { type: 'string', default: path.join('data', 'raw') },
  },
});

const PLATFORM_TCS = { lichess: ['bullet', 'blitz', 'rapid', 'classical'], chesscom: ['bullet', 'blitz', 'rapid'] };
const PARAMS_FILE = path.join('src', 'core', 'baselineParams.js');
// a time class "has beginners" if its least-experienced bucket is below this
const BEGINNER_MAX_GAMES = 200;
const REPORT_FILE = path.join('data', 'fit-report.json');

const loadSamples = (file) =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const pad = (x, n) => String(x).padStart(n);
const round3 = (x) => Math.round(x * 1000) / 1000;
const linkedPerfs = (s) => (s.linked?.status === 'confirmed' ? s.linked.perfs : null);

// keep only previous entries that already have the current shape
const baselines = {};
for (const [p, tcs] of Object.entries(BASELINES)) {
  baselines[p] = {};
  for (const [tc, b] of Object.entries(tcs)) if (b?.curve && b?.difficulty) baselines[p][tc] = b;
}
const meta = structuredClone(FIT_META);
const report = {};
const fittedAt = new Date().toISOString();
let anyFitted = false;

for (const [platform, tcs] of Object.entries(PLATFORM_TCS)) {
  const file = path.join(values.data, `${platform}.jsonl`);
  const all = loadSamples(file);
  const samples = all.filter((s) => (s.source ?? 'random') === 'random');
  if (samples.length === 0) {
    console.log(`\n${platform}: no data (${file})`);
    continue;
  }
  console.log(`\n${platform}: ${samples.length} random players used (${all.length - samples.length} leaderboard/titled ignored)`);
  report[platform] = {};
  baselines[platform] ??= {};

  // pass 1: transfer + experience curve per time class
  const fits = {};
  for (const tc of tcs) {
    const usable = samples.filter((s) => s.perfs?.[tc] && !s.perfs[tc].provisional && s.perfs[tc].games >= MIN_GAMES);
    const tr = fitTransfer(samples, tc, TIME_CLASSES, { minGames: MIN_GAMES, minPlayers: Number(values['min-transfer-players']) });
    const transfer = tr?.transfer ?? defaultTransfer(tc);
    const points = usable.map((s) => ({
      rating: s.perfs[tc].rating,
      games: effectiveGames(s.perfs, tc, transfer, linkedPerfs(s)),
    }));
    const curveFit = fitTypicalCurve(points, { minGames: MIN_GAMES, minPlayers: Number(values['min-players']) });
    fits[tc] = { usable, tr, transfer, points, curveFit };
  }

  // A time class nobody starts in (e.g. classical: everyone already has
  // thousands of games elsewhere) has no real beginners to define a start
  // level → borrow the lowest start of the time classes that do.
  const hasBeginners = (f) => f.curveFit && f.curveFit.bins[0].games <= BEGINNER_MAX_GAMES;
  const borrowed = Object.values(fits).filter(hasBeginners).map((f) => f.curveFit.start);
  const platformStart = borrowed.length ? Math.min(...borrowed) : null;

  // pass 2: start level, difficulty scale, report
  for (const tc of tcs) {
    const { usable, tr, transfer, points, curveFit } = fits[tc];
    if (!curveFit) {
      console.log(`\n  ${tc.padEnd(9)} not enough data (${usable.length} players) – keeping previous parameters`);
      continue;
    }
    const diff = fitDifficulty(usable.map((s) => s.perfs[tc].rating));
    const startBorrowed = !hasBeginners(fits[tc]) && platformStart != null;

    const baseline = {
      transfer,
      curve: curveFit.curve,
      start: startBorrowed ? platformStart : curveFit.start,
      difficulty: diff.knots,
      reliableMax: diff.reliableMax,
    };

    // how ii is distributed over the sample itself (sanity check)
    const iis = usable
      .map((s, i) => improvement(baseline, s.perfs[tc].rating, points[i].games).ii)
      .sort((a, b) => a - b);
    const iiQ = [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => round3(quantile(iis, q)));

    anyFitted = true;
    baselines[platform][tc] = baseline;
    meta[platform] ??= {};
    meta[platform][tc] = {
      players: curveFit.n,
      transfer: tr ? { r2OwnGames: round3(tr.r2Own), r2Effective: round3(tr.r2) } : 'default (not enough players)',
      iiQuantiles: { p10: iiQ[0], p25: iiQ[1], p50: iiQ[2], p75: iiQ[3], p90: iiQ[4] },
      fittedAt,
    };
    report[platform][tc] = { baseline, bins: curveFit.bins, transfer: tr, iiQuantiles: iiQ };

    // --- printout -----------------------------------------------------------
    const tw = Object.entries(transfer).filter(([, w]) => w > 0).map(([t, w]) => `${t}×${w}`).join(' + ');
    console.log(`\n  ${tc} – ${curveFit.n} players`);
    console.log(
      `    effective games = ${tc}${tw ? ' + ' + tw : ''}` +
        (tr ? `   (R² ${tr.r2Own.toFixed(3)} → ${tr.r2.toFixed(3)})` : '   (default weights – not enough players to fit)'),
    );
    console.log(
      `    start level ${baseline.start}` +
        (startBorrowed ? ` (no beginners here – borrowed; own estimate was ${curveFit.start})` : '') +
        ` · difficulty measured up to ${baseline.reliableMax}, estimated above`,
    );
    console.log('    eff. games   median rating   typical   p25 – p75     players');
    for (const b of curveFit.bins) {
      console.log(
        `    ${pad(Math.round(b.games), 10)}   ${pad(Math.round(b.medianRating), 13)}   ${pad(Math.round(b.typical), 7)}` +
          `   ${pad(Math.round(b.p25), 4)} – ${String(Math.round(b.p75)).padEnd(6)} ${pad(b.n, 6)}`,
      );
    }
    console.log(`    ii over the sample: p10 ${iiQ[0]} · p25 ${iiQ[1]} · median ${iiQ[2]} · p75 ${iiQ[3]} · p90 ${iiQ[4]}`);
    const g = Math.round(curveFit.bins[Math.floor(curveFit.bins.length / 2)].games);
    const T = improvement(baseline, 0, g).typical;
    const examples = [-300, -150, 0, 150, 300, 600, 900].map((d) => Math.round(T + d));
    console.log(
      `    at ${g} games (typical ${Math.round(T)}): ` +
        examples.map((r) => `${r}→${improvement(baseline, r, g).ii.toFixed(2)}x`).join('  '),
    );
  }
}

if (values['dry-run']) {
  console.log('\n--dry-run: nothing written');
  process.exit(0);
}
if (!anyFitted) {
  console.log('\nnothing fitted – collect data first: npm run collect:lichess');
  process.exit(1);
}

const version = `fit-${fittedAt.slice(0, 16).replace(/[-:T]/g, '')}`;
const fmt = (obj) =>
  JSON.stringify(obj, null, 2)
    .replace(/"(\w+)":/g, '$1:')
    .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')
    .replace(/\{\s+([^{}\[\]]*?)\s+\}/g, (_, body) => `{ ${body.replace(/\s*\n\s*/g, ' ')} }`);
fs.writeFileSync(
  PARAMS_FILE,
  `// AUTO-GENERATED by tools/fit.js on ${fittedAt}. Do not edit by hand –\n` +
    `// collect more data and re-run the fit instead. See src/core/baseline.js.\n\n` +
    `export const BASELINE_VERSION = '${version}';\n\n` +
    `export const BASELINES = ${fmt(baselines)};\n\n` +
    `export const FIT_META = ${fmt(meta)};\n`,
);
fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify({ version, fittedAt, report }, null, 2));
console.log(`\nwrote ${PARAMS_FILE} (${version}) and ${REPORT_FILE}`);
console.log('reload the extension in chrome://extensions to use the new baseline.');
