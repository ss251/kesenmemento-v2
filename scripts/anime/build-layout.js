// [v3:foundation] Real-data layout for the anime world -> data/anime/layout.json (+ grids from build-grids.js).
//   env -u NODE_OPTIONS bun run scripts/anime/vt.js           (once: decode raw/tiles -> data/cache/anime/vt.json)
//   env -u NODE_OPTIONS bun run scripts/anime/build-grids.js  (terrain + sea grids)
//   env -u NODE_OPTIONS bun run scripts/anime/build-layout.js (this: zones, water, quays, roads, lots, poles, spots, tour)
// Everything is deterministic (seeded by ids). Pure maths lives in derive.js (tested in test/v3-layout.test.js).
import { join } from "node:path";
import { ROOT } from "../terrain/tiles.js";
import { openGrids, makeSampler } from "../../src/anime/world/layout/grids.js";
import {
  hash32, polyArea, centroid, minAreaRect, obbSides, rotYFacing, segDist, SegHash, polylineLength, alongPolyline,
  nominalWidth, roadKind, classifyLot, lotRoofColor, lotWallColor, roadWidthFromEdges, simplify, quayKind,
} from "./derive.js";
import { CACHE } from "./vt.js";

export const ZONES = {
  hero: { cx: 180, cz: -20, r: 380 },
  mid: { cx: 250, cz: 150, r: 1100 },
  far: { x0: -6506, z0: -9325, x1: 10843, z1: 8437 },
};
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const P1 = (p) => [r1(p[0]), r1(p[1])];
export function zoneOf(x, z, pad = 0) {
  if (Math.hypot(x - ZONES.hero.cx, z - ZONES.hero.cz) <= ZONES.hero.r + pad) return "hero";
  if (Math.hypot(x - ZONES.mid.cx, z - ZONES.mid.cz) <= ZONES.mid.r + pad) return "mid";
  return "far";
}
const inFar = (x, z) => x >= ZONES.far.x0 && x <= ZONES.far.x1 && z >= ZONES.far.z0 && z <= ZONES.far.z1;

export async function buildLayout() {
  const t0 = performance.now();
  const vt = await Bun.file(join(CACHE, "vt.json")).json();
  const meta = await Bun.file(join(ROOT, "data/anime/grids.json")).json();
  const S = makeSampler(openGrids(meta, await Bun.file(join(ROOT, "data/anime/grids.bin")).arrayBuffer()));
  const bld = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
  const landmarks = await Bun.file(join(ROOT, "data/landmarks.json")).json();
  const LM = Object.fromEntries(landmarks.map((l) => [l.id, l]));
  const log = {};

  // ---------------------------------------------------------------- roads (RdCL) + widths from road edges (RdEdg)
  const edgeHash = new SegHash(24);
  for (const e of vt.RdEdg) for (let i = 1; i < e.pts.length; i++) edgeHash.add(e.pts[i - 1], e.pts[i], null);
  const ROADS = [];
  let measured = 0;
  vt.RdCL.forEach((f, i) => {
    const pts = f.pts;
    const mid = alongPolyline(pts, polylineLength(pts) / 2).p;
    if (!inFar(mid[0], mid[1])) return;
    const zone = zoneOf(mid[0], mid[1], 60);
    let kind = roadKind(f);
    const nominal = nominalWidth(f);
    if (zone === "far" && kind === "alley") return;
    let width = nominal;
    if (zone !== "far") {
      const w = roadWidthFromEdges(pts, f.rnkwidth, edgeHash);
      if (w) { width = w; measured++; }
    }
    ROADS.push({ id: "r" + i, pts: (zone === "far" ? simplify(pts, 2) : pts).map(P1), width: r1(width), kind, zone, rank: f.rnkwidth, code: f.code });
  });
  log.roads = { n: ROADS.length, measured }; console.error("roads", Math.round(performance.now() - t0));
  const roadHash = new SegHash(32);
  for (const r of ROADS) for (let i = 1; i < r.pts.length; i++) roadHash.add(r.pts[i - 1], r.pts[i], r);

  // ---------------------------------------------------------------- water polygons (sea, WA 5100)
  const WATER = [];
  for (const f of vt.WA) {
    if (f.code !== 5100) continue;
    const c = centroid(f.outer);
    const near = zoneOf(c[0], c[1], 400) !== "far";
    const ring = simplify(f.outer, near ? 0.6 : 6).map(P1);
    if (ring.length >= 3) WATER.push({ zone: near ? "mid" : "far", ring, holes: f.holes.map((h) => simplify(h, near ? 0.6 : 6).map(P1)).filter((h) => h.length >= 3) });
  }
  log.water = WATER.length; console.error("water", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- quays (coastline pieces <= 24 m, classified)
  const QUAYS = [];
  for (const c of vt.Cstline) {
    const pts = c.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      const n = Math.max(1, Math.ceil(L / 24));
      for (let k = 0; k < n; k++) {
        const pa = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], pb = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
        if (!inFar(mx, mz)) continue;
        const zone = zoneOf(mx, mz);
        if (zone === "far") continue;
        // inland normal: the side where the shore distance is negative
        const dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        const s1 = S.shoreDist(mx + nx * 6, mz + nz * 6), s2 = S.shoreDist(mx - nx * 6, mz - nz * 6);
        const inl = s1 < s2 ? 1 : -1;
        const lx = mx + nx * inl * 8, lz = mz + nz * inl * 8;
        const land = S.heightAt(lx, lz), far = S.heightAt(mx + nx * inl * 30, mz + nz * inl * 30);
        const kind = quayKind({ x: mx, z: mz, zone, land, slope: (far - land) / 22, roadNear: roadHash.near(lx, lz, 14).some((s) => segDist(lx, lz, s.a, s.b).d < 10) });
        QUAYS.push({ a: P1(pa), b: P1(pb), top: r2(Math.max(1.2, Math.min(kind === "rocks" || kind === "beach" ? 2.2 : 4.2, land))), kind, zone });
      }
    }
  }
  log.quays = QUAYS.length; console.error("quays", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- lots
  const tagged = landmarkTags(LM);
  const LOTS = [];
  for (const b of bld.features) {
    const ring = b.poly;
    if (!ring || ring.length < 3) continue;
    const A = Math.abs(polyArea(ring));
    if (A < 6) continue;
    const c = centroid(ring);
    if (!inFar(c[0], c[1])) continue;
    const zone = zoneOf(c[0], c[1]);
    const box = minAreaRect(ring);
    // frontage: the OBB side whose outward normal best faces the nearest road
    let best = null;
    for (const s of roadHash.near(c[0], c[1], 40)) {
      const q = segDist(c[0], c[1], s.a, s.b);
      if (!best || q.d < best.d) best = { d: q.d, q: q.q, road: s.data };
    }
    const sides = obbSides(box);
    let side = sides[2], front = null;
    if (best) {
      const vx = best.q[0] - c[0], vz = best.q[1] - c[1], vl = Math.hypot(vx, vz) || 1;
      side = sides.reduce((m, sd) => ((sd.n[0] * vx + sd.n[1] * vz) / vl > (m.n[0] * vx + m.n[1] * vz) / vl ? sd : m), sides[0]);
      const fd = Math.max(0, best.d - (side.half || 0) - best.road.width / 2);
      front = { kind: best.road.kind, width: best.road.width, dist: fd, roadId: best.road.id };
    } else {
      // no road: face the downhill side (toward the sea usually)
      side = sides.reduce((m, sd) => (S.heightAt(sd.mid[0], sd.mid[1]) < S.heightAt(m.mid[0], m.mid[1]) ? sd : m), sides[0]);
    }
    const w = side.len, d = 2 * side.half;
    const rotY = rotYFacing(side.n[0], side.n[1]);
    const tag = tagged(c, A, b);
    const shore = S.shoreDist(c[0], c[1]);
    const cls = classifyLot({ id: b.id, code: b.code, area: A, h: b.h, zone, shore, front, tag: tag?.kind });
    if (tag?.storeys) { cls.storeys = tag.storeys; cls.height = tag.height; }
    // ground: the lowest of centre + OBB corners (never float); the frontage height too
    const ca = Math.cos(box.ang), sa = Math.sin(box.ang);
    let gy = S.heightAt(c[0], c[1]);
    for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) gy = Math.min(gy, S.heightAt(box.cx + ca * box.hu * u - sa * box.hv * v, box.cz + sa * box.hu * u + ca * box.hv * v));
    const roofShape = tag?.roof || cls.roofShape;
    const lot = {
      id: b.id, zone, kind: cls.kind,
      poly: (zone === "far" ? simplify(ring, 0.8) : ring).map(P1),
      obb: { cx: r2(box.cx), cz: r2(box.cz), w: r2(w), d: r2(d), rotY: r3(rotY) },
      front: { rotY: r3(rotY), roadId: front?.roadId ?? null, x: r2(side.mid[0]), z: r2(side.mid[1]), dist: front ? r1(front.dist) : null },
      storeys: cls.storeys, height: cls.height, groundY: r2(Math.max(0.6, gy)),
      roof: { shape: roofShape, color: tag?.roofColor || lotRoofColor(cls.kind, roofShape, b.rgbWB || b.rgb, b.id) },
      wall: lotWallColor(cls.kind, b.id), seed: hash32(b.id), area: Math.round(A),
    };
    if (tag?.landmark) lot.landmark = tag.landmark;
    LOTS.push(lot);
  }
  console.error("lots", Math.round(performance.now() - t0));
  LOTS.sort((a, b) => (a.zone === b.zone ? 0 : a.zone === "hero" ? -1 : b.zone === "hero" ? 1 : a.zone === "mid" ? -1 : 1));
  log.lots = { n: LOTS.length, hero: LOTS.filter((l) => l.zone === "hero").length, mid: LOTS.filter((l) => l.zone === "mid").length, kinds: count(LOTS.filter((l) => l.zone !== "far"), "kind") };

  // ---------------------------------------------------------------- utility pole runs (hero + mid streets)
  const lotHash = new SegHash(24);
  for (const l of LOTS) if (l.zone !== "far") { const o = l.obb; lotHash.add([o.cx, o.cz], [o.cx, o.cz], l); }
  const POLE_RUNS = [];
  for (const r of ROADS) {
    if (r.zone === "far" || r.kind === "bridge" || r.width < 3.2) continue;
    const L = polylineLength(r.pts);
    if (L < 45) continue;
    const spacing = 28 + (hash32(r.id) % 9);
    const sideSign = hash32(r.id + "side") & 1 ? 1 : -1;
    let pts = [];
    const flush = () => { if (pts.length >= 2) POLE_RUNS.push({ roadId: r.id, pts }); pts = []; };
    for (let s = spacing * 0.35; s < L; s += spacing) {
      const { p, t } = alongPolyline(r.pts, s);
      const off = r.width / 2 + 0.45;
      const x = p[0] - t[1] * off * sideSign, z = p[1] + t[0] * off * sideSign;
      if (S.shoreDist(x, z) > -1.5) { flush(); continue; }
      // keep clear of building footprints (pole must stand on the sidewalk)
      const clash = lotHash.near(x, z, 30).some((s2) => { const o = s2.data.obb; const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + 0.2 && Math.abs(lz) < o.d / 2 + 0.2; });
      if (clash) { flush(); continue; }
      const last = pts[pts.length - 1];
      if (last && Math.hypot(x - last[0], z - last[1]) > 45) flush();
      pts.push([r1(x), r1(z)]);
    }
    flush();
  }
  log.poleRuns = POLE_RUNS.length; console.error("poles", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- spots, tour, hero
  const SPOTS = spots(S, ROADS, QUAYS, LM, vt);
  const TOUR = tour(S, LM);
  const HERO = {
    // 16:30 drone over the inner bay toward 安波山 (glittering bay left, 神明崎 + town right); walk: the north-shore
    // promenade looking along the seawall toward 神明崎 (sun from behind-right)
    drone: { pos: [400, 95, 90], look: [80, 10, -220] },
    walk: { x: 168, z: -122, y: Math.round(S.heightAt(168, -122) * 100) / 100, yaw: 111, pitch: 2 },   // [v3:fix] the promenade deck looking west along the seawall (the old spot faced the rocks)
  };
  log.ms = Math.round(performance.now() - t0);
  return { version: 1, generated: "scripts/anime/build-layout.js", origin: { lat: 38.906, lon: 141.575 }, zones: ZONES, water: WATER, quays: QUAYS, roads: ROADS, lots: LOTS, poleRuns: POLE_RUNS, spots: SPOTS, tour: TOUR, hero: HERO, log };
}

function count(arr, k) { const o = {}; for (const a of arr) o[a[k]] = (o[a[k]] || 0) + 1; return o; }

/** Buildings that are landmarks (dedicated models) or have a known use. */
function landmarkTags(LM) {
  const mk = LM.market.enu;
  return (c, A, b) => {
    // 気仙沼市魚市場: the long market sheds along the quay around the landmark point
    if (A > 1200 && Math.hypot(c[0] - mk[0], c[1] - mk[2]) < 260) return { kind: "landmark", landmark: "fishMarket", roof: "flat", roofColor: "#dcdcd4", storeys: 2, height: 9.5 };
    // 五十鈴神社 on 神明崎 (read from the ortho: the tiled hall on the peninsula)
    if (Math.hypot(c[0] - 363, c[1] + 126) < 9) return { kind: "shrine", landmark: "isuzuShrine", roof: "gable", roofColor: "#56677a", storeys: 1, height: 5.2 };
    return null;
  };
}

function spots(S, ROADS, QUAYS, LM, vt) {
  const onLand = (x, z) => ({ x, z, y: Math.round(S.heightAt(x, z) * 100) / 100 });
  const bridgeAxis = (x, z, r) => {
    // longest bridge RdCL near a landmark -> end points (a, b) of the span
    let best = null;
    for (const f of vt.RdCL) {
      if (!(f.code === 2703 || f.code === 2713 || f.code === 2722 || f.code === 2704 || f.code === 2714)) continue;
      const p = f.pts; if (!p.some((q) => Math.hypot(q[0] - x, q[1] - z) < r)) continue;
      const L = polylineLength(p); if (!best || L > best.L) best = { L, a: p[0], b: p[p.length - 1], pts: p };
    }
    return best;
  };
  const osh = bridgeAxis(LM.oshima.enu[0], LM.oshima.enu[2], 500);
  const promenade = QUAYS.filter((q) => q.kind === "promenade").filter((_, i) => i % 3 === 0).map((q) => { const x = (q.a[0] + q.b[0]) / 2, z = (q.a[1] + q.b[1]) / 2; return { x: r1(x), z: r1(z), top: q.top, rotY: r3(Math.atan2(q.b[0] - q.a[0], q.b[1] - q.a[1]) + Math.PI / 2) }; });
  return {
    ukimido: { x: 341.6, z: -23.4, y: 1.6, rotY: 0, note: "浮見堂 pavilion on the water at the tip of 神明崎 (ortho)" },
    isuzuTorii: { ...onLand(340.5, -150), rotY: Math.PI, note: "五十鈴神社 torii at the north entrance of 神明崎, faces north (the road)" },
    isuzuShrine: { ...onLand(363, -126), rotY: Math.PI },
    shinmeizaki: { x: 352, z: -80, r: 45 },
    pier7: onLand(LM.pier7.enu[0], LM.pier7.enu[2]),
    ferryPiers: [{ x: 40, z: 10 }, { x: 60, z: 45 }],
    fishMarket: { ...onLand(LM.market.enu[0], LM.market.enu[2]) },
    innerBay: { x: 156, z: -33, note: "内湾 water centre" },
    // [v3:fix] the longest 27xx centre-line near the landmark was a 570 m land viaduct (2 % over water): use the verified
    // over-water line (GSI RdCL 2703, 120 deg, matches the ortho) and the pylons of harbor's fit through its centre
    kanae: { a: [1624.5, 1237.2], b: [1447.7, 1541.6], towers: [[1582, 1309.5], [1402, 1621.3]], deckY: 32, length: 352, center: { x: 1492.0, z: 1465.4 }, note: "GSI RdCL 2703 over-water centre-line, 120 deg; towers from the harbor fit" },
    oshima: osh ? { a: P1(osh.a), b: P1(osh.b), deckY: 26, length: Math.round(osh.L) } : { a: [2620, 2960], b: [2800, 3090], deckY: 26 },
    anbaLookout: { x: LM.anba.enu[0], z: LM.anba.enu[2], y: Math.round(S.heightAt(LM.anba.enu[0], LM.anba.enu[2]) * 10) / 10 },
    promenade,
    vending: [landNear(S, 128, -165), landNear(S, 62, -80), landNear(S, 222, -172), landNear(S, 40, 96)],
    cats: [landNear(S, 150, -150, 3), landNear(S, 96, -118, 3), landNear(S, 300, -160, 3)],
  };
}
/** Nearest land point (shore distance <= -min m) to (x, z), searched on rings of 2 m. */
function landNear(S, x, z, min = 6) {
  for (let r = 0; r < 120; r += 2) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (S.shoreDist(px, pz) <= -min && S.heightAt(px, pz) > 0.8) return { x: r1(px), z: r1(pz), y: r2(S.heightAt(px, pz)) };
  }
  return { x, z, y: r2(S.heightAt(x, z)) };
}
function towersOf(pts, n) {
  const L = polylineLength(pts), out = [];
  for (let i = 1; i <= n; i++) { const { p } = alongPolyline(pts, L * (i / (n + 1))); out.push(P1(p)); }
  return out;
}

function tour(S, LM) {
  // re-framed drone views (look from the sea side toward the hills; the 16:30 sun rakes from the WSW)
  const frames = {
    // [v3:fix] walk spots re-authored by screenshot (same as life/tour.js FRAMES; qa3 checks them): the old market spot
    // stood inside a hall, Pier 7 faced 60 % empty asphalt, 安波山 an empty deck; the bridges had none
    bay: { pos: [400, 95, 90], look: [80, 10, -220], walk: { x: 168, z: -122, yaw: 111, pitch: 2 } },
    market: { pos: [980, 150, 1080], look: [560, 5, 700], walk: { x: 654.5, z: 836.1, yaw: -155, pitch: 2 } },   // [v3:fix] behind the unloading scene
    pier7: { pos: [240, 70, 230], look: [40, 6, 60], walk: { x: 50, z: 70, yaw: -40, pitch: 4 } },
    kanae: { pos: [1560, 110, 2050], look: [1492, 40, 1465], walk: { x: 1513, z: 1742, yaw: 2, pitch: 8 } },
    oshima: { pos: [2300, 180, 2600], look: [2760, 30, 3060], walk: { x: 2780, z: 3252, yaw: 17, pitch: 5 } },
    anba: { pos: [-470, 290, -1040], look: [200, 0, 40], walk: { x: -490.22, z: -985.19, yaw: -146, pitch: -12 } },   // [v3:fix] rail out of frame
    karakuwa: { pos: [5200, 700, 5200], look: [7200, 60, 3300], walk: null },
  };
  return Object.values(LM).map((l) => {
    const f = frames[l.id] || { pos: l.cam.pos, look: l.cam.look, walk: null };
    return { id: l.id, ja: l.ja, en: l.en, enu: l.enu, drone: { pos: f.pos, look: f.look }, walk: f.walk };
  });
}

if (import.meta.main) {
  const L = await buildLayout();
  const { log, ...out } = L;
  const near = out.lots.filter((l) => l.zone !== "far"), far = out.lots.filter((l) => l.zone === "far");
  const KIND = [...new Set(far.map((l) => l.kind))], SHAPE = [...new Set(far.map((l) => l.roof.shape))], RC = [...new Set(far.map((l) => l.roof.color))], WC = [...new Set(far.map((l) => l.wall))];
  out.lots = near;
  out.farLots = { kinds: KIND, shapes: SHAPE, roofColors: RC, walls: WC,
    fields: ["id", "cx", "cz", "w", "d", "rotY", "storeys", "height", "groundY", "kind", "shape", "roof", "wall", "area"],
    rows: far.map((l) => [l.id, r1(l.obb.cx), r1(l.obb.cz), r1(l.obb.w), r1(l.obb.d), Math.round(l.obb.rotY * 100) / 100, l.storeys, l.height, r1(l.groundY), KIND.indexOf(l.kind), SHAPE.indexOf(l.roof.shape), RC.indexOf(l.roof.color), WC.indexOf(l.wall), l.area]) };
  for (const r of out.roads) if (r.zone === "far") r.pts = r.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
  const txt = JSON.stringify(out);
  await Bun.write(join(ROOT, "data/anime/layout.json"), txt);
  console.log(JSON.stringify({ ok: true, bytes: txt.length, ...log }));
}
