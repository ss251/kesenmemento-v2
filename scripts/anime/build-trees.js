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
import { CLASSES } from "./build-landcover.js";
import { KAMEYAMA } from "../../src/anime/world/landmarks/sites.js";

// [v4:polish3] 1500 m and 25 000 trees (was 820 m / 7000): the upper 安波山 slopes, 亀山 and the hills round the core are
// real trees too; beyond ~380 m from the camera they draw as a cheap crown (environment/trees.js far LOD)
const NEAR_R = 1500, SPACING = 7.5, MAX = 25000;
const CEDAR = hexRGB(CLASSES.find((c) => c.id === "cedar").color);
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

export async function buildTrees() {
  const lc = await Bun.file(join(ROOT, "data/anime/landcover.json")).json();
  const m = lc.core;
  // [v4:town-accuracy] the forest mask PNG decodes to 3 channels: read channel 0 of pixel k (it was read as byte k, which
  // scattered the trees over the wrong pixels: 207 of them stood on the 気仙沼小 / 中学校 playing fields)
  const frRaw = await sharp(join(ROOT, "data/anime", m.forest)).raw().toBuffer({ resolveWithObject: true });
  const FC = frRaw.info.channels, fr = { at: (k) => frRaw.data[k * FC] };
  const col = await sharp(join(ROOT, "data/anime", m.file)).removeAlpha().raw().toBuffer();
  // [v4:polish3] outside the core photo (大島's 亀山): the city land cover (17 m/px)
  const mc = lc.city;
  const frCityRaw = await sharp(join(ROOT, "data/anime", mc.forest)).raw().toBuffer({ resolveWithObject: true });
  const colCity = await sharp(join(ROOT, "data/anime", mc.file)).removeAlpha().raw().toBuffer();
  const inCore = (x, z) => x >= m.x0 && x < m.x1 && z >= m.z0 && z < m.z1;
  const pxOf = (mm, x, z) => { const S = mm.size, u = (x - mm.x0) / (mm.x1 - mm.x0), v = (z - mm.z0) / (mm.z1 - mm.z0); return Math.min(S - 1, Math.max(0, Math.floor(u * S))) + Math.min(S - 1, Math.max(0, Math.floor(v * S))) * S; };
  const forestAt = (x, z) => inCore(x, z) ? fr.at(pxOf(m, x, z)) / 255 : frCityRaw.data[pxOf(mc, x, z) * frCityRaw.info.channels] / 255;
  const colourAt = (x, z) => { const c = inCore(x, z) ? col : colCity, k = inCore(x, z) ? pxOf(m, x, z) : pxOf(mc, x, z); return [c[k * 3], c[k * 3 + 1], c[k * 3 + 2]]; };
  const roads = new SegHash(24);
  for (const r of L.ROADS) if (r.zone !== "far") for (let i = 1; i < r.pts.length; i++) roads.add(r.pts[i - 1], r.pts[i], r);
  const lots = new SegHash(24);
  for (const l of L.LOTS) if (l.zone !== "far") lots.add([l.obb.cx, l.obb.cz], [l.obb.cx, l.obb.cz], l);
  const inLot = (x, z) => lots.near(x, z, 30).some((s) => { const o = s.data.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + 2 && Math.abs(lz) < o.d / 2 + 2; });
  const lotNear = (x, z, m) => lots.near(x, z, 30 + m).some((s) => { const o = s.data.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + m && Math.abs(lz) < o.d / 2 + m; });
  const roadNear = (x, z, m) => roads.near(x, z, 12 + m).some((s) => segDist(x, z, s.a, s.b).d < s.data.width / 2 + m);
  const onRoad = (x, z) => roads.near(x, z, 12).some((s) => segDist(x, z, s.a, s.b).d < s.data.width / 2 + 1.8);
  // [v4:town-accuracy] OSM land use where no tree stands (© OpenStreetMap contributors)
  const OPEN = new Set(["sport", "parking", "field", "construction", "beach"]);   // cemeteries on the hills stand in woods: the photo decides there
  const open = (L.LANDUSE || []).filter((l) => OPEN.has(l.cls)).map((l) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of l.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { l, x0, z0, x1, z1 }; });
  const inRing = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const openGround = (x, z) => open.some((o) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && inRing(x, z, o.l.ring) && !(o.l.holes || []).some((h) => inRing(x, z, h)));
  const H = L.ZONES.hero;
  const rows = [];
  const cands = [];
  // regions: the core round the hero zone, and 大島's 亀山 (the terraces of 亀山テラス360°, landmarks/sites.js); a tree's
  // priority is its distance from its region's centre
  const REGIONS = [{ cx: H.cx, cz: H.cz, r: NEAR_R, hero: true, max: MAX - 5000, step: SPACING }, { cx: 3760, cz: 3720, r: 620, max: 5000, step: 10 }];
  // 亀山: clear of the monorail (8 m), its stations, the summit terraces, café and rest houses, the car park
  const K = KAMEYAMA, kSites = [K.lowerStation.at, K.upperStation.at, K.cafe.at, K.restHouse1.at, ...K.terraces.map((t) => t.at), ...K.lotCentres];
  const kameyamaClear = (x, z) => {
    if (Math.hypot(x - 3700, z - 3700) > 900) return false;
    for (let i = 1; i < K.rail.length; i++) if (segDist(x, z, K.rail[i - 1], K.rail[i]).d < 8) return true;
    if (kSites.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 18)) return true;
    if (Math.hypot(x - K.summit[0], z - K.summit[1]) < 28) return true;
    return inRing(x, z, K.parking.poly) || inRing(x, z, K.restHouse2.poly);
  };
  const farLots = new SegHash(40);
  for (const l of L.LOTS) if (l.zone === "far" && Math.hypot(l.obb.cx - 3760, l.obb.cz - 3720) < 900) farLots.add([l.obb.cx, l.obb.cz], [l.obb.cx, l.obb.cz], l);
  const inFarLot = (x, z) => farLots.near(x, z, 40).some((s) => { const o = s.data.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); return Math.abs(dx * c - dz * sn) < o.w / 2 + 3 && Math.abs(dx * sn + dz * c) < o.d / 2 + 3; });
  const farRoads = new SegHash(40);
  for (const r of L.ROADS) if (r.zone === "far" && r.pts.some(([x, z]) => Math.hypot(x - 3760, z - 3720) < 900)) for (let i = 1; i < r.pts.length; i++) farRoads.add(r.pts[i - 1], r.pts[i], r);
  const onFarRoad = (x, z) => farRoads.near(x, z, 16).some((s) => segDist(x, z, s.a, s.b).d < s.data.width / 2 + 2);
  const seen = new Set();
  for (const G of REGIONS) for (let z = Math.round((G.cz - G.r) / G.step) * G.step; z <= G.cz + G.r; z += G.step) for (let x = Math.round((G.cx - G.r) / G.step) * G.step; x <= G.cx + G.r; x += G.step) {
    if (seen.has(x + "," + z)) continue; seen.add(x + "," + z);
    const r = mulberry(hash32(`${x},${z}`));
    const jx = x + (r() - 0.5) * G.step * 0.9, jz = z + (r() - 0.5) * G.step * 0.9;
    const dc0 = Math.hypot(jx - G.cx, jz - G.cz);
    if (dc0 > G.r) continue;
    const dc = G.hero ? dc0 : Math.hypot(jx - H.cx, jz - H.cz);
    const f = forestAt(jx, jz);
    if (f < 0.35 || r() > f * 1.05) continue;
    if (L.shoreDist(jx, jz) > (dc < 480 ? -16 : -3)) continue;   // keep the promenade and quays clear
    const y = L.heightAt(jx, jz);
    if (onRoad(jx, jz) || inLot(jx, jz)) continue;
    if (!G.hero && (kameyamaClear(jx, jz) || inFarLot(jx, jz) || onFarRoad(jx, jz))) continue;
    if (openGround(jx, jz)) continue;   // [v4:town-accuracy] no trees on pitches, car parks, fields, building sites (OSM land use)
    // inside the hero town keep trees to the wooded slopes and 神明崎 (gardens get street trees from town)
    const shinmei = Math.hypot(jx - L.SPOTS.shinmeizaki.x, jz - L.SPOTS.shinmeizaki.z) < 70;
    if (dc < L.ZONES.hero.r + 40 && !shinmei && (f < 0.62 || y < 14 || lotNear(jx, jz, 7) || roadNear(jx, jz, 5))) continue;
    const cc = colourAt(jx, jz), cedar = Math.abs(cc[0] - CEDAR[0]) + Math.abs(cc[1] - CEDAR[1]) + Math.abs(cc[2] - CEDAR[2]) < 20;
    const type = cedar ? (r() < 0.85 ? 0 : 1) : r() < 0.1 ? 2 : r() < 0.2 ? 0 : 1;
    const hgt = type === 0 ? 11 + r() * 8 : 7 + r() * 6;
    const rad = type === 0 ? hgt * (0.2 + r() * 0.05) : 3.2 + r() * 2.6;
    // nearer trees first (they win when the budget runs out)
    cands.push({ g: G, d: dc0 + r() * 120, row: [Math.round(jx * 10) / 10, Math.round(jz * 10) / 10, Math.round(y * 100) / 100, type, Math.round(hgt * 10) / 10, Math.round(rad * 10) / 10, Math.floor(r() * 256)] });
  }
  cands.sort((a, b) => a.d - b.d);
  const taken = new Map();
  for (const c of cands) { const n = taken.get(c.g) || 0; if (n >= c.g.max) continue; taken.set(c.g, n + 1); rows.push(c.row); }
  return { version: 2, fields: ["x", "z", "y", "type", "height", "radius", "tint"], types: ["cedar", "broadleaf", "autumn"], nearR: NEAR_R, regions: REGIONS.map(({ cx, cz, r, max }) => ({ cx, cz, r, max, n: taken.get(REGIONS.find((g) => g.cx === cx)) || 0 })), rows };
}

if (import.meta.main) {
  const t0 = performance.now();
  const out = await buildTrees();
  await Bun.write(join(ROOT, "data/anime/trees.json"), JSON.stringify(out));
  const n = [0, 0, 0]; for (const r of out.rows) n[r[3]]++;
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), trees: out.rows.length, cedar: n[0], broadleaf: n[1], autumn: n[2] }));
}
