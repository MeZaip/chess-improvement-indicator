#!/usr/bin/env node
// Add confirmed cross-platform accounts to the calibration sample.
//
//   node tools/link.js            both files in data/raw/
//   node tools/link.js lichess    one platform
//   node tools/link.js --force    re-check everyone (e.g. after a bad run)
//
// Idempotent: records already checked are skipped, and players whose lookup
// failed (rate limit, network) stay unchecked – just run it again.
// Run it BEFORE `npm run fit`.

import fs from 'node:fs';
import path from 'node:path';

import { createClient } from './lib/http.js';
import { linkRecords } from './lib/link.js';

const client = {
  // bulk requests are heavy for Lichess → space them out generously.
  // Optional: LICHESS_TOKEN (personal token, no scopes needed) → higher limits.
  lichess: createClient({ minIntervalMs: 3000, rateLimitWaitMs: 90_000, authToken: process.env.LICHESS_TOKEN }),
  chesscom: createClient({ minIntervalMs: 250, rateLimitWaitMs: 10_000 }),
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const named = args.filter((a) => !a.startsWith('--'));
const platforms = named.length ? named : ['lichess', 'chesscom'];
let stoppedEarly = null;

for (const platform of platforms) {
  const file = path.join('data', 'raw', `${platform}.jsonl`);
  if (!fs.existsSync(file)) {
    console.error(`${platform}: no ${file}, skipping`);
    continue;
  }
  const records = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (force) records.forEach((r) => delete r.linkCheckedAt);
  console.error(`${platform}: checking ${records.filter((r) => !r.linkCheckedAt).length} of ${records.length} players…`);

  let result;
  try {
    result = await linkRecords(platform, records, client);
  } catch (err) {
    if (err.code !== 'rate_limited') throw err;
    stoppedEarly = err;
  } finally {
    // always save what was done; temp file first so an interruption never corrupts the data
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.renameSync(tmp, file);
  }
  if (stoppedEarly) {
    const left = records.filter((r) => !r.linkCheckedAt).length;
    console.error(`\n${platform}: stopped – ${stoppedEarly.message}`);
    console.error(`progress saved, ${left} players still to check. Re-run \`npm run link\` later.`);
    process.exit(2);
  }
  const { checked, linked, pending } = result;

  const total = records.filter((r) => r.linked?.status === 'confirmed').length;
  console.error(
    `${platform}: ${checked} checked, ${linked} newly linked – ${total}/${records.length} ` +
      `(${((100 * total) / records.length).toFixed(1)}%) have a confirmed account on the other site`,
  );
  if (pending > 0) console.error(`${platform}: ${pending} players could not be checked (rate limit?) – run again later`);
}
