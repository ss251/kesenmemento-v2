// [v4:landmarks-A] The inner-bay landmarks at their measured places and true dimensions (harbor/real.js; reference
// sheets docs/anime/landmarks/*.md): the fish market's four parts + 海の市, かなえ大橋, 大島大橋, 神明崎 (浮見海道, 浮見堂,
// 恵比寿像, 五十鈴神社, 猪狩神社), the 魚町 flap-gate wall, 南町 (PIER7, 迎, 結, 拓, the garden, the pontoons), 安波山.
// Builds the harbour headless (no GPU) and checks positions, dimensions, the layout tags that keep town off the
// landmark footprints, and content hygiene. Rendering is checked by screenshots (shots/lmA, gitignored).
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
const { buildHarbor } = await import('../src/anime/world/harbor/world.js');
const R = await import('../src/anime/world/harbor/real.js');
const { atLen, lineLen, obbOf } = await import('../src/anime/world/harbor/lmkit.js');
const { kanaeDeckY } = await import('../src/anime/world/harbor/kanae.js');
const { wallSide } = await import('../src/anime/world/harbor/uwall.js');
const { BOAT_SPECS } = await import('../src/anime/world/harbor/boats.js');

const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
let ctx, H;
beforeAll(() => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'high', heroR: 1 }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  ctx.sky = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), uniforms: {}, setTime() {}, setHours() {} };
  ctx.pipeline = { compMat: { uniforms: {} } };
  H = buildHarbor(ctx);
});

test('かなえ大橋: pylons on the surveyed deck line, 180 m from the measured main-span centre, 115 m tall, one cable plane', () => {
  const K = R.KANAE, [pS, pN] = H.kanae.pylons;
  expect(pN.s - pS.s).toBe(360);                                   // main span 360 m (デザイン賞 2024)
  expect(K.side).toBe(160);
  // the ortho measurements project onto the deck line 2-3 m from the modelled pylons along the axis
  const along = (m) => { let best = null; for (let s = 0; s <= lineLen(K.line); s += 0.5) { const p = atLen(K.line, s), d = Math.hypot(p.x - m[0], p.z - m[1]); if (!best || d < best.d) best = { s, d }; } return best; };
  expect(Math.abs(along(K.measured.south).s - pS.s)).toBeLessThan(5);
  expect(Math.abs(along(K.measured.north).s - pN.s)).toBeLessThan(5);
  expect(Math.abs(along(K.measured.centre).s - (pS.s + pN.s) / 2)).toBeLessThan(2);
  // the deck line is the GSI road centre line RdCL 2703 over the water (within 1.5 m)
  const rd = [[1624.5, 1237.2], [1447.7, 1541.6]], ux = (rd[1][0] - rd[0][0]) / D(rd[0], rd[1]), uz = (rd[1][1] - rd[0][1]) / D(rd[0], rd[1]);
  for (const p of [pS, pN]) expect(Math.abs((p.x - rd[0][0]) * uz - (p.z - rd[0][1]) * ux)).toBeLessThan(1.5);
  // the south pylon stands on the 朝日町 quay, the north one in the water; the old place was 72 m off
  expect(pS.wet).toBe(false); expect(pN.wet).toBe(true);
  expect(D([pS.x, pS.z], [1402, 1621.3])).toBeGreaterThan(60);
  for (const t of H.kanae.towers) expect(t[1]).toBeGreaterThan(115);
  // clearance: deck surface ≥ 35 m over the channel between the pylons
  for (let s = pS.s; s <= pN.s; s += 20) expect(kanaeDeckY(s)).toBeGreaterThanOrEqual(34);
  expect(H.kanae.spans.total).toBeGreaterThan(1330);
});

test('大島大橋: on the OSM ends at 108.2 deg, arch span 297 m, rise 54 m, deck ≥ 32 m clear', () => {
  const O = R.OSHIMA, d = H.oshima.deck;
  expect(D([d[0][0], d[0][2]], O.a)).toBeLessThan(1);
  expect(D([d[d.length - 1][0], d[d.length - 1][2]], O.b)).toBeLessThan(1);
  const deg = Math.atan2(O.b[1] - O.a[1], O.b[0] - O.a[0]) * 180 / Math.PI;
  expect(Math.abs(deg - 108.2)).toBeLessThan(0.2);
  expect(H.oshima.span).toBe(297);
  expect(H.oshima.ribs.crownY - O.springY).toBeCloseTo(54, 5);
  const mid = d[Math.floor(d.length / 2)]; expect(mid[1] - 2.5).toBeGreaterThanOrEqual(32);
});

test('fish market: the four real parts and 海の市 as their own models, nothing generic on their lots', () => {
  const halls = H.market.halls;
  for (const id of ['marketNorth', 'marketShed', 'marketC', 'marketD', 'uminoichi']) {
    const o = id === 'marketNorth' ? { cx: 455, cz: 598 } : obbOf(R.SITES[id].poly);   // the L-shaped block: a point in its main bar
    // a published hall box covers the footprint's centre (the block of 北側 + the ramp tail and 海の市 come in parts)
    const hit = halls.some((h) => { const c = Math.cos(h.rotY), s = Math.sin(h.rotY), dx = o.cx - h.x, dz = o.cz - h.z; return Math.abs(dx * c - dz * s) < h.depth / 2 + 6 && Math.abs(dx * s + dz * c) < h.len / 2 + 6; });
    expect([id, hit]).toEqual([id, true]);
  }
  // the shed's roof is the car park: parked cars, a ramp from the street
  expect(H.market.cars).toBeGreaterThan(200);
  expect(H.market.ramp.len).toBeGreaterThan(80);
  expect(H.market.stats.shed.roofY - H.market.stats.shed.g0).toBeGreaterThan(9);
  // every footprint under a landmark is tagged, so town builds nothing there
  for (const l of L.LOTS) {
    if (l.zone === 'far' && !l.landmark) continue;
    const site = R.siteOfLot(l.osm, l.obb.cx, l.obb.cz);
    if (site) expect([l.id, l.landmark]).toEqual([l.id, site]);
  }
  // 海の市's ridge runs corner to corner and stands ~19 m (the A-frame corners of the photo)
  expect(H.market.uminoichi.ridge - H.market.uminoichi.g0).toBeGreaterThan(17);
  // the unloading berths are still in front of the halls (unload scene, conveyors, crews)
  expect(H.market.berths.length).toBeGreaterThanOrEqual(3);
  expect(H.market.unload?.crew?.length || 0).toBeGreaterThan(0);
});

test('神明崎: the red ring walkway round the tip, 浮見堂 at the ortho spot, the statue, the shrine on the knoll', () => {
  const S = H.shinmei;
  expect(D([S.pavilion.x, S.pavilion.z], [341.6, -23.4])).toBeLessThan(0.5);
  expect(lineLen(R.SHINMEI.ring)).toBeGreaterThan(150);      // west revetment foot -> tip -> up the east seawall
  // the walkway is over the water (the sea side of it is water all the way round)
  let wet = 0; const ring = R.SHINMEI.ring;
  for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1], l = D(a, b), rx = -(b[1] - a[1]) / l, rz = (b[0] - a[0]) / l; if (L.isWater((a[0] + b[0]) / 2 + rx * 3, (a[1] + b[1]) / 2 + rz * 3)) wet++; }
  expect(wet / (ring.length - 1)).toBeGreaterThan(0.9);
  expect(D([S.ebisu.x, S.ebisu.z], R.SHINMEI.ebisu)).toBeLessThan(2);
  expect(D([S.shrine.x, S.shrine.z], R.SHINMEI.shrine)).toBeLessThan(5);        // OSM node of 五十鈴神社
  expect(S.shrine.y).toBeGreaterThan(14);                                         // on the 16 m knoll
  expect(S.stair.yB - S.stair.yA).toBeGreaterThan(5);                             // the steep stair
  expect(D([S.torii.x, S.torii.z], R.SHINMEI.torii)).toBeLessThan(0.5);
  expect(D([S.ikari.x, S.ikari.z], R.SHINMEI.ikari)).toBeLessThan(0.5);
  // the walk view of the tour stop stands on the walkway and looks at the pavilion
  expect(H.ukimido.walk.length).toBe(2);
});

test('魚町 wall: T.P. 4.1 m crest, 1.3 m over the pavement, 21 flap gates, ~311 m, rest-deck stairs, no windows', () => {
  expect(H.uwall.crest).toBe(4.1);
  expect(H.uwall.gates).toBe(21);
  expect(Math.abs(H.uwall.len - 311)).toBeLessThan(25);
  expect(H.uwall.stairs.length).toBeGreaterThanOrEqual(10);
  expect(R.UWALL.crest - R.UWALL.pavement).toBeCloseTo(1.3, 5);
  // the hero walk spot is on the waterside apron in front of the wall
  expect(wallSide(L.HERO.walk.x, L.HERO.walk.z)).toBeGreaterThan(0);
  // no quay was built with sea-view windows (the real walls have none)
  const src = readFileSync(join(import.meta.dir, '../src/anime/world/harbor/world.js'), 'utf8');
  expect(/windows: false/.test(src)).toBe(true);
});

test('南町: PIER7 and 迎 at 3 storeys with white roofs, the garden, two pontoons and ファンタジー (no ferry)', () => {
  const M = H.minami;
  expect(M.pier7.roofY - M.pier7.g0).toBeGreaterThan(11);
  expect(M.mukaeru.roofY - M.mukaeru.g0).toBeGreaterThan(9);
  expect(M.garden.top).toBe(6.2);
  expect(M.pontoons.length).toBe(2);
  const cruise = H.boats.filter((b) => b.type === 'cruise');
  expect(cruise.length).toBe(1); expect(cruise[0].name).toBe('ファンタジー');
  expect(H.boats.some((b) => b.type === 'ferry' || b.name === 'うみねこ丸')).toBe(false);
  expect(BOAT_SPECS.cruise.L).toBe(32); expect(BOAT_SPECS.cruise.B).toBe(7);
  // moored beside the first pontoon, afloat
  const p = cruise[0].group.position; expect(L.isWater(p.x, p.z)).toBe(true);
  expect(Math.hypot(p.x - 47.7, p.z - 10.5)).toBeLessThan(15);
});

test('安波山: the summit clearing and the two terraces on the path', () => {
  expect(H.anba.terraces.map((t) => t.id)).toEqual(['hinode', 'hoshi']);
  for (const t of H.anba.terraces) expect(t.y).toBeGreaterThan(L.heightAt(t.x, t.z));
  expect(Math.hypot(H.anba.eye.x - R.ANBA.summit[0], H.anba.eye.z - R.ANBA.summit[1])).toBeLessThan(10);
});

test('deterministic, and no disaster references in the landmark code', () => {
  const DIR = join(import.meta.dir, '../src/anime/world/harbor');
  for (const f of ['real.js', 'lmkit.js', 'market4.js', 'kanae.js', 'oshima.js', 'shinmei.js', 'uwall.js', 'minami.js', 'anba.js', 'kazemachi.js', 'plaza.js']) {   // [v4:polish1] + kazemachi, plaza
    const src = readFileSync(join(DIR, f), 'utf8');
    expect([f, /Math\.random\(/.test(src)]).toEqual([f, false]);
    expect([f, /津波|震災|被災|復興|tsunami|earthquake|慰霊|避難所|防潮堤/i.test(src)]).toEqual([f, false]);
  }
  expect(readdirSync(DIR).includes('real.js')).toBe(true);
});

// [v4:integrate] the audit's reference points (docs/anime/landmarks/landmarks.json) against the built harbour: the
// かなえ大橋 pylons within 5 m of the refined references, 五十鈴神社's OSM node inside the rendered hall
test('landmark references: かなえ大橋 pylons under 5 m, 五十鈴神社 node inside its hall', () => {
  const ref = Object.fromEntries(JSON.parse(readFileSync(join(import.meta.dir, '../docs/anime/landmarks/landmarks.json'), 'utf8')).landmarks.map((l) => [l.id, l]));
  const k = ref['kanae-ohashi'], [pS, pN] = H.kanae.pylons;
  expect(D([pN.x, pN.z], k.pylonN)).toBeLessThan(5);
  expect(D([pS.x, pS.z], k.pylonS)).toBeLessThan(5);
  const fp = H.shinmei.shrine.footprint, [x, z] = ref['isuzu-jinja'].enu;
  let inside = false; for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) { const [xi, zi] = fp[i], [xj, zj] = fp[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
  expect(inside).toBe(true);
});
