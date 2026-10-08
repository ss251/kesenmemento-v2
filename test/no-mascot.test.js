// Guards the tree against the city mascot coming back. The needles are built so this file does not contain them.
import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const piece = (...p) => p.join('');
const ja = (...c) => String.fromCharCode(...c);

const MASCOT = ja(0x30db, 0x30e4, 0x307c, 0x30fc, 0x3084);
const MASCOT_LONG = ja(0x30db, 0x30e4, 0x30dc, 0x30fc, 0x30e4);
const LATIN = [
  piece('hoy', 'aboya'),
  piece('hoy', 'a boya'),
  piece('hoy', 'a-boya'),
  piece('hoy', 'a3d'),
  piece('hoy', 'a-model'),
];
const CAMEL = piece('hoy', 'aGait');
const CONST = piece('HOY', 'A_');
const SEA_CHILD = new RegExp(ja(0x6d77, 0x306e, 0x5b50) + '[\\s\\u3000]*' + ja(0x30db, 0x30e4));
const PATH_WORD = new RegExp(piece('hoy', 'aboya') + '|' + piece('hoy', 'a3d'), 'i');
const BIN = /\.(png|jpe?g|webp|gif|mp4|mov|pdf|woff2?|zip|avif|ico|glb|wasm)$/i;

function textHits(text) {
  const found = [];
  if (text.includes(MASCOT)) found.push('mascot');
  if (text.includes(MASCOT_LONG)) found.push('mascot-long');
  const lower = text.toLowerCase();
  for (const p of LATIN) if (lower.includes(p)) found.push(p);
  if (text.includes(CAMEL)) found.push(CAMEL);
  if (text.includes(CONST)) found.push(CONST);
  if (SEA_CHILD.test(text)) found.push('sea-child');
  return found;
}

function tracked() {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  const extra = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: root });
  return Buffer.concat([listed, extra]).toString('utf8').split('\0').filter(Boolean);
}

test('no tracked text file and no tracked path names the city mascot', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (PATH_WORD.test(rel)) bad.push(`${rel}: path`);
    if (BIN.test(rel)) continue;
    let buf;
    try { buf = readFileSync(join(root, rel)); } catch { continue; }
    if (buf.includes(0)) continue;
    const hits = textHits(buf.toString('utf8'));
    if (hits.length) bad.push(`${rel}: ${hits.join(', ')}`);
  }
  expect(bad).toEqual([]);
});
