// [v3:foundation] 3D tree scatter for the environment module -> data/anime/trees.json
//   env -u NODE_OPTIONS bun run scripts/anime/build-trees.js   (after build-landcover.js and build-layout.js)
// Where the camera gets close (within NEAR_R of the hero centre, plus 神明崎), forest cells from the aerial photo
// get real stylised trees: cedar cones (杉) in cedar patches, round broadleaf clumps elsewhere, a few early 紅葉.
// Kept off roads, footprints and the sea. Deterministic (jittered grid + hash). The painted crown shader covers the
// rest of the hills. Rows: [x, z, y, type (0 cedar, 1 broadleaf, 2 autumn), height, radius, tint 0..255].
import sharp from "sharp";
import { join } from "node:path";
import { ROOT } from "../terrain/tiles.js";
import { SegHash, segDist, mulberry, hash32 } from "./derive.js";
import * as L from "../../src/anime/world/layout.js";

const NEAR_R = 820, SPACING = 7.5, MAX = 7000;
const CEDAR = [0x55, 0x7f, 0x5b];

export async function buildTrees() {
  const lc = await Bun.file(join(ROOT, "data/anime/landcover.json")).json();
  const m = lc.core;
  const fr = await sharp(join(ROOT, "data/anime", m.forest)).raw().toBuffer();
  const col = await sharp(join(ROOT, "data/anime", m.file)).removeAlpha().raw().toBuffer();
  const S = m.size;
  const px = (x, z) => { const u = (x - m.x0) / (m.x1 - m.x0), v = (z - m.z0) / (m.z1 - m.z0); return Math.min(S - 1, Math.max(0, Math.floor(u * S))) + Math.min(S - 1, Math.max(0, Math.floor(v * S))) * S; };
  const roads = new SegHash(24);
  for (const r of L.ROADS) if (r.zone !== "far") for (let i = 1; i < r.pts.length; i++) roads.add(r.pts[i - 1], r.pts[i], r);
  const lots = new SegHash(24);
  for (const l of L.LOTS) if (l.zone !== "far") lots.add([l.obb.cx, l.obb.cz], [l.obb.cx, l.obb.cz], l);
  const inLot = (x, z) => lots.near(x, z, 30).some((s) => { const o = s.data.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + 2 && Math.abs(lz) < o.d / 2 + 2; });
  const lotNear = (x, z, m) => lots.near(x, z, 30 + m).some((s) => { const o = s.data.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + m && Math.abs(lz) < o.d / 2 + m; });
  const roadNear = (x, z, m) => roads.near(x, z, 12 + m).some((s) => segDist(x, z, s.a, s.b).d < s.data.width / 2 + m);
  const onRoad = (x, z) => roads.near(x, z, 12).some((s) => segDist(x, z, s.a, s.b).d < s.data.width / 2 + 1.8);
  const H = L.ZONES.hero;
  const rows = [];
  const cands = [];
  for (let z = H.cz - NEAR_R; z <= H.cz + NEAR_R; z += SPACING) for (let x = H.cx - NEAR_R; x <= H.cx + NEAR_R; x += SPACING) {
    const r = mulberry(hash32(`${x},${z}`));
    const jx = x + (r() - 0.5) * SPACING * 0.9, jz = z + (r() - 0.5) * SPACING * 0.9;
    const dc = Math.hypot(jx - H.cx, jz - H.cz);
    if (dc > NEAR_R) continue;
    const k = px(jx, jz), f = fr[k] / 255;
    if (f < 0.35 || r() > f * 1.05) continue;
    if (L.shoreDist(jx, jz) > (dc < 480 ? -16 : -3)) continue;   // keep the promenade and quays clear
    const y = L.heightAt(jx, jz);
    if (onRoad(jx, jz) || inLot(jx, jz)) continue;
    // inside the hero town keep trees to the wooded slopes and 神明崎 (gardens get street trees from town)
    const shinmei = Math.hypot(jx - L.SPOTS.shinmeizaki.x, jz - L.SPOTS.shinmeizaki.z) < 70;
    if (dc < L.ZONES.hero.r + 40 && !shinmei && (f < 0.62 || y < 14 || lotNear(jx, jz, 7) || roadNear(jx, jz, 5))) continue;
    const cedar = Math.abs(col[k * 3] - CEDAR[0]) + Math.abs(col[k * 3 + 1] - CEDAR[1]) + Math.abs(col[k * 3 + 2] - CEDAR[2]) < 20;
    const type = cedar ? (r() < 0.85 ? 0 : 1) : r() < 0.1 ? 2 : r() < 0.2 ? 0 : 1;
    const hgt = type === 0 ? 11 + r() * 8 : 7 + r() * 6;
    const rad = type === 0 ? hgt * (0.2 + r() * 0.05) : 3.2 + r() * 2.6;
    // nearer trees first (they win when the budget runs out)
    cands.push({ d: dc + r() * 120, row: [Math.round(jx * 10) / 10, Math.round(jz * 10) / 10, Math.round(y * 100) / 100, type, Math.round(hgt * 10) / 10, Math.round(rad * 10) / 10, Math.floor(r() * 256)] });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands.slice(0, MAX)) rows.push(c.row);
  return { version: 1, fields: ["x", "z", "y", "type", "height", "radius", "tint"], types: ["cedar", "broadleaf", "autumn"], nearR: NEAR_R, rows };
}

if (import.meta.main) {
  const t0 = performance.now();
  const out = await buildTrees();
  await Bun.write(join(ROOT, "data/anime/trees.json"), JSON.stringify(out));
  const n = [0, 0, 0]; for (const r of out.rows) n[r[3]]++;
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), trees: out.rows.length, cedar: n[0], broadleaf: n[1], autumn: n[2] }));
}
