#!/usr/bin/env node
// Build the zip to upload to the Chrome Web Store:
//
//   node tools/package.js   →   dist/chess-improvement-indicator-<version>.zip
//
// Contains only what the extension needs at runtime: manifest.json, src/,
// icons/icon-*.png and LICENSE (no tools/, data/, tests/, docs/, store/).
// Checks that every file the manifest refers to is in the package.
// No dependencies: a minimal zip writer (deflate via node:zlib).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = [
  'manifest.json',
  'LICENSE',
  ...walk('src'),
  ...fs.readdirSync('icons').filter((f) => /^icon-\d+\.png$/.test(f)).map((f) => `icons/${f}`),
].filter((f) => fs.existsSync(f)).sort();

// --- every file referenced by the manifest must be packaged ---------------
const referenced = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
].filter(Boolean);
const missing = referenced.filter((f) => !files.includes(f));
if (missing.length) {
  console.error('manifest refers to files that are not packaged:', missing);
  process.exit(1);
}
if (!files.includes('LICENSE')) console.warn('warning: LICENSE not found, packaging without it');

// --- minimal zip writer -----------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
// fixed timestamp → the same sources always give the same zip
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(name);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}
const centralSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync('dist', { recursive: true });
const out = path.join('dist', `chess-improvement-indicator-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`${out}  (${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
for (const f of files) console.log('  ' + f);
