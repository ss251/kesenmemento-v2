// The view-quest photo pipeline (the rules are in docs/play/MISSIONS.md, このけしき、どこ？).
//
//   env -u NODE_OPTIONS bun tools/play/views-build.mjs candidates
//     Scores the solved survey cameras, writes review thumbnails and candidates.md.
//
//   env -u NODE_OPTIONS bun tools/play/views-build.mjs check <image> [<image>...]
//     Apple Vision face count (and plate-like text) for each file. One JSON line per file.
//
//   env -u NODE_OPTIONS bun tools/play/views-build.mjs ship <id,id,...>
//     Downscales the chosen survey frames to data/play/views/*.webp (long side 960, ≤ 80 KB, no EXIF), blurring the
//     privacy boxes of tools/play/views-masks.json (every person the eye review found, face or not).
//     Does not choose for you: pass the ids that already passed the face check.
//
// Review output (thumbnails, candidates.md, shipped.json) goes to $VIEWS_REVIEW_DIR, else dist/review/views.
//
// Photos are our own survey frames (raw/survey, gitignored). Nothing here fetches a map tile.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { enuToLatLon, anglesFromQuaternion, yawFromHeading } from '../../src/anime/core/pose.js';

const ROOT = resolve(import.meta.dir, '../..');
const OUT = resolve(process.env.VIEWS_REVIEW_DIR || join(ROOT, 'dist/review/views'));
const MASKS = JSON.parse(readFileSync(join(ROOT, 'tools/play/views-masks.json'), 'utf8')).masks || {};
const SWIFT = join(ROOT, 'tools/play/faces.swift');

const AREAS = [
  { file: 'data/survey/minami/cameras.json', area: 'minami', ja: '南町海岸', en: 'Minamimachi shore' },
  { file: 'data/survey/market/cameras.json', area: 'market', ja: '魚市場', en: 'Fish market' },
];

/** A Japanese number plate, loosely: a kana and a digit group, or a prefecture plus a class code. */
const PLATE = /(?:宮城|岩手|福島|青森|秋田|山形)\s*\d{2,3}|[あ-ん]\s*\d{1,2}\s*[-−ー]\s*\d{2}/;

export function verticalFov(cam) {
  const fy = +cam.fy;
  const h = +cam.height;
  if (!(fy > 0) || !(h > 0)) return null;
  return 2 * Math.atan(h / (2 * fy)) * 180 / Math.PI;
}

/** Engine yaw (degrees, 0 north, + turns west) from the survey quaternion. */
export function yawOf(cam) {
  const q = cam.quaternion;
  if (!q || q.length !== 4) return +cam.yaw;
  const a = anglesFromQuaternion({ x: q[0], y: q[1], z: q[2], w: q[3] });
  return yawFromHeading(a.heading);
}

export function poseOf(cam) {
  const [x, y, z] = cam.position;
  const ll = enuToLatLon(x, z);
  const fov = verticalFov(cam);
  return {
    x: round(x, 2), y: round(y, 2), z: round(z, 2),
    yaw: round(yawOf(cam), 2),
    pitch: round(+cam.pitch, 2),
    fov: round(fov, 2),
    lat: round(ll.lat, 7),
    lon: round(ll.lon, 7),
  };
}

function round(v, d) {
  const k = 10 ** d;
  const r = Math.round(v * k) / k;
  return r === 0 ? 0 : r;
}

/** Higher is a clearer, landmark-richer frame. Unregistered or tilted frames score 0. */
export function scoreCamera(cam) {
  if (!cam?.registered) return 0;
  const roll = Math.abs(+cam.roll || 0);
  const pitch = +cam.pitch || 0;
  if (roll > 12) return 0;
  if (pitch < -12 || pitch > 28) return 0;
  if (cam.reproj_px != null && +cam.reproj_px > 3) return 0;
  const obs = +cam.obs || 0;
  if (!obs) return 480;
  const rollPen = roll > 6 ? 0.6 : 1;
  const pitchPen = Math.abs(pitch) > 18 ? 0.75 : 1;
  return obs * rollPen * pitchPen;
}

export function loadCameras() {
  const all = [];
  for (const src of AREAS) {
    const doc = JSON.parse(readFileSync(join(ROOT, src.file), 'utf8'));
    for (const cam of doc.cameras || []) {
      all.push({ ...cam, area: src.area, areaJa: src.ja, areaEn: src.en });
    }
  }
  return all;
}

/** One strong frame per 18 m cell, then a second when the view turns by 45° or more.
 *  Market frames have no observation count, so a few of their cells are reserved first. */
export function spread(cams, { n = 16, cell = 18, market = 4 } = {}) {
  const ranked = cams.filter((c) => scoreCamera(c) > 0).sort((a, b) => scoreCamera(b) - scoreCamera(a));
  const picked = [];
  const key = (c) => `${c.area}:${Math.round(c.position[0] / cell)},${Math.round(c.position[2] / cell)}`;
  const yawFar = (a, b) => {
    let d = (+a.yaw || 0) - (+b.yaw || 0);
    d -= 360 * Math.floor((d + 180) / 360);
    return Math.abs(d) >= 45;
  };
  const consider = (cam) => {
    if (picked.length >= n) return;
    const here = picked.filter((p) => key(p) === key(cam));
    if (here.length === 0) picked.push(cam);
    else if (here.length === 1 && yawFar(here[0], cam)) picked.push(cam);
  };
  for (const cam of ranked) {
    if (cam.area !== 'market') continue;
    if (picked.filter((p) => p.area === 'market').length >= market) continue;
    consider(cam);
  }
  for (const cam of ranked) consider(cam);
  return picked;
}

export function plateLike(lines) {
  const text = (lines || []).join('\n');
  return PLATE.test(text);
}

function run(cmd, args, opt = {}) {
  const out = spawnSync(cmd, args, { encoding: 'utf8', ...opt });
  if (out.status !== 0) {
    const err = (out.stderr || out.stdout || out.error?.message || '').trim();
    throw new Error(`${cmd} ${args[0] || ''} failed (${out.status}${out.signal ? ' ' + out.signal : ''}): ${err}`);
  }
  return out.stdout || '';
}

let faceBin = '';
function visionBin() {
  if (faceBin) return faceBin;
  faceBin = join(tmpdir(), 'klc-faces');
  run('swiftc', ['-O', '-o', faceBin, SWIFT], { timeout: 180000 });
  return faceBin;
}

export function vision(imagePath) {
  const bin = visionBin();
  const raw = spawnSync(bin, [imagePath], { encoding: 'utf8', timeout: 60000 });
  if (raw.status !== 0) {
    throw new Error(`${bin} failed (${raw.status}): ${(raw.stderr || raw.stdout || raw.error?.message || '').trim()}`);
  }
  const line = String(raw.stdout || '').trim().split('\n').filter(Boolean).pop();
  if (!line) throw new Error('vision returned nothing for ' + imagePath);
  const parsed = JSON.parse(line);
  return { faces: parsed.faces | 0, text: Array.isArray(parsed.text) ? parsed.text : [], plate: plateLike(parsed.text) };
}

function exifDate(imagePath) {
  const out = spawnSync('exiftool', ['-DateTimeOriginal', '-s3', '-d', '%Y-%m-%d', imagePath], { encoding: 'utf8' });
  const s = (out.stdout || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function thumb(src, dest, longSide) {
  mkdirSync(dirname(dest), { recursive: true });
  run('sips', ['-Z', String(longSide), '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', src, '--out', dest]);
}

/** ffmpeg filter that box-blurs each [x0, y0, x1, y1] (fractions of a w×h frame) in place. Pure (tests). */
export function blurFilter(boxes, w, h) {
  if (!boxes?.length) return null;
  const parts = [`[0:v]split=${boxes.length + 1}[base]${boxes.map((_, i) => `[c${i}]`).join('')}`];
  let last = 'base';
  boxes.forEach((b, i) => {
    const x = Math.max(0, Math.floor(b[0] * w)), y = Math.max(0, Math.floor(b[1] * h));
    const bw = Math.max(4, Math.min(w - x, Math.ceil((b[2] - b[0]) * w))), bh = Math.max(4, Math.min(h - y, Math.ceil((b[3] - b[1]) * h)));
    const r = Math.max(2, Math.floor(Math.min(bw, bh) / 4));
    const cr = Math.max(1, Math.floor(Math.min(bw, bh) / 4) - 1);   // the chroma planes are half size: radius < their half
    parts.push(`[c${i}]crop=${bw}:${bh}:${x}:${y},boxblur=${r}:3:${cr}:3[b${i}]`);
    parts.push(`[${last}][b${i}]overlay=${x}:${y}[o${i}]`);
    last = `o${i}`;
  });
  return { graph: parts.join(';'), out: `[${last}]` };
}

/** Long side `longSide`, WebP ≤ maxBytes, no metadata, the privacy boxes blurred. Returns the byte size. */
export function shipWebp(src, dest, { longSide = 960, maxBytes = 80 * 1024, masks = [] } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = join(tmpdir(), `klc-view-${process.pid}-${Math.random().toString(16).slice(2)}.jpg`);
  try {
    run('sips', ['-Z', String(longSide), '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', tmp]);
    if (masks.length) {
      const dims = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', tmp], { encoding: 'utf8' }).stdout || '';
      const w = +(/pixelWidth: (\d+)/.exec(dims)?.[1] || 0), h = +(/pixelHeight: (\d+)/.exec(dims)?.[1] || 0);
      if (!w || !h) throw new Error(`no size for ${tmp}`);
      const f = blurFilter(masks.map((m) => m.box), w, h);
      const blurred = tmp.replace(/\.jpg$/, '-blur.jpg');
      run('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-filter_complex', f.graph, '-map', f.out, '-frames:v', '1', '-update', '1', '-q:v', '2', blurred]);
      run('mv', [blurred, tmp]);
    }
    let q = 72;
    let size = Infinity;
    while (q >= 28) {
      run('cwebp', ['-quiet', '-metadata', 'none', '-q', String(q), tmp, '-o', dest]);
      size = statSync(dest).size;
      if (size <= maxBytes) break;
      q -= 6;
    }
    if (size > maxBytes) throw new Error(`${dest} is ${size} bytes, over ${maxBytes}`);
    return size;
  } finally {
    try { rmSync(tmp, { force: true }); } catch { /* */ }
  }
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

function candidates() {
  mkdirSync(OUT, { recursive: true });
  const cams = loadCameras();
  const picked = spread(cams, { n: 18, gap: 22, perArea: 5 });
  const rows = [];
  for (const cam of picked) {
    const src = join(ROOT, cam.image);
    const pose = poseOf(cam);
    const jpg = join(OUT, `cand-${cam.area}-${cam.id}.jpg`);
    thumb(src, jpg, 640);
    let vis = { faces: -1, text: [], plate: false, error: '' };
    try { vis = vision(jpg); } catch (e) { vis.error = String(e.message || e); }
    const date = exifDate(src);
    rows.push({ cam, pose, date, vis, thumb: `cand-${cam.area}-${cam.id}.jpg` });
    console.log(`${cam.area} ${cam.id} faces=${vis.faces} plate=${vis.plate} obs=${cam.obs} score=${Math.round(scoreCamera(cam))}`);
  }
  const lines = [];
  lines.push('# このけしき、どこ？ — photo candidates');
  lines.push('');
  lines.push('Survey frames from `data/survey/minami/cameras.json` and `data/survey/market/cameras.json`.');
  lines.push('Face check: Apple Vision `VNDetectFaceRectanglesRequest` on the 640 px thumbnail (`tools/play/faces.swift`).');
  lines.push('A plate-like reading (prefecture + class code, or kana + hyphenated digits) is flagged to drop.');
  lines.push('Final six are chosen after this file. Shipped WebPs are written only for ids whose face count is 0.');
  lines.push('');
  lines.push('| id | area | score | obs | faces | plate | date | yaw | pitch | fov | x | z | thumb |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const c = r.cam;
    const p = r.pose;
    lines.push(`| ${c.id} | ${c.area} | ${Math.round(scoreCamera(c))} | ${c.obs || 0} | ${r.vis.faces} | ${r.vis.plate ? 'yes' : 'no'} | ${r.date || '—'} | ${p.yaw} | ${p.pitch} | ${p.fov} | ${p.x} | ${p.z} | ${r.thumb} |`);
  }
  lines.push('');
  lines.push('## Readings');
  lines.push('');
  for (const r of rows) {
    const text = (r.vis.text || []).slice(0, 8).join(' / ') || '—';
    const err = r.vis.error ? ` ERROR ${r.vis.error}` : '';
    lines.push(`- **${r.cam.id}** (${r.cam.area}): ${text}${err}`);
  }
  lines.push('');
  lines.push('## Picks');
  lines.push('');
  lines.push('_Not chosen yet. The six that ship go here after the face check is 0 and the frames have been looked at._');
  lines.push('');
  writeFileSync(join(OUT, 'candidates.md'), lines.join('\n'));
  writeFileSync(join(OUT, 'candidates.json'), JSON.stringify(rows.map((r) => ({
    id: r.cam.id,
    area: r.cam.area,
    image: r.cam.image,
    date: r.date,
    pose: r.pose,
    faces: r.vis.faces,
    plate: r.vis.plate,
    text: r.vis.text,
    score: Math.round(scoreCamera(r.cam)),
    obs: r.cam.obs || 0,
    thumb: r.thumb,
  })), null, 2));
  console.log(`wrote ${rows.length} candidates to ${OUT}`);
}

function check(paths) {
  for (const p of paths) {
    const vis = vision(resolve(p));
    console.log(JSON.stringify({ file: p, faces: vis.faces, plate: vis.plate, text: vis.text }));
  }
}

function ship(ids) {
  const cams = loadCameras();
  const byId = new Map(cams.map((c) => [c.id, c]));
  const dir = join(ROOT, 'data/play/views');
  mkdirSync(dir, { recursive: true });
  const shipped = [];
  for (const id of ids) {
    const cam = byId.get(id);
    if (!cam) throw new Error('no camera ' + id);
    const src = join(ROOT, cam.image);
    const jpg = join(tmpdir(), `klc-ship-${id}.jpg`);
    thumb(src, jpg, 1280);
    const vis = vision(jpg);
    rmSync(jpg, { force: true });
    if (vis.faces !== 0) throw new Error(`${id} has ${vis.faces} faces; not shipping`);
    if (vis.plate) throw new Error(`${id} looks like it has a plate; not shipping`);
    shipped.push({ cam, vis, date: exifDate(src) });
  }
  shipped.forEach((row, i) => {
    const name = `V${String(i + 1).padStart(2, '0')}.webp`;
    const dest = join(dir, name);
    const masks = MASKS[row.cam.id] || [];
    const size = shipWebp(join(ROOT, row.cam.image), dest, { masks });
    row.file = name;
    row.bytes = size;
    row.masks = masks.length;
    console.log(`${row.cam.id} -> ${name} ${size} bytes faces=${row.vis.faces} blurred=${masks.length}`);
  });
  writeFileSync(join(OUT, 'shipped.json'), JSON.stringify(shipped.map((r) => ({
    survey: r.cam.id,
    file: r.file,
    bytes: r.bytes,
    area: r.cam.area,
    areaJa: r.cam.areaJa,
    areaEn: r.cam.areaEn,
    date: r.date,
    pose: poseOf(r.cam),
    faces: r.vis.faces,
    blurred: r.masks,
    image: r.cam.image,
  })), null, 2));
  console.log('wrote', join(OUT, 'shipped.json'));
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'candidates') candidates();
  else if (cmd === 'check') check(rest);
  else if (cmd === 'ship') ship(rest.join(',').split(',').map((s) => s.trim()).filter(Boolean));
  else {
    console.error('usage: views-build.mjs candidates | check <image> | ship <id,id,...>');
    process.exit(2);
  }
}
