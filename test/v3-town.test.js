// [v3:town] Town package: content hygiene (no Math.random, no disaster references, fictional brands only), the shop
// catalogue, the palette, and a headless build of the whole town (DOM stubbed like tools/anime/check.mjs):
// coverage of the hero lots, services published for life, budgets, and determinism (two builds are identical).
import { test, expect, beforeAll } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ DOM stubs (canvas drawing is a no-op)
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
const town = await import('../src/anime/world/town/index.js');
const { SHOPS, COMPANIES } = await import('../src/anime/world/town/names.js');
const { wallOf, pitchedRoofOf, flatRoofOf, WALLS, PITCHED, FLAT, SHED } = await import('../src/anime/world/town/palette.js');
const { classifyHero } = await import('../src/anime/world/town/hero.js');
const { makeRoadIndex } = await import('../src/anime/world/town/common.js');

const DIR = join(import.meta.dir, '../src/anime/world/town');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.js') || f.endsWith('.mjs') ? [p] : []; });
const files = walk(DIR).map((p) => [p, readFileSync(p, 'utf8')]);

function newCtx() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  const sunDir = new THREE.Vector3(...L.SUN_DIR).normalize();
  const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'high', heroR: 1 }, sunDir });
  ctx.sky = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), uniforms: {}, setTime() {}, setHours() {} };
  ctx.pipeline = { compMat: { uniforms: {} } };
  return ctx;
}
function tris(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
  return Math.round(n);
}
function digest(root) {
  // order-independent-ish checksum of the first vertices of every mesh
  let h = 0;
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) { const a = o.geometry.attributes.position.array; for (let i = 0; i < Math.min(60, a.length); i++) h = (h + Math.round(a[i] * 1000) * (i + 7)) % 1000000007; } });
  return h;
}

let A, B, ctxA, ctxB;
beforeAll(async () => {
  ctxA = newCtx(); A = await town.build(ctxA);
  ctxB = newCtx(); B = await town.build(ctxB);
}, 120000);

// ------------------------------------------------------------------ hygiene
test('no Math.random anywhere in the town package', () => {
  for (const [p, src] of files) expect(src.includes('Math.random'), p).toBe(false);
});

test('no references to the V3-SPEC section 5 exclusion list', () => {
  const bad = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難所|防潮堤/i;
  for (const [p, src] of files) expect(bad.test(src), p).toBe(false);
});

test('fictional brands only (no real companies, chains or mascots)', () => {
  const real = /コカ・?コーラ|Coca|ペプシ|ローソン|セブン-?イレブン|ファミリーマート|ファミマ|サントリー|キリン|アサヒ|サッポロ|伊藤園|ヤマト運輸|佐川|東北電力|NTT|ドコモ|docomo|au |ソフトバンク|ホヤぼーや|かもめの玉子|斉吉|角星|男山|アンカーコーヒー|鶴亀食堂|ムカエル|ウマレル|Yamaki|ヤマキ|ENEOS|出光|ゆうちょ|七十七銀行|トヨタ|ホンダ|スズキ|ダイハツ|Toyota|Honda|Suzuki|Daihatsu/;
  for (const [p, src] of files) expect(real.test(src), p).toBe(false);
});

// ------------------------------------------------------------------ catalogue + palette
test('64 shops with unique names, a trade, a style and an interior', () => {
  expect(SHOPS.length).toBe(64);
  expect(new Set(SHOPS.map((s) => s.name)).size).toBe(64);
  for (const s of SHOPS) {
    expect(['wa', 'modern', 'open', 'cafe', 'shutter']).toContain(s.style);
    expect(typeof s.interior).toBe('string');
    expect(s.board.length).toBe(2);
  }
  expect(SHOPS.filter((s) => s.noren).length).toBeLessThanOrEqual(24);   // noren atlas cells
  expect(new Set(COMPANIES.map((c) => c.name)).size).toBe(COMPANIES.length);
});

test('palette is deterministic and stays in the anime palette', () => {
  const lots = L.LOTS.filter((l) => l.zone !== 'far').slice(0, 800);
  const pitched = new Set([...PITCHED, ...L.LOTS.map((l) => l.roof.color)]);
  for (const l of lots) {
    expect(wallOf(l)).toBe(wallOf(l));
    const w = wallOf(l);
    expect(w === l.wall || WALLS.includes(w) || SHED.includes(w)).toBe(true);
    const r = pitchedRoofOf(l);
    expect(['#d8dbd6', '#b9bab4'].includes(r)).toBe(false);          // no pale pitched roofs
    expect(pitched.has(r)).toBe(true);
    const f = flatRoofOf(l);
    expect(FLAT.includes(f) || f === l.roof.color || f === '#c2bfb6').toBe(true);
  }
});

test('main-street houses in the shopping districts become shops (deterministically)', () => {
  const hero = L.LOTS.filter((l) => l.zone === 'hero');
  const idx = makeRoadIndex(L.ROADS.filter((r) => r.zone !== 'far'));
  const a = classifyHero(L, hero, idx), b = classifyHero(L, hero, idx);
  let shops = 0;
  for (const l of hero) { expect(a.get(l.id).kind).toBe(b.get(l.id).kind); if (a.get(l.id).kind === 'shop') shops++; }
  expect(shops).toBeGreaterThan(55);
});

// ------------------------------------------------------------------ headless build
test('the town builds: hero coverage, shops, streets, poles, props, parking', async () => {
  const heroLots = L.LOTS.filter((l) => l.zone === 'hero' && !l.landmark && l.kind !== 'shrine');
  // [v4:integrate] + the hero lots explore builds at full detail with a walk-in interior (explore/taken.js: 男山本店)
  const { EXPLORE_LOTS } = await import('../src/anime/world/explore/taken.js');
  // [v4:polish1] + the 風待ち heritage shops harbor builds on their lots (harbor/real.js KAZEMACHI_LOTS)
  const { KAZEMACHI_LOTS } = await import('../src/anime/world/harbor/real.js');
  const built = Object.values(A.hero).reduce((s, v) => s + v, 0) + heroLots.filter((l) => EXPLORE_LOTS.has(l.id) || KAZEMACHI_LOTS.has(l.id)).length;
  // every hero lot is built: full detail, or the simplified builder for odd footprints / quiet back lots
  expect(built + A.heroSimplified).toBeGreaterThanOrEqual(heroLots.length * 0.99);
  // [v4:polish1] 0.6 -> 0.58: big curved footprints (< 0.8 of their box) now go to the simplified builder's true polygon
  expect(built).toBeGreaterThan(heroLots.length * 0.58);
  expect(A.shops).toBeGreaterThanOrEqual(55);
  // [v4:data] real OSM uses turned hero 'warehouses' into what they are (迎 ムカエル, 創 ウマレル, K-port, a fuel station): 21
  // [v4:landmarks-A] -3: the three 'warehouse' footprints along the 南町 wall are the 2F decks of 迎 and PIER7 (harbor)
  // [v4:town-accuracy] non-rectangular sheds (L-shaped, stepped) are built on their real footprint by the simplified
  // builder (wings.js) instead of the kit's bounding box: 11 kit sheds remain
  expect(A.warehouses).toBeGreaterThanOrEqual(10);
  expect(A.mid.count).toBeGreaterThan(2500);
  expect(A.far.count).toBeGreaterThan(15000);
  expect(A.street.km).toBeGreaterThan(60);
  expect(A.street.crosswalks).toBeGreaterThan(40);
  expect(A.street.walkPaths).toBeGreaterThan(300);
  expect(A.poles.poles).toBeGreaterThan(1200);
  expect(A.poles.spans).toBeGreaterThan(8000);
  expect(A.poles.lamps).toBeGreaterThan(100);
  expect(A.props.vending).toBeGreaterThanOrEqual(10);
  expect(A.props.bikes).toBeGreaterThanOrEqual(30);
  expect(A.props.trees).toBeGreaterThan(40);
  // [v4:town-accuracy] hero car parks only where OSM maps one (8 detailed lots with cars); the other mapped car parks of
  // the core are land-use surfaces with stall rows and parked kei cars (landuse.js)
  expect(A.parking.lots).toBeGreaterThanOrEqual(6);
  expect(A.landuse.byClass.parking).toBeGreaterThan(30);
  expect(A.parking.cars + A.parking.simpleCars + A.landuse.cars).toBeGreaterThan(200);   // [v4:town-accuracy] detailed + simple + land-use cars
}, 60000);

test('services published for life and harbor', () => {
  const S = ctxA.services;
  expect(S.town.poles.length).toBeGreaterThan(1000);
  expect(S.town.shops.length).toBe(A.shops);
  for (const s of S.town.shops) { expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true); expect(L.isWater(s.x, s.z)).toBe(false); }
  expect(S.poles.spans.every((s) => s.points.length >= 2)).toBe(true);
  expect(S.street.walkPaths.every((p) => p.length >= 2 && p.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])))).toBe(true);
  // walkers must stay on land
  let wet = 0, n = 0; for (const p of S.street.walkPaths) for (const q of p) { n++; if (L.shoreDist(q[0], q[1]) > 0.5) wet++; }
  expect(wet / n).toBeLessThan(0.01);
  // poles never stand in the sea or inside a footprint's core
  for (const p of S.poles.poles) expect(L.shoreDist(p.x, p.z)).toBeLessThan(0);
});

test('[r3:12] the far-zone road bridges get a deck: buildRivers counts them (r9949 over the 鹿折川)', async () => {
  const R = await import('../src/anime/world/town/rivers.js');
  const HC = L.ZONES.hero, MZ = L.ZONES.mid;
  const chs = R.channels(L, { near: (x, z) => Math.hypot(x - HC.cx, z - HC.cz) < 3200, step: 4 });
  const far = L.ROADS.filter((r) => r.zone === 'far' && r.kind === 'bridge'), roads = L.ROADS.filter((r) => r.zone !== 'far');
  const farX = R.crossings(far, chs), inMid = (x, z) => Math.hypot(x - MZ.cx, z - MZ.cz) < MZ.r + 120;
  const decks = R.crossings(roads.concat(far), chs).filter((c) => inMid(c.x, c.z) || farX.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < 1));
  const old = R.crossings(roads, chs).filter((c) => inMid(c.x, c.z));
  expect(farX.some((c) => c.road.id === 'r9949')).toBe(true);
  expect(decks.length).toBeGreaterThan(old.length);
  expect(A.rivers.bridges).toBe(decks.length);
  // the far deck is level with the approach roads, not 2.4 m over the tidal water
  const k = farX.find((c) => c.road.id === 'r9949');
  expect(R.bridgeDeckY(k, (x, z) => L.heightAt(x, z), k.span / 2 + 2.5, 10, true)).toBeGreaterThan(4.3);
}, 60000);

test('budgets: triangles and canvas pixels (BUILDER-GUIDE section 6)', () => {
  const t = tris(ctxA.staticRoot) + tris(ctxA.dynamicRoot);
  // [v4:data] +1.5 %: real shop and public kinds from OSM build a few more storefronts than the derived guesses (3.2005 M)
  // [v5] +0.3 %: the accuracy sweep's land-use surfaces (car parks, aprons, gravel and weeds read from the 2026 imagery,
  // data/anime/overrides) that the cells had held back to fit 3.25 M (3.2575 M with all of them)
  // [v5:fix1] +0.6 %: hero sidewalks now run on to the cross street's edge, and straight on past a T-junction on the
  // side without a cross street (they stopped short and left paver islands mid-road at 魚町 / 八日町): about 18 k
  // triangles of pavers, curbs and edge lines
  // [sys:12] +0.8 %: pavements and kerbs on every mid road of 9 m or more, white edge lines on the mid carriageways, stop lines at the mid junctions and PV module rows
  // [v6:c5r2] +0.15 %: the open grave fields of the 沢田 and 本町 cemeteries are draped gravel surfaces now (c5.json: 4 vacant rings, about 16 000 m2; the trees that stood on them are gone)
  // [r2:4] [r2:5] +0.04 %: the wall-less sheds are roofs on posts (a post is 8 triangles, a shed 20 to 60) and six large roofs carry their measured plant (zy-rooftop-plant.json)
  // [v6:c5r3] +0.7 %: the four 'grave' terraces carry rows of grave stones now (about 2 300 instanced stones of 10 triangles, as in the OSM cemeteries) and the new two-lane road west of 気仙沼小 has sidewalks and edge lines
  // [r3] +1.0 %: measured 3,401,877. Round 3 itself adds under 2 k (lane lines on five hero roads +0.8 k, the flush PV blocks of 萬屋呉服部 +0.4 k, the moved zebras +0.3 k; the guide-bar strip it deletes takes a little off);
  // the town was already at 3,395,424 triangles with the layout of the previous round and this code, over the 3,370,500 of v6:c5r3 (the previous rounds' hero detail was not budgeted)
  expect(t).toBeLessThanOrEqual(3405000);
  // [v4:town-accuracy] +1.5 M px: the real-name sign atlas (175 public facilities and shops from OSM / GSI, 256 x 44 px
  // cells, rows in use only); the fictional shop-board atlas was trimmed to its used rows (-0.6 M px) to pay for part of it
  expect(ctxA.tex.pixels).toBeLessThanOrEqual(25.5e6);
});

test('deterministic: two builds are identical', () => {
  expect(JSON.stringify({ ...A, ms: 0, kindMs: 0, total: 0, parking: { ...A.parking, tm: 0 } })).toBe(JSON.stringify({ ...B, ms: 0, kindMs: 0, total: 0, parking: { ...B.parking, tm: 0 } }));
  expect(tris(ctxA.staticRoot)).toBe(tris(ctxB.staticRoot));
  expect(digest(ctxA.staticRoot)).toBe(digest(ctxB.staticRoot));
  expect(ctxA.services.poles.spans.length).toBe(ctxB.services.poles.spans.length);
});
