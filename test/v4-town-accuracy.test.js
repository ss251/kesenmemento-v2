// [v4:town-accuracy] The town on the real data: footprint wings, rivers and bridges, land use, signals and route
// shields, real names on signs, the accuracy audit's maths (CIEDE2000 against Sharma et al. 2005, raster masks), the
// forest-mask fix of build-trees.js and the carved river beds of build-grids.js.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const L = await import('../src/anime/world/layout.js');
const W = await import('../src/anime/world/town/wings.js');
const { kawaraColour } = await import('../src/anime/world/town/palette.js');
const RV = await import('../src/anime/world/town/rivers.js');
const LU = await import('../src/anime/world/town/landuse.js');
const SG = await import('../src/anime/world/town/signals.js');
const { dE2000, fillRing, stampLine, lab } = await import('../tools/anime/accuracy-lib.mjs');
const ROOT = join(import.meta.dir, '..');

// realnames.js imports three only for meshes; its pure helpers are safe to import
const RN = await import('../src/anime/world/town/realnames.js');

test('wings: an L-shaped footprint becomes a main wing and an annex that cover it exactly', () => {
  const lot = { obb: { cx: 0, cz: 0, w: 12, d: 10, rotY: 0 }, poly: [[-6, -5], [6, -5], [6, 0], [0, 0], [0, 5], [-6, 5]] };
  const w = W.wings(lot);
  expect(w.simple).toBe(false);
  expect(w.rects.length).toBe(2);
  expect(w.rects.reduce((a, r) => a + r.area, 0)).toBeCloseTo(90, 5);
  expect(w.fill).toBeCloseTo(1, 5);
  expect(w.rects[0].area).toBeGreaterThanOrEqual(w.rects[1].area);
  // the shared side is not an outside wall, so the walls are inset under the eaves on the outside only
  const s0 = W.outerSides(w.rects[0], w.rects), s1 = W.outerSides(w.rects[1], w.rects);
  expect(Object.values(s0).filter((v) => !v).length + Object.values(s1).filter((v) => !v).length).toBe(2);
  const b0 = W.bodyOf(w.rects[0], s0, 0.5);
  expect(b0.w).toBeCloseTo(w.rects[0].w - (s0.px ? 0.5 : 0) - (s0.nx ? 0.5 : 0), 5);
});

test('wings: rectangles stay whole, rotated U shapes split into three, and the frame round-trips', () => {
  const box = { obb: { cx: 5, cz: 7, w: 8, d: 6, rotY: 0.4 }, poly: [] };
  const c = Math.cos(0.4), s = Math.sin(0.4);
  box.poly = [[-4, -3], [4, -3], [4, 3], [-4, 3]].map(([x, z]) => [5 + x * c + z * s, 7 - x * s + z * c]);
  expect(W.wings(box).simple).toBe(true);
  const lp = W.localPoly(box);
  expect(lp[0][0]).toBeCloseTo(-4, 6); expect(lp[0][1]).toBeCloseTo(-3, 6);
  const back = W.toWorld(box.obb, lp[2][0], lp[2][1]);
  expect(back[0]).toBeCloseTo(box.poly[2][0], 6); expect(back[1]).toBeCloseTo(box.poly[2][1], 6);
  const U = { obb: { cx: 0, cz: 0, w: 12, d: 10, rotY: 0.7 }, poly: [[-6, -5], [6, -5], [6, 5], [3, 5], [3, 0], [-3, 0], [-3, 5], [-6, 5]] };
  const c2 = Math.cos(0.7), s2 = Math.sin(0.7); U.poly = U.poly.map(([x, z]) => [x * c2 + z * s2, -x * s2 + z * c2]);
  const wu = W.wings(U);
  expect(wu.rects.length).toBe(3);
  expect(wu.rects.reduce((a, r) => a + r.area, 0)).toBeCloseTo(90, 4);
});

test('wings: inset rings shrink inward whatever the winding; simplify keeps corners', () => {
  for (const ring of [[[0, 0], [10, 0], [10, 10], [0, 10]], [[0, 0], [0, 10], [10, 10], [10, 0]]]) {
    const r = W.insetRing(ring, 1);
    expect(W.ringArea(r)).toBeCloseTo(64, 5);
    for (const [x, z] of r) { expect(x).toBeGreaterThan(0.5); expect(z).toBeLessThan(9.5); }
  }
  const noisy = [[0, 0], [5, 0.05], [10, 0], [10, 10], [5, 9.95], [0, 10]];
  expect(W.simplifyRing(noisy, 0.2).length).toBe(4);
});

test('wings: the real hero + mid footprints are covered better than their bounding boxes', () => {
  let polyA = 0, obbA = 0, wingA = 0;
  for (const lot of L.LOTS.filter((l) => l.zone !== 'far').slice(0, 1200)) {
    const a = W.ringArea(lot.poly); polyA += a; obbA += lot.obb.w * lot.obb.d;
    wingA += W.wings(lot).rects.reduce((s, r) => s + r.area, 0);
  }
  // the OBBs overstate the footprint area by ~20 %; the wings by a few per cent at most
  expect(obbA / polyA).toBeGreaterThan(1.1);
  expect(Math.abs(wingA / polyA - 1)).toBeLessThan(0.08);
});

test('palette: 瓦 only on tile-coloured roofs', () => {
  expect(kawaraColour('#4a4f58')).toBe(true);
  expect(kawaraColour('#6a5448')).toBe(true);
  expect(kawaraColour('#8e4540')).toBe(false);   // red painted metal
  expect(kawaraColour('#4a78a0')).toBe(false);   // blue painted metal
  expect(kawaraColour('#d8dbd6')).toBe(false);   // pale
});

test('real names: sign text, the disaster filter holds, and only public facilities and shops get a board', () => {
  expect(RN.signName('気仙沼第二保育所 (Kesennuma Daini Nursery School)')).toBe('気仙沼第二保育所');
  expect(RN.signName('南町1丁目共同化建物')).toBe(null);
  expect(RN.signName('旧ホテル望洋館')).toBe(null);
  expect(RN.wantsSign({ name: '齋藤魚店', use: 'shop:seafood' })).toBe(true);
  expect(RN.wantsSign({ name: '七十七銀行 気仙沼支店', use: 'amenity:bank' })).toBe(true);
  expect(RN.wantsSign({ name: '北洋無線 気仙沼営業所', use: 'office:company' })).toBe(false);
  expect(RN.wantsSign({ name: '気仙沼市立気仙沼小学校', facility: 'school' })).toBe(true);
  const named = L.LOTS.filter((l) => l.zone !== 'far' && RN.wantsSign(l));
  expect(named.length).toBeGreaterThan(100);
  for (const l of named) expect(/津波|震災|被災|復興|慰霊|伝承館|遺構/.test(l.name)).toBe(false);
});

test('rivers: 大川 and 鹿折川 run in their carved GSI channels with a water level under the banks', () => {
  const H = L.ZONES.hero;
  const chs = RV.channels(L, { near: (x, z) => Math.hypot(x - H.cx, z - H.cz) < 3200, step: 4 });
  const names = new Set(chs.map((c) => c.name));
  expect(names.has('大川')).toBe(true);
  expect(names.has('鹿折川')).toBe(true);
  const okawa = chs.filter((c) => c.name === '大川').sort((a, b) => b.S.length - a.S.length)[0];
  const wet = okawa.S.filter((p) => p.wet);
  expect(wet.length / okawa.S.length).toBeGreaterThan(0.6);
  for (let i = 1; i < okawa.S.length; i++) expect(okawa.S[i].y).toBeLessThanOrEqual(okawa.S[i - 1].y + 1e-9);   // never rises downstream
  for (const p of wet) expect(p.y).toBeGreaterThanOrEqual(0.08);
  // the water stands under the dry bank (smoothing and the no-rise rule allow a little slack)
  expect(wet.filter((p) => p.y < p.bank + 0.3).length / wet.length).toBeGreaterThan(0.9);
  // the carved bed (build-grids.js) sits under the water level on the channel centre
  let under = 0; for (const p of wet) if (L.heightAt(p.x, p.z) < p.y) under++;
  expect(under / wet.length).toBeGreaterThan(0.8);
  // 気仙沼大橋 (the 20 m street over 大川) is bridged
  const roads = L.ROADS.filter((r) => r.zone !== 'far');
  const X = RV.crossings(roads, chs);
  expect(X.some((c) => c.road.id === 'r15411' || Math.hypot(c.x + 293, c.z - 1196) < 40)).toBe(true);
  const idx = RV.channelIndex(chs);
  const mid = wet[Math.floor(wet.length / 2)];
  expect(idx.at(mid.x, mid.z)).not.toBe(null);
  expect(idx.at(mid.x + 200, mid.z + 200)).toBe(null);
});

test('land use: draped surfaces keep the polygon area; car parks, school yards and pitches exist in the core', () => {
  const ring = [[0, 0], [40, 0], [40, 25], [0, 25]], hole = [[10, 10], [15, 10], [15, 15], [10, 15]];
  const t = LU.drapeTriangles(ring, [hole], 6);
  let a = 0; for (let i = 0; i < t.length; i += 3) a += Math.abs((t[i + 1][0] - t[i][0]) * (t[i + 2][1] - t[i][1]) - (t[i + 2][0] - t[i][0]) * (t[i + 1][1] - t[i][1])) / 2;
  expect(a).toBeCloseTo(1000 - 25, 3);
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) expect(Math.hypot(t[i + k][0] - t[i + (k + 1) % 3][0], t[i + k][1] - t[i + (k + 1) % 3][1])).toBeLessThanOrEqual(6 + 1e-9);
  const fr = LU.ringFrame(ring);
  expect(Math.abs(fr.ux)).toBeCloseTo(1, 6);
  const M = L.ZONES.mid;
  const polys = LU.landuseIn(L, (x, z) => Math.hypot(x - M.cx, z - M.cz) < M.r);
  const cls = new Set(polys.map((p) => p.cls));
  for (const c of ['parking', 'school', 'sport', 'construction', 'park']) expect(cls.has(c)).toBe(true);
  const inParking = LU.parkingIndex(L);
  const P = L.LANDUSE.find((l) => l.cls === 'parking');
  const c0 = P.ring.reduce((s, p) => [s[0] + p[0] / P.ring.length, s[1] + p[1] / P.ring.length], [0, 0]);
  expect(typeof inParking(c0[0], c0[1])).toBe('boolean');
  expect(inParking(99999, 99999)).toBe(false);
});

test('signals: OSM signals control real junctions of the core, and route shields know 国道 from 県道', () => {
  const roads = L.ROADS.filter((r) => r.zone !== 'far');
  const nodes = SG.junctionsFrom(roads);
  const M = L.ZONES.mid;
  const sj = SG.signalJunctions(L.SIGNALS.filter((s) => Math.hypot(s.x - M.cx, s.z - M.cz) < M.r + 150), nodes);
  expect(sj.length).toBeGreaterThanOrEqual(15);
  for (const n of sj) expect(n.arms.length).toBeGreaterThanOrEqual(3);
  expect(SG.shieldKind({ ref: '45', kind: 'city' })).toBe('国道');
  expect(SG.shieldKind({ ref: '284' })).toBe('国道');
  expect(SG.shieldKind({ ref: '26', kind: 'prefectural' })).toBe('県道');
  expect(SG.shieldKind({ ref: 'E45' })).toBe(null);
  expect(SG.refOf({ ref: '218;26' })).toBe('218');
  const refs = new Set(roads.map(SG.refOf).filter(Boolean));
  for (const r of ['26', '218']) expect(refs.has(r)).toBe(true);
});

// [v4:integrate] the signals run a real cycle (signalState is the lamp shader's logic)
test('signals cycle: one axis at a time, amber between, all-red clearance, walkers with the other axis', () => {
  const C = SG.SIGNAL_CYCLE, st = (type, group, t) => SG.signalState(type, group, 0, t);
  for (let t = 0; t < C.period; t += 0.25) {
    for (const g of [0, 1]) expect(st(0, g, t) + st(1, g, t) + st(2, g, t)).toBe(1);          // exactly one lamp per head
    expect(st(0, 0, t) && st(0, 1, t)).toBe(0);                                                 // never both greens
    expect((st(0, 0, t) || st(1, 0, t)) && (st(0, 1, t) || st(1, 1, t))).toBe(0);             // no conflicting go
    for (const g of [0, 1]) {
      expect(st(3, g, t) + (st(3, g, t) ? 0 : 1)).toBe(1);
      if (st(4, g, t)) expect(st(0, g, t) || st(1, g, t)).toBe(0);                                // walkers never cross moving traffic
    }
  }
  expect(st(0, 0, 1)).toBe(1); expect(st(2, 1, 1)).toBe(1); expect(st(4, 1, 1)).toBe(1);       // main green, cross red, walk across the cross arms
  expect(st(1, 0, 26)).toBe(1); expect(st(2, 0, 29) + st(2, 1, 29)).toBe(2);                   // amber, then all red
  expect(st(0, 1, 31)).toBe(1);
  const flash = [18.1, 18.6, 19.1, 19.6].map((t) => st(4, 1, t));
  expect(flash).toEqual([1, 0, 1, 0]);                                                           // the green figure flashes before red
  expect(SG.signalOffset(100.3, -20.7)).toBe(SG.signalOffset(100.3, -20.7));
  expect(SG.signalOffset(100.3, -20.7)).toBeGreaterThanOrEqual(0); expect(SG.signalOffset(100.3, -20.7)).toBeLessThan(C.period);
});

test('accuracy maths: CIEDE2000 matches Sharma, Wu & Dalal (2005); masks fill the right area', () => {
  expect(dE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
  expect(dE2000([50, -1.3802, -84.2814], [50, 0, -82.7485])).toBeCloseTo(1.0, 4);
  expect(dE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
  expect(dE2000([2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514])).toBeCloseTo(0.9082, 4);
  const white = lab([255, 255, 255]); expect(white[0]).toBeCloseTo(100, 1); expect(Math.abs(white[1])).toBeLessThan(0.5);
  const px = 200, m = new Uint8Array(px * px);
  fillRing(m, px, 0, 0, 0.5, [[10, 10], [60, 10], [60, 40], [10, 40]], 1);   // 50 x 30 m = 1500 m2 = 6000 px
  let n = 0; for (const v of m) n += v & 1;
  expect(n).toBe(6000);
  fillRing(m, px, 0, 0, 0.5, [[20, 20], [30, 20], [30, 30], [20, 30]], 1, true);
  n = 0; for (const v of m) n += v & 1; expect(n).toBe(6000 - 400);
  const r = new Uint8Array(px * px); stampLine(r, px, 0, 0, 0.5, [[0, 50], [100, 50]], 2, 2);
  n = 0; for (const v of r) n += v ? 1 : 0; expect(n).toBeGreaterThan(1500); expect(n).toBeLessThan(1700);   // ~4 m x 100 m
});

test('trees: the forest mask is read per pixel (no trees on the 気仙沼小 / 中学校 pitches)', () => {
  const T = JSON.parse(readFileSync(join(ROOT, 'data/anime/trees.json'), 'utf8'));
  const pitches = L.LANDUSE.filter((l) => l.cls === 'sport' || l.cls === 'parking');
  let on = 0;
  for (const [x, z] of T.rows) for (const p of pitches) if (LU.inPoly(x, z, p.ring, p.holes || [])) { on++; break; }
  expect(on).toBe(0);
  expect(readFileSync(join(ROOT, 'scripts/anime/build-trees.js'), 'utf8')).toContain('frRaw.data[k * FC]');
});

test('the accuracy audit tool is wired: gate-only browser, its outputs and truth sources are named', () => {
  const src = readFileSync(join(ROOT, 'tools/anime/accuracy.mjs'), 'utf8');
  expect(src).toContain("from './cdp.mjs'");
  for (const k of ['accuracy', 'side', 'mosaic', 'iou', 'dE2000', 'centrelineRecall', 'landmarks', '© OpenStreetMap contributors']) expect(src).toContain(k);
  expect(src).not.toMatch(/Math\.random/);
});
