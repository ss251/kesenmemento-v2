// [v4:landmarks-B] The civic landmarks at their measured places and true dimensions (src/anime/world/landmarks;
// reference sheets docs/anime/landmarks/*.md): 気仙沼市役所 and the new city hall site, JR/BRT 気仙沼駅, リアス・アーク
// 美術館, the hospitals, the schools, the temples and the church, 亀山テラス360° with its monorail, 浦の浜.
// Builds the module headless (no GPU) and checks outlines, the layout tags that keep town off the landmark lots, the
// built parts, the monorail, the budgets and content hygiene. Rendering is checked by screenshots (shots/lmB, gitignored).
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

class Ctx2D {
  constructor(c) { this.canvas = c; this.font = '10px sans-serif'; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === '2d' ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return 'data:,'; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === 'canvas' ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
globalThis.HTMLCanvasElement ??= FakeCanvas;
globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(Date.now()), 16);
globalThis.innerWidth ??= 1280; globalThis.innerHeight ??= 720; globalThis.devicePixelRatio ??= 1;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });

const THREE = await import('three');
const L = await import('../src/anime/world/layout.js');
const { createContext } = await import('../src/anime/core/ctx.js');
const M = await import('../src/anime/world/landmarks/index.js');
const S = await import('../src/anime/world/landmarks/sites.js');
const { obbOf } = await import('../src/anime/world/harbor/lmkit.js');
const { schoolKind, schoolStoreys } = await import('../src/anime/world/landmarks/schools.js');
const { farLanduse, TOWN_LU } = await import('../src/anime/world/landmarks/farground.js');
const ROOT = join(import.meta.dir, '..');
const DIR = join(ROOT, 'src/anime/world/landmarks');

let ctx, R, scene;
beforeAll(async () => {
  scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'high', heroR: 1 }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  ctx.sky = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), uniforms: {}, setTime() {}, setHours() {} };
  ctx.pipeline = { compMat: { uniforms: {} } };
  R = await M.build(ctx);
}, 60000);

const area = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a) / 2; };

test('every builder runs without an error and reports its time', () => {
  expect(R.errors).toEqual([]);
  for (const id of ['station', 'rails', 'cityHall', 'riasArk', 'hospitals', 'schools', 'temples', 'oshima', 'ground']) { expect(R.built[id]).toBeTruthy(); expect(typeof R.ms[id]).toBe('number'); }
});

test('outlines at true dimensions (OSM, docs/anime/landmarks sheets)', () => {
  const dims = (k) => { const o = obbOf(S.OSM[k].poly); return [o.w, o.d]; };
  const near = ([w, d], [W, D], tol = 1.5) => { expect(Math.abs(w - W)).toBeLessThan(tol); expect(Math.abs(d - D)).toBeLessThan(tol); };
  near(dims('station'), [14.7, 66.6]);          // kesennuma-station.md: 66.6 × 14.7 m, 586 m²
  expect(Math.abs(area(S.OSM.station.poly) - 586)).toBeLessThan(20);
  near(dims('riasArk'), [41.6, 88.6]);          // rias-ark.md
  near(dims('cityHall'), [31, 68], 1.5);        // city-hall.md: 68 × 31 m, 1,206 m²
  expect(Math.abs(area(S.OSM.cityHall.poly) - 1206)).toBeLessThan(30);
  near(dims('oneTen'), [45, 47], 1.5);          // 45 × 47 m, 2,076 m²
  expect(Math.abs(area(S.OSM.cityHospital.poly) - 7883)).toBeLessThan(60);   // hospitals.md: OSM 7,883 m² (official 8,174)
  expect(Math.abs(area(S.OSM.otomo.poly) - 1438)).toBeLessThan(30);
  // 新庁舎: the office box of the plan grids (X 45.35 m, Y 54.55 m) and 24.75 m high, B1 + 4F (実施設計説明書)
  expect(S.NEW_CITY_HALL.box.w).toBe(45.35); expect(S.NEW_CITY_HALL.box.d).toBe(54.55); expect(S.NEW_CITY_HALL.height).toBe(24.75);
  // the plan's east face runs parallel to the site's east edge (OSM 819508282)
  const e = [[-809, 1309.7], [-842.6, 1237.8]], ux = (e[1][0] - e[0][0]) / Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
  expect(Math.abs(Math.abs(ux) - Math.abs(S.NEW_CITY_HALL.Z[0]))).toBeLessThan(0.02);
});

test('the layout tags every replaced lot, and only those', () => {
  const by = {};
  for (const l of L.LOTS) if (l.landmark) by[l.landmark] = (by[l.landmark] || 0) + 1;
  for (const k of ['cityHall', 'cityHall2', 'cityHall3', 'cityHallE', 'cityHallE2', 'oneTen', 'station', 'stationPlaza', 'riasArk', 'cityHospital', 'otomo', 'church', 'shorinji', 'seigoji', 'ikkeijima', 'newCityHallSite', 'kameyama', 'oshimaTerminal']) expect(by[k] || 0, k).toBeGreaterThan(0);
  // the demolished 市立病院 blocks at 田中 (2022–24) no longer stand: at least the 7 big blocks are site lots
  expect(L.LOTS.filter((l) => l.landmark === 'newCityHallSite' && l.area > 500).length).toBeGreaterThanOrEqual(7);
  // eight school grounds have their buildings; the library inside 気仙沼小's ground is not a school
  expect(new Set(L.LOTS.filter((l) => String(l.landmark || '').startsWith('school:')).map((l) => l.landmark)).size).toBe(8);
  const lib = L.LOTS.find((l) => l.osm === 'w768699248' || l.name === '気仙沼市図書館');
  if (lib) expect(String(lib.landmark || '')).not.toMatch(/^school:/);
  // a lot tagged by landmarks-B is never also a landmarks-A site (A wins in build-layout)
  for (const l of L.LOTS) if (l.landmark && S.siteOfLotB(l.osm, l.obb.cx, l.obb.cz, l.area) === l.landmark) expect(['pier7', 'mukaeru', 'marketNorth', 'uminoichi']).not.toContain(l.landmark);
});

test('[v6:outside-hospital] the two lots at the roundabout are the hospital canopy, built on piers 9-10 m apart, 4 m clear', () => {
  for (const id of ['16/58539/25072/144', '16/58539/25072/145']) {
    const l = L.LOTS.find((x) => x.id === id);
    expect(l.landmark).toBe('cityHospital');   // town / explore skip it: no warehouse in front of the entrance
    expect(S.siteOfLotB(null, l.obb.cx, l.obb.cz, l.area, null, id)).toBe('cityHospital');
    expect(S.siteOfLotB(null, l.obb.cx, l.obb.cz, l.area)).not.toBe('cityHospital');   // by id, not by widening GROW
  }
  const piers = R.built.hospitals.cityHospitalCanopy.piers;
  expect(piers.length).toBeGreaterThanOrEqual(8);
  for (const p of piers) {
    expect(p.y1 - L.heightAt(p.x, p.z)).toBeGreaterThan(3.7); expect(p.y1 - L.heightAt(p.x, p.z)).toBeLessThan(4.5);   // the underside is about 4 m over the kerb
    const near = Math.min(...piers.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
    expect(near).toBeGreaterThan(4); expect(near).toBeLessThan(12);
  }
});

test('[v6:outside-hospital r3] the 6-storey wing is on the roundabout face (flush, over the pilotis); the NE strip is low terraces', async () => {
  const H = await import('../src/anime/world/landmarks/hospitals.js');
  const P = S.OSM.cityHospital.poly, parts = H.hospitalParts(P);
  // the parts tile the OSM outline exactly (no gap, no double roof)
  expect(Math.abs(area(parts.wing) + area(parts.rest) + area(parts.arm) + area(parts.deck) - area(P))).toBeLessThan(1);
  // the wing's SW edge IS the OSM roundabout face 14 -> 15 (Commons 65676447: one continuous wall behind the canopy), no step in front
  expect(parts.wing).toContainEqual(P[14]); expect(parts.wing).toContainEqual(P[15]);
  const w = R.built.hospitals.cityHospitalWing, fh = S.SPEC.cityHospital.fh;
  expect((w.wTop - w.y0) / fh).toBeCloseTo(6, 5);                        // pilotis 1F + 5 floors = 24.6 m
  expect((w.pTop - w.y0) / fh).toBeCloseTo(3, 5);                        // outer deck and NW block
  expect((w.t1Top - w.y0) / fh).toBeCloseTo(4, 5);                       // the terrace beside the wing: clearly lower than the wing
  expect(w.wTop - w.t1Top).toBeGreaterThan(2 * fh - 0.01);
  // the face is about 110 m; the penthouse is mid-roofline, the name stands near the east end, the tower at the west end
  expect(w.len).toBeGreaterThan(105); expect(w.len).toBeLessThan(115);
  expect(w.pent.s / w.len).toBeGreaterThan(0.4); expect(w.pent.s / w.len).toBeLessThan(0.6);
  expect(w.sign.s / w.len).toBeGreaterThan(0.75); expect(w.sign.y).toBeGreaterThan(w.wTop - 1);   // on the roof-level fascia
  expect(w.tower.s0).toBe(0);
  expect(w.piers).toBeGreaterThanOrEqual(10);
  // every NE-strip point 15 m inside from the NE edge is NOT in the wing; the wing holds the points 10 m behind the face
  const mid = [(P[14][0] + P[15][0]) / 2, (P[14][1] + P[15][1]) / 2], u = [(P[15][0] - P[14][0]) / w.len, (P[15][1] - P[14][1]) / w.len];
  expect(S.inPoly(mid[0] + u[1] * 10, mid[1] - u[0] * 10, parts.wing)).toBe(true);
  expect(S.inPoly(P[1][0] + 5, P[1][1] + 8, parts.deck) || S.inPoly(P[1][0] - 4, P[1][1] + 6, parts.deck)).toBe(true);
  expect(S.inPoly(P[1][0] - 4, P[1][1] + 6, parts.wing)).toBe(false);
  // the 5 m west arm is not a tower: its width is under 8 m along its length
  expect(area(parts.arm)).toBeLessThan(400);
});

test('[r3:audit] the hospital\'s west arm follows the hill: its roof is fh above the ground along its whole length (it was a flat slab 2 m under the ground)', async () => {
  const H = await import('../src/anime/world/landmarks/hospitals.js');
  const P = S.OSM.cityHospital.poly, { arm } = H.hospitalParts(P), fh = S.SPEC.cityHospital.fh;
  const meshes = [], k = { mesh: (g, m) => meshes.push(g) };
  const top0 = H.hospitalArm(k, L, arm, fh, {}, {});
  expect(meshes.length).toBe(2);
  const roof = meshes[0].getAttribute('position'), up = [];
  for (let i = 0; i < roof.count; i++) up.push([roof.getX(i), roof.getY(i), roof.getZ(i)]);
  expect(up.length).toBeGreaterThan(24);
  // every roof vertex stands at least fh over the terrain under it, and no more than fh + 3 m (the DEM steps up 5.5 m in the first 6 m: the cut slope behind the building)
  for (const [x, y, z] of up) { const h = L.heightAt(x, z); expect(y - h).toBeGreaterThan(fh - 0.05); expect(y - h).toBeLessThan(fh + 3); }
  expect(top0).toBeGreaterThan(L.heightAt(arm[0][0], arm[0][1]) + fh - 0.05);
  // the DEM rises 5.5 m at the cut slope; the roof rises with it
  expect(Math.max(...up.map((q) => q[1])) - Math.min(...up.map((q) => q[1]))).toBeGreaterThan(4);
});

test('landmark reference points fall inside their rebuilt outlines (position error 0 m, target < 5 m)', () => {
  const refs = JSON.parse(readFileSync(join(ROOT, 'docs/anime/landmarks/landmarks.json'), 'utf8')).landmarks;
  const ref = Object.fromEntries(refs.map((l) => [l.id, l]));
  const inside = (p, poly) => S.inPoly(p[0], p[1], poly);
  expect(inside(ref['kesennuma-station'].enu, S.OSM.station.poly) || Math.hypot(ref['kesennuma-station'].enu[0] + 1379.4, ref['kesennuma-station'].enu[1] + 416.7) < 5).toBe(true);
  const edge = (p, poly) => { if (inside(p, poly)) return 0; let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz))); d = Math.min(d, Math.hypot(p[0] - ax - dx * t, p[1] - az - dz * t)); } return d; };
  expect(edge(ref['city-hall'].main, S.OSM.cityHall.poly)).toBeLessThan(5);
  expect(edge(ref.hospitals.cityHospital, S.OSM.cityHospital.poly)).toBeLessThan(5);   // the sheets' points are OSM centroids of concave outlines
  expect(edge(ref.hospitals.otomo, S.OSM.otomo.poly)).toBeLessThan(5);
  const ra = ref['rias-ark'].enu, o = obbOf(S.OSM.riasArk.poly);
  expect(Math.hypot(ra[0] - o.cx, ra[1] - o.cz)).toBeLessThan(15);   // the sheet's point is the OSM centroid of the L-shaped outline
});

test('station: arcade, platforms, square, an enterable hall with colliders and a walk floor', () => {
  const st = R.built.station;
  expect(st.hall).toBeTruthy();
  const inHall = S.inPoly(st.hall.x, st.hall.z, S.OSM.station.poly);
  expect(inHall).toBe(true);
  expect(st.gy).toBeGreaterThan(19.5); expect(st.gy).toBeLessThan(21.5);   // DEM T.P. 20.3
  expect(R.built.rails.n).toBeGreaterThan(50);                            // rail segments of the 大船渡線 and the yard
  const names = []; scene.traverse((o) => { if (o.name) names.push(o.name); });
  expect(names).toContain('lmB-station');
});

test('monorail: 409 m class line from the 亀山駐車場 to the summit, ~100 m of climb, the cars run the 20 min cycle', () => {
  const mono = R.built.oshima.monorail;
  expect(mono.length3d).toBeGreaterThan(360); expect(mono.length3d).toBeLessThan(450);   // the city: 409 m (433 m of track in the tender)
  expect(mono.rise).toBeGreaterThan(90);
  const svc = ctx.services.monorail;
  expect(svc.pos(0)).toBeLessThan(10);
  expect(svc.pos(420)).toBeGreaterThan(mono.length - 10);                 // up in 7 min
  expect(svc.pos(700)).toBeLessThan(svc.pos(610));                        // coming down
  expect(svc.pos(1200)).toBeCloseTo(svc.pos(0), 5);
  // [v4:polish1] terrace 1's 49 seats (亀山通信) as 8 sofa sets of ~6 seats, so the deck and its view edge stay open
  const t1 = R.built.oshima.terraces.find((t) => t.id === 't1');
  expect(t1.seats).toBe(49); expect(t1.sofas).toBeGreaterThanOrEqual(7); expect(t1.sofas).toBeLessThanOrEqual(9);
  expect(R.built.oshima.apron.parking).toBe(true);
  // the station hall pose stands back from the gates, inside the hall box that hides the labels
  const hb = R.built.station.hallBox, h = R.built.station.hall;
  const lx = (h.x - hb.cx) * hb.uz - (h.z - hb.cz) * hb.ux, lz = (h.x - hb.cx) * hb.ux + (h.z - hb.cz) * hb.uz;
  expect(Math.abs(lx) < hb.w / 2 && Math.abs(lz) < hb.d / 2).toBe(true);
  const top = R.built.oshima.monorail.top;
  expect(Math.hypot(top[0] - S.KAMEYAMA.summit[0], top[1] - S.KAMEYAMA.summit[1])).toBeLessThan(40);
});

test('schools: gyms by footprint, pools, a gate with its name at every ground', () => {
  const sc = R.built.schools;
  expect(sc.lots).toBeGreaterThan(60);
  expect(sc.pools).toBe(7);
  expect(Object.keys(sc.schools).length).toBe(8);
  expect(Object.values(sc.schools).filter((s) => s.gate).length).toBeGreaterThanOrEqual(6);
  expect(schoolKind({ area: 1181, obb: { w: 29, d: 41 } })).toBe('gym');   // 気仙沼小's blue barrel-roofed gym
  expect(schoolKind({ area: 1815, obb: { w: 30, d: 103 } })).toBe('block');
  // [v6:c9r3] 気仙沼中学校 has one gym (/100); the 997 m2 front building /126 is a 3-storey classroom block (the area rule alone drew a second gym)
  const jh = (id, area, w, d) => ({ id, landmark: 'school:schKesennumaJ', area, obb: { w, d } });
  expect(schoolKind(jh('16/58540/25069/126', 997, 26.3, 39.6))).toBe('block');
  expect(schoolKind(jh('16/58540/25069/100', 1390, 38.6, 43.6))).toBe('gym');
  expect(schoolKind({ id: '16/58540/25069/126', area: 997, obb: { w: 26.3, d: 39.6 } })).toBe('gym');   // the override is per school: other lots keep the area rule
  const lj = L.LOTS.find((l) => l.id === '16/58540/25069/126');
  if (lj) { expect(schoolKind(lj)).toBe('block'); expect(schoolStoreys(lj)).toBe(3); }
});

test('far land use: only polygons wholly outside town\'s disc, near a far landmark, and the construction site among them', () => {
  const idx = farLanduse(L);
  expect(idx.length).toBeGreaterThan(10);
  for (const i of idx) for (const [x, z] of L.LANDUSE[i].ring) expect(Math.hypot(x - TOWN_LU.cx, z - TOWN_LU.cz)).toBeGreaterThanOrEqual(TOWN_LU.r);
  expect(idx.some((i) => L.LANDUSE[i].cls === 'construction' && /新庁舎/.test(L.LANDUSE[i].name || ''))).toBe(true);
  expect(idx.some((i) => L.LANDUSE[i].cls === 'school')).toBe(true);
});

test('places for search and the tour: ≥ 15 real places with JA and EN names on land', () => {
  const P = ctx.services.landmarks.places;
  expect(P.length).toBeGreaterThanOrEqual(15);
  expect(ctx.services.landmarks.interiors.map((i) => i.id)).toContain('station');
  for (const p of P) { expect(p.drone.pos.length).toBe(3); expect(p.ja.length).toBeGreaterThan(1); expect(p.en.length).toBeGreaterThan(3); expect(L.isWater(p.at[0], p.at[1])).toBe(false); }
});

test('budgets: triangles and materials of the module', () => {
  let tris = 0; const mats = new Set();
  scene.traverse((o) => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); const m = Array.isArray(o.material) ? o.material : [o.material]; for (const x of m) mats.add(x); } });
  expect(tris).toBeLessThan(400000);
  // [sys:32] +~50: the school roofs keep their aerial colours (one material per colour, quantised to 8 levels a channel; 74 school lots, 50 colours)
  expect(mats.size).toBeLessThan(380);
});

test('content hygiene: no Math.random, no disaster references, every file names its sources', () => {
  const bad = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難所|防潮堤/i;
  for (const f of readdirSync(DIR)) {
    const src = readFileSync(join(DIR, f), 'utf8');
    expect(src.includes('Math.random'), f).toBe(false);
    expect(bad.test(src), f).toBe(false);
    expect(src.startsWith('// [v4:landmarks-B]'), f).toBe(true);
  }
});

// [v4:integrate] GSI traces the station and its island-platform roof as one 83 x 28 m footprint (named NewDays after the
// kiosk): it is the station's, so neither town nor explore puts a giant shed over the modelled station
test('the station-and-platform footprint is tagged as the station, not built as a shed', () => {
  const lot = L.LOTS.find((l) => l.id === '16/58538/25067/12');
  expect(lot.landmark).toBe('station');
  expect(S.overlapShare(lot.poly, [S.OSM.station.poly, S.OSM.islandPlatform.poly, S.OSM.platformCanopy.poly])).toBeGreaterThan(0.3);
  expect(S.overlapShare([[0, 0], [10, 0], [10, 10], [0, 10]], [[[0, 0], [5, 0], [5, 10], [0, 10]]])).toBeCloseTo(0.5, 1);
});

// [v4:polish3] the mid-zone temples (lot.kind 'temple': 観音寺, 法玄寺, 青龍禅寺 and the halls round them) are 入母屋 halls
// from the shared builder, and town / explore leave their lots alone
test('every hero / mid temple lot gets an 入母屋 hall; town and explore skip them', async () => {
  const T = await import('../src/anime/world/landmarks/temples.js');
  const lots = T.templeLots(L);
  expect(lots.length).toBe(7);   // [v6:c5r2] 8 before: the 24 x 6 m house /25068/324 was kind temple (the GSI 観音寺 label snapped to it); 観音寺 is the compound /25069/65
  for (const n of ['観音寺', '法玄寺', '青龍寺']) expect(lots.some((l) => l.name === n)).toBe(true);
  const built = R.built.temples.lots;
  expect(built.length).toBe(lots.length);
  for (const b of built) { const l = L.lotById(b.id); expect(b.top).toBeGreaterThan(l.groundY + 3); }
  const hero = readFileSync(join(ROOT, 'src/anime/world/town/hero.js'), 'utf8'), mid = readFileSync(join(ROOT, 'src/anime/world/town/mid.js'), 'utf8'), tiles = readFileSync(join(ROOT, 'src/anime/world/explore/tiles.js'), 'utf8');
  expect(hero).toMatch(/lot\.kind === 'temple'\) return null/);
  expect(mid).toMatch(/lot\.kind === 'temple'\) continue/);
  expect(tiles).toMatch(/lot\.kind === 'temple'/);
});
