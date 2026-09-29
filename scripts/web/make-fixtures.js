// Synthetic development fixtures for the web app, in the exact data/ formats of BUILD-SPEC §3.
//   env -u NODE_OPTIONS bun run scripts/web/make-fixtures.js
// Writes src/web/fixtures/{terrain,ortho,buildings,live,photos,splats}/... (deterministic, ~6 MB).
// The geography is a hand-shaped caricature of Kesennuma (inner bay, north arm with the market quay,
// the channel to Oshima, Karakuwa to the east, Anbasan 239 m) so every tour stop has something to frame.
// It is NOT real data; the app swaps to data/ as soon as P1-P4 deliver.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import earcut from "earcut";
import sharp from "sharp";
import { llToEnu, bboxToEnu, BBOX, hash01, sampleGrid, CRS } from "../../src/core/geo.js";
import { sdWater, heightAt, URBAN } from "./fixture-geo.js";
import { MODEL } from "../../src/web/config.js";

const ROOT = resolve(import.meta.dir, "../..");
const OUT = join(ROOT, "src/web/fixtures");
const w = (rel, data) => { const p = join(OUT, rel); mkdirSync(resolve(p, ".."), { recursive: true }); writeFileSync(p, data); return p; };
let seed = 20260929; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ------------------------------------------------------------------ terrain grids
function grid(name, dx) {
  const [x0, z0, x1, z1] = bboxToEnu(BBOX[name]);
  const width = Math.floor((x1 - x0) / dx) + 1, height = Math.floor((z1 - z0) / dx) + 1;
  const h = new Float32Array(width * height); let maxH = 0;
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const v = heightAt(x0 + c * dx, z0 + r * dx); h[r * width + c] = v; if (v > maxH) maxH = v;
  }
  const meta = { name, bbox: BBOX[name], width, height, x0: +x0.toFixed(2), z0: +z0.toFixed(2), dx, dz: dx, minH: 0, maxH: +maxH.toFixed(1),
    source: "synthetic fixture (scripts/web/make-fixtures.js)", crs: CRS, fixture: true };
  w(`terrain/${name}.f32`, Buffer.from(h.buffer));
  w(`terrain/${name}.json`, JSON.stringify(meta, null, 1));
  return { h, meta };
}
const T = { city: grid("city", 40), core: grid("core", 7.4) };
const ground = (x, z) => { const v = sampleGrid(T.core.h, T.core.meta, x, z); return Number.isFinite(v) ? v : sampleGrid(T.city.h, T.city.meta, x, z) || 0; };
console.log("terrain", T.city.meta.width, T.city.meta.height, T.core.meta.width, T.core.meta.height);

// ------------------------------------------------------------------ buildings + roads
const ROOF_REAL = [[0.36, 0.43, 0.52], [0.55, 0.30, 0.26], [0.34, 0.34, 0.35], [0.80, 0.80, 0.78], [0.45, 0.36, 0.28], [0.25, 0.37, 0.50]];
const features = [], roads = [];
const cellKey = (x, z) => `${Math.floor(x / 40)},${Math.floor(z / 40)}`; const occ = new Map();
function freeAt(poly) { for (const [x, z] of poly) { const k = cellKey(x, z); if (occ.get(k) >= 8) return false; } return true; }
function mark(poly) { const [cx, cz] = centroid(poly); const k = cellKey(cx, cz); occ.set(k, (occ.get(k) || 0) + 1); }
function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
const rect = (cx, cz, wd, dp, a) => { const c = Math.cos(a), s = Math.sin(a); return [[-wd / 2, -dp / 2], [wd / 2, -dp / 2], [wd / 2, dp / 2], [-wd / 2, dp / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]); };
function area(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; }
const BASE = { 3101: 6.5, 3102: 11, 3103: 24, 3111: 4, 3112: 4 };
function addBuilding(poly, code, tag) {
  if (!poly.every(([x, z]) => sdWater(x, z) > 6)) return false;
  if (!freeAt(poly)) return false;
  if (area(poly) < 0) poly.reverse();                          // CCW in the (x, z) plane, as the spec asks
  const id = `16/${tag}/${features.length}`;
  const a = Math.abs(area(poly));
  let h = (BASE[code] ?? 6) * (1 + 0.25 * Math.max(-1, Math.min(1, Math.log10(a / 120))));
  h *= 0.94 + 0.12 * hash01(id); h = Math.max(3, Math.min(45, h));
  features.push({ id, code, h: +h.toFixed(2), lit: hash01(id + "lit") < 0.35, poly: poly.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]), holes: [] });
  mark(poly); return true;
}
// market sheds along the north-arm quay + a few landmark blocks
for (let i = 0; i < 5; i++) {
  const t = i / 4, x = 330 + 40 * t, z = -120 - 560 * t;
  addBuilding(rect(x - 55, z, 34, 95, -0.05), 3111, "market");
}
for (const U of URBAN) {
  const cs = Math.cos(U.angle), sn = Math.sin(U.angle), S = U.block;
  const n = Math.ceil(U.r / S);
  for (let i = -n; i <= n; i++) {                              // road grid lines (both directions)
    for (const dir of [0, 1]) {
      let line = [];
      for (let j = -n * 4; j <= n * 4; j++) {
        const u = dir ? i * S : (j * S) / 4, v = dir ? (j * S) / 4 : i * S;
        const x = U.x + u * cs - v * sn, z = U.z + u * sn + v * cs;
        const ok = Math.hypot(x - U.x, z - U.z) < U.r && sdWater(x, z) > 4 && heightAt(x, z) < U.maxH + 10;
        if (ok) line.push([+x.toFixed(1), +z.toFixed(1)]);
        else { if (line.length > 1) roads.push(line); line = []; }
      }
      if (line.length > 1) roads.push(line);
    }
  }
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {   // blocks -> lots -> footprints
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (rnd() > U.density) continue;
      const u = (i + (a + 0.5) / 3) * S + (rnd() - 0.5) * 3, v = (j + (b + 0.5) / 3) * S + (rnd() - 0.5) * 3;
      const x = U.x + u * cs - v * sn, z = U.z + u * sn + v * cs;
      if (Math.hypot(x - U.x, z - U.z) > U.r || heightAt(x, z) > U.maxH) continue;
      const r = rnd(); const code = r < 0.78 ? 3101 : r < 0.95 ? 3102 : r < 0.975 ? 3103 : 3112;
      const big = code === 3102 ? 1.5 : code === 3103 ? 1.3 : 1;
      addBuilding(rect(x, z, (7 + rnd() * 8) * big, (8 + rnd() * 8) * big, U.angle + (rnd() - 0.5) * 0.12), code, U.name);
    }
  }
}
// scattered farm houses on low land
for (let k = 0; k < 900; k++) {
  const x = -6000 + rnd() * 16000, z = -9000 + rnd() * 17000;
  const sd = sdWater(x, z), h = heightAt(x, z);
  if (sd < 20 || sd > 1500 || h > 60) continue;
  addBuilding(rect(x, z, 8 + rnd() * 6, 9 + rnd() * 6, rnd() * 3), 3101, "rural");
}
console.log("buildings", features.length, "roads", roads.length);

// KLC1 mesh: walls (4 verts per edge, outward normals, uv.x = perimeter metres, uv.y = height fraction) + earcut roof
const CODE_BYTE = { 3101: 1, 3102: 2, 3103: 3, 3111: 4, 3112: 4 };
function meshBin(feats) {
  const P = [], N = [], U = [], C = [], I = [];
  const tri = (a, b, c, n) => {                               // wind so the face normal agrees with n
    const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
    const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) I.push(a, b, c); else I.push(a, c, b);
  };
  const vert = (x, y, z, n, u, v, code) => { P.push(x, y, z); N.push(...n); U.push(u, v); C.push(code); return P.length / 3 - 1; };
  for (const f of feats) {
    const [cx, cz] = centroid(f.poly), base = ground(cx, cz) - 0.5, top = base + 0.5 + f.h, code = CODE_BYTE[f.code] ?? 0;
    let per = 0;
    for (let i = 0; i < f.poly.length; i++) {
      const [x0, z0] = f.poly[i], [x1, z1] = f.poly[(i + 1) % f.poly.length];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) continue;
      let n = [(z1 - z0) / L, 0, -(x1 - x0) / L];
      if (n[0] * ((x0 + x1) / 2 - cx) + n[2] * ((z0 + z1) / 2 - cz) < 0) n = [-n[0], 0, -n[2]];
      const a = vert(x0, base, z0, n, per, 0, code), b = vert(x1, base, z1, n, per + L, 0, code);
      const c = vert(x1, top, z1, n, per + L, 1, code), d = vert(x0, top, z0, n, per, 1, code);
      tri(a, b, c, n); tri(a, c, d, n); per += L;
    }
    const flat = f.poly.flat(), idx = earcut(flat), o = P.length / 3;
    for (const [x, z] of f.poly) vert(x, top, z, [0, 1, 0], 0, 1, code);
    for (let i = 0; i < idx.length; i += 3) tri(o + idx[i], o + idx[i + 1], o + idx[i + 2], [0, 1, 0]);
  }
  const vc = P.length / 3, ic = I.length;
  const head = 12;
  const buf = new ArrayBuffer(head + vc * 32 + vc + ic * 4); const dv = new DataView(buf);
  dv.setUint32(0, 0x4b4c4331, true); dv.setUint32(4, vc, true); dv.setUint32(8, ic, true);
  let o = head;
  new Float32Array(buf, o, vc * 3).set(P); o += vc * 12;      // header is 12 bytes, so float arrays stay 4-aligned
  new Float32Array(buf, o, vc * 3).set(N); o += vc * 12;
  new Float32Array(buf, o, vc * 2).set(U); o += vc * 8;
  new Uint8Array(buf, o, vc).set(C); o += vc;
  for (let i = 0; i < ic; i++) dv.setUint32(o + i * 4, I[i], true);   // unaligned after the uint8 block: write via DataView
  return { buf: Buffer.from(buf), vc, ic };
}
const [cx0, cz0, cx1, cz1] = bboxToEnu(BBOX.core);
const inCore = (f) => { const [x, z] = centroid(f.poly); return x > cx0 && x < cx1 && z > cz0 && z < cz1; };
const cityMesh = meshBin(features), coreMesh = meshBin(features.filter(inCore));
w("buildings/city.mesh.bin", cityMesh.buf); w("buildings/core.mesh.bin", coreMesh.buf);
w("buildings/city.json", JSON.stringify({ origin: { lat: 38.906, lon: 141.575, crs: CRS }, count: features.length, fixture: true, features }));
w("buildings/roads.json", JSON.stringify({ lines: roads }));
w("buildings/layers.json", JSON.stringify({ fixture: true, layers: { BldA: ["vt_code"] } }, null, 1));
console.log("mesh city", cityMesh.vc, cityMesh.ic / 3, "core", coreMesh.vc, coreMesh.ic / 3);

// ------------------------------------------------------------------ ortho (synthetic aerial colours + painted roofs and roads)
function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * (Math.sin(x * 1.7 + Math.cos(y * 1.3 + i)) * Math.cos(y * 1.9 - x * 0.4 + i * 2.1) * 0.5 + 0.5); x *= 2.03; y *= 2.01; a *= 0.5; } return s; }
function groundColour(x, z) {
  const sd = sdWater(x, z), h = heightAt(x, z), n = fbm(x / 180, z / 180);
  if (sd < 0) { const t = Math.min(1, -sd / 400); return [0.14 - 0.05 * t + 0.02 * n, 0.27 - 0.07 * t + 0.02 * n, 0.27 - 0.04 * t]; }
  if (sd < 9) return [0.62, 0.59, 0.52];
  const urban = URBAN.some((U) => Math.hypot(x - U.x, z - U.z) < U.r && h < U.maxH);
  if (urban) return [0.47 + 0.08 * n, 0.46 + 0.08 * n, 0.44 + 0.07 * n];
  if (h > 22 || n > 0.66) return [0.17 + 0.07 * n, 0.26 + 0.1 * n, 0.14 + 0.04 * n];
  return [0.42 + 0.1 * n, 0.45 + 0.08 * n, 0.3];
}
async function ortho(name, px, bboxName, file) {
  const [x0, z0, x1, z1] = bboxToEnu(BBOX[bboxName]); const dx = (x1 - x0) / px, dz = (z1 - z0) / px;
  const img = new Uint8Array(px * px * 3);
  for (let r = 0; r < px; r++) for (let c = 0; c < px; c++) {
    const col = groundColour(x0 + (c + 0.5) * dx, z0 + (r + 0.5) * dz), o = (r * px + c) * 3;
    img[o] = col[0] * 255; img[o + 1] = col[1] * 255; img[o + 2] = col[2] * 255;
  }
  const put = (x, z, col) => { const c = Math.floor((x - x0) / dx), r = Math.floor((z - z0) / dz); if (c < 0 || r < 0 || c >= px || r >= px) return; const o = (r * px + c) * 3; img[o] = col[0] * 255; img[o + 1] = col[1] * 255; img[o + 2] = col[2] * 255; };
  for (const line of roads) for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), step = Math.min(dx, dz) * 0.7;
    for (let s = 0; s <= L; s += step) for (let k = -2; k <= 2; k++) {
      const t = s / L, nx = -(bz - az) / L, nz = (bx - ax) / L;
      put(ax + (bx - ax) * t + nx * k * 1.5, az + (bz - az) * t + nz * k * 1.5, [0.66, 0.65, 0.62]);
    }
  }
  for (const f of features) {
    const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]);
    const col = ROOF_REAL[Math.floor(hash01(f.id + "roof") * ROOF_REAL.length)];
    const c0 = Math.floor((Math.min(...xs) - x0) / dx), c1 = Math.ceil((Math.max(...xs) - x0) / dx);
    const r0 = Math.floor((Math.min(...zs) - z0) / dz), r1 = Math.ceil((Math.max(...zs) - z0) / dz);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = x0 + (c + 0.5) * dx, z = z0 + (r + 0.5) * dz;
      if (pip(f.poly, x, z)) put(x, z, col.map((v) => v * (0.93 + 0.1 * fbm(x / 3, z / 3))));
    }
  }
  const buf = await sharp(Buffer.from(img), { raw: { width: px, height: px, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  w(`ortho/${file}.jpg`, buf);
  const meta = { bbox: BBOX[bboxName], width: px, height: px, x0: +x0.toFixed(2), z0: +z0.toFixed(2), dx: +dx.toFixed(4), dz: +dz.toFixed(4), fixture: true };
  if (file === name) w(`ortho/${name}.json`, JSON.stringify(meta, null, 1));
  return img;
}
function pip(poly, x, z) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; }
await ortho("city", 1024, "city", "city");
await ortho("core", 2048, "core", "core");
await ortho("core", 1024, "core", "core_2k");
console.log("ortho done");

// ------------------------------------------------------------------ living layer sample
const arrivals = [
  ["04:40", "サンプル丸 1号", "まき網", 199, "かつお", 38000], ["05:30", "サンプル丸 2号", "まき網", 135, "かつお", 42000],
  ["06:15", "サンプル丸 3号", "一本釣り", 119, "かつお", 21000], ["07:05", "サンプル丸 5号", "さんま棒受網", 199, "さんま", 56000],
  ["08:20", "サンプル丸 8号", "近海まぐろはえ縄", 19, "めかじき", 2400], ["09:40", "サンプル丸 11号", "一本釣り", 99, "かつお", 17000],
  ["11:10", "サンプル丸 12号", "さんま棒受網", 180, "さんま", 31000], ["14:30", "サンプル丸 15号", "定置網", 12, "ぶり", 3200],
].map(([time, vessel, type, tonnage, cat, kg]) => ({ time, vessel, type, tonnage, catch: cat, kg }));
w("live/sample.json", JSON.stringify({
  updated: "2026-09-29T01:10:00Z", sample: true, fixture: true,
  sun: { azimuth: 150.2, elevation: 44.1 },
  weather: { source: "JMA (fixture)", station: "気仙沼", temp: 21.3, wind: { dir: 110, speed: 3.2 }, precip1h: 0, sky: "cloudy", forecast: "くもり 時々 晴れ" },
  tide: { source: "JMA 大船渡 (fixture)", height_cm: 95, next: [{ t: "2026-09-29T12:48:00+09:00", type: "high", cm: 130 }, { t: "2026-09-29T19:02:00+09:00", type: "low", cm: 38 }] },
  port: { source: "気仙沼漁協 入船情報 (fixture)", date: "2026-09-29", arrivals },
}, null, 1));

// ------------------------------------------------------------------ photo pins (3 placeholder images at the capture spot)
const spot = llToEnu(38.9052, 141.5754), photos = [];
for (const [i, id] of ["IMG_0577", "IMG_0588", "IMG_0598"].entries()) {
  const heading = 60 + i * 20, [lat, lon] = [38.9052 + (i - 1) * 0.00004, 141.5754 + (i - 1) * 0.00005];
  const e = llToEnu(lat, lon, 4.1);
  photos.push({ id, lat, lon, alt: 4.1, heading, time: `2026-09-29T10:1${7 + i}:00+09:00`, enu: [+e.x.toFixed(2), 4.1, +e.z.toFixed(2)], fov: 69, fixture: true });
  const svg = (W, H) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ea"/><stop offset="0.55" stop-color="#e9e4dc"/><stop offset="1" stop-color="#9fb4bd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="48%" font-family="Helvetica" font-size="${W / 16}" text-anchor="middle" fill="#3a4a52">fixture ${id}</text><text x="50%" y="60%" font-family="Helvetica" font-size="${W / 28}" text-anchor="middle" fill="#56666e">heading ${heading}°</text></svg>`);
  w(`photos/${id}.webp`, await sharp(svg(1600, 1200)).webp({ quality: 70 }).toBuffer());
  w(`photos/${id}_t.webp`, await sharp(svg(320, 240)).webp({ quality: 70 }).toBuffer());
}
w("photos/index.json", JSON.stringify({ fixture: true, photos }, null, 1));
void spot;

// ------------------------------------------------------------------ diorama splat: the physical model of the inner bay (table frame)
// Table frame: metres, origin = model centre on the model's datum (sea level), x east, y up, z south.
// Real-world ENU = MODEL.center + p / MODEL.scale.
const S = MODEL.scale, props = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
const splats = [];
const C0 = 0.28209479177387814, dc = (c) => (c - 0.5) / C0, logit = (a) => Math.log(a / (1 - a));
const push = (ex, ey, ez, col, rad, flat = false, op = 0.95) => {
  const x = (ex - MODEL.center[0]) * S, z = (ez - MODEL.center[1]) * S, y = ey * S;
  const s = Math.log(rad * S);
  splats.push([x, y, z, dc(col[0]), dc(col[1]), dc(col[2]), logit(op), s, flat ? Math.log(rad * S * 0.25) : s, s, 1, 0, 0, 0]);
};
const PAL = { white: [0.93, 0.92, 0.89], red: [0.72, 0.33, 0.29], blue: [0.33, 0.45, 0.6], brown: [0.55, 0.42, 0.31], grey: [0.62, 0.63, 0.64] };
const ROOFP = [PAL.blue, PAL.red, PAL.grey, PAL.white, PAL.brown, PAL.blue];
const [mx0, mz0] = [MODEL.center[0] - MODEL.extent[0] / 2, MODEL.center[1] - MODEL.extent[1] / 2];
for (let z = mz0; z <= mz0 + MODEL.extent[1]; z += 7) for (let x = mx0; x <= mx0 + MODEL.extent[0]; x += 7) {
  const jx = x + (rnd() - 0.5) * 4, jz = z + (rnd() - 0.5) * 4, sd = sdWater(jx, jz), h = ground(jx, jz);
  if (sd < 0) push(jx, 0.6, jz, [0.66 + rnd() * 0.03, 0.75 + rnd() * 0.03, 0.78 + rnd() * 0.02], 5.2, true);
  else {
    const green = h > 14 || fbm(jx / 180, jz / 180) > 0.64;
    push(jx, h, jz, green ? [0.5, 0.62, 0.43] : [0.9, 0.87, 0.8], 5.2, true);
    if (green && rnd() < 0.55) push(jx + (rnd() - 0.5) * 5, h + 5, jz + (rnd() - 0.5) * 5, [0.33 + rnd() * 0.08, 0.5 + rnd() * 0.1, 0.3], 4.2);
  }
}
for (const f of features) {
  const [cx, cz] = centroid(f.poly);
  if (Math.abs(cx - MODEL.center[0]) > MODEL.extent[0] / 2 || Math.abs(cz - MODEL.center[1]) > MODEL.extent[1] / 2) continue;
  const g = ground(cx, cz), top = g + f.h, roof = ROOFP[Math.floor(hash01(f.id + "roof") * ROOFP.length)];
  const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2.6) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2.6)
    if (pip(f.poly, x, z)) push(x, top, z, roof, 1.9, true, 0.99);
  for (let i = 0; i < f.poly.length; i++) {
    const [x0, z0] = f.poly[i], [x1, z1] = f.poly[(i + 1) % f.poly.length], L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s <= L; s += 3) for (let y = g + 1.5; y < top; y += 3) push(x0 + ((x1 - x0) * s) / L, y, z0 + ((z1 - z0) * s) / L, PAL.white, 1.8, false, 0.99);
  }
}
const N = splats.length;
const header = `ply\nformat binary_little_endian 1.0\ncomment Kesennuma Living City synthetic diorama fixture (table frame, metres)\nelement vertex ${N}\n${props.map((p) => `property float ${p}`).join("\n")}\nend_header\n`;
const hb = Buffer.from(header), body = new Float32Array(N * props.length);
splats.forEach((s, i) => body.set(s, i * props.length));
w("splats/diorama/diorama.ply", Buffer.concat([hb, Buffer.from(body.buffer)]));
w("splats/diorama/transform.json", JSON.stringify({ frame: "table", position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 1, model: MODEL, splats: N, source: "synthetic fixture", fixture: true }, null, 1));
console.log("diorama splats", N);
