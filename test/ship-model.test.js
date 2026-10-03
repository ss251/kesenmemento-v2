// [ship] 第一昭福丸 model, livery and flags: true-scale dimensions from the built geometry, the starboard-only 舷門,
// triangle and texture budgets per tier, flag resolution, and proof that the fallback livery holds nothing of nendo's.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createMaterials } from '../src/anime/core/materials.js';
import {
  SHIP, BUDGET, TIERS, MID_S, zOf, sheerAt, fwdS, sternS, keelAt, halfBreadth, stations, hullGeometry, buildShofukumaru, countTriangles,
} from '../src/anime/world/ship/shofukumaru1.js';
import { ATLAS, sideUV, sidePx, fallbackPlan, cleanNendo, convexHull, simplify, polyArea, paintAtlas, stubCanvas, NENDO_FILES } from '../src/anime/world/ship/livery.js';
import { resolveFlags, isDevHost } from '../src/anime/world/ship/flags.js';

const ROOT = resolve(import.meta.dir, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const NENDO = {
  traced: JSON.parse(read('data/ship/shofukumaru1/livery-nendo.json')),
  lines: JSON.parse(read('data/ship/shofukumaru1/lines-nendo.json')),
  marks: JSON.parse(read('data/ship/shofukumaru1/livery-nendo-marks.json')),
};
function fakeCtx({ real = false } = {}) {
  const shared = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uNight: { value: 0 } };
  return { shared, ...(real ? { mat: createMaterials(shared) } : {}) };
}
const built = { high: buildShofukumaru(fakeCtx({ real: true }), { tier: 'high', livery: 'fallback' }), phone: buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'fallback' }) };
/** max vertex y of the group within |z - z0| < dz and |x| < dx (a mast's top) */
function topNear(group, s, dz = 0.35, dx = 0.6) {
  group.updateMatrixWorld(true);
  let top = -Infinity; const v = new THREE.Vector3(), z0 = zOf(s);
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.z - z0) < dz && Math.abs(v.x) < dx) top = Math.max(top, v.y); }
  });
  return top;
}

describe('principal particulars (dossier section 2)', () => {
  test('SHIP carries the registry numbers', () => {
    expect(SHIP.LOA).toBe(58.6); expect(SHIP.B).toBe(9.2); expect(SHIP.D).toBe(3.91); expect(SHIP.d).toBe(3.54);
    expect(SHIP.callSign).toBe('7KFY'); expect(SHIP.registration).toBe('MG1-2112'); expect(SHIP.GT).toBe(486);
    expect(SHIP.midS).toBe(29.3); expect(zOf(29.3)).toBe(0); expect(zOf(0)).toBeCloseTo(29.3, 6);
  });
  test('air draft leaves かなえ大橋 (32 m) with about 11 m to spare', () => {
    expect(32 - SHIP.airDraft).toBeGreaterThan(10);
  });
});

describe('dimensions from the built geometry', () => {
  for (const tier of ['high', 'phone']) {
    const S = built[tier];
    test(`${tier}: hull bounding box = LOA 58.60 +-0.3, beam 9.2 +-0.2`, () => {
      const hb = new THREE.Box3().setFromObject(S.group.getObjectByName('hull'));
      expect(Math.abs(hb.max.z - hb.min.z - SHIP.LOA)).toBeLessThan(0.3);
      expect(Math.abs(hb.max.x - hb.min.x - SHIP.B)).toBeLessThan(0.2);
      expect(hb.max.z).toBeCloseTo(MID_S, 1);              // stem head at s = 0
      expect(-hb.min.y).toBeGreaterThan(SHIP.d);            // keel below the design draft
      expect(Math.abs(-hb.min.y - SHIP.keelModel)).toBeLessThan(0.3);
    });
    test(`${tier}: mast tops +-0.5 (radar lattice 20.7, aft 19.1, fore 16.1)`, () => {
      const box = new THREE.Box3().setFromObject(S.group);
      expect(Math.abs(box.max.y - SHIP.radarMast.top)).toBeLessThan(0.5);
      expect(Math.abs(topNear(S.group, SHIP.radarMast.s) - SHIP.radarMast.top)).toBeLessThan(0.5);
      expect(Math.abs(topNear(S.group, SHIP.aftMast.s) - SHIP.aftMast.top)).toBeLessThan(0.5);
      expect(Math.abs(topNear(S.group, SHIP.foremast.s) - SHIP.foremast.top)).toBeLessThan(0.5);
      expect(Math.abs(topNear(S.group, SHIP.funnel.s, 0.8, 0.6) - (SHIP.funnel.top + 0.62))).toBeLessThan(0.5);   // exhausts above the black top
    });
  }
  test('profile: stem head 6.2, sheer ~5.0 amidships, bulb nose ahead of the waterline entry', () => {
    expect(sheerAt(0)).toBeCloseTo(6.2, 5); expect(sheerAt(29.3)).toBeCloseTo(5.0, 5); expect(sheerAt(50)).toBeCloseTo(7.3, 5);
    expect(fwdS(SHIP.bulbNose.h)).toBeCloseTo(SHIP.bulbNose.s, 2);
    expect(fwdS(0.3)).toBeLessThan(fwdS(1.0));             // the bulb sticks out ahead of the stem at the waterline
    expect(halfBreadth(25, 2)).toBeCloseTo(SHIP.B / 2, 5);
    expect(sternS(5)).toBeCloseTo(SHIP.LOA, 5); expect(keelAt(30)).toBeLessThan(-4);
  });
});

describe('the 舷門 (hauling opening) is on starboard only', () => {
  for (const tier of ['high', 'phone']) test(tier, () => {
    const g = hullGeometry(tier), p = g.attributes.position;
    let stbd = 0, port = 0;
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, s = MID_S - (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      if (s > SHIP.gangway.s0 + 0.3 && s < SHIP.gangway.s1 - 0.3 && y > SHIP.gangway.h0 + 0.1 && y < SHIP.gangway.h1 - 0.1) { if (x < -3) stbd++; if (x > 3) port++; }
    }
    expect(stbd).toBe(0);
    expect(port).toBeGreaterThan(0);
    expect(SHIP.gangway.side).toBe('starboard');
  });
  test('the anchor for the hauling station is on the starboard (-X) side at the sill', () => {
    const a = built.high.anchors.gangwayStbd;
    expect(a[0]).toBeLessThan(-4); expect(a[1]).toBe(SHIP.gangway.h0);
    const s = MID_S - a[2]; expect(s).toBeGreaterThan(SHIP.gangway.s0); expect(s).toBeLessThan(SHIP.gangway.s1);
  });
});

describe('budgets', () => {
  test('triangles per tier (flags included)', () => {
    const hi = countTriangles(built.high.group), ph = countTriangles(built.phone.group);
    expect(hi).toBeLessThanOrEqual(BUDGET.high); expect(hi).toBeLessThanOrEqual(150000);
    expect(ph).toBeLessThanOrEqual(BUDGET.phone); expect(ph).toBeLessThanOrEqual(60000);
    expect(ph).toBeLessThan(hi);
  });
  test('one livery atlas, at most 2048 x 1024, on both tiers', () => {
    for (const S of Object.values(built)) {
      const maps = new Set();
      S.group.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k]) maps.add(m[k]); });
      expect(maps.size).toBe(1);
      const [t] = maps; expect(t.image.width).toBeLessThanOrEqual(2048); expect(t.image.height).toBeLessThanOrEqual(1024);
      expect(t).toBe(S.atlas.texture);
    }
  });
  test('static parts are merged by material (few draw calls)', () => {
    let n = 0; built.high.group.traverse((o) => { if (o.isMesh && o.visible) n++; });
    expect(n).toBeLessThan(90);
  });
  test('stations include every break (openings, steps) exactly', () => {
    for (const t of ['high', 'phone']) for (const b of [22.8, 31.3, 41.6, 42.6, 56.6, 58.6]) expect(stations(t)).toContain(b);
  });
});

describe('flags.js', () => {
  test('the URL parameter wins', () => {
    expect(resolveFlags({ search: '?livery=nendo', hostname: 'example.com', define: false })).toEqual({ nendoLivery: true, source: 'url' });
    expect(resolveFlags({ search: '?livery=fallback', hostname: 'localhost', define: true })).toEqual({ nendoLivery: false, source: 'url' });
  });
  test('ON for local and Tailscale hosts', () => {
    for (const h of ['localhost', '127.0.0.1', 'example.tail1234.ts.net', 'app.localhost']) expect(resolveFlags({ search: '', hostname: h, define: false }).nendoLivery).toBe(true);
    expect(isDevHost('EXAMPLE.TAIL1.TS.NET')).toBe(true);
  });
  test('ON when the build defines KLC_NENDO=1', () => {
    expect(resolveFlags({ search: '', hostname: 'kesennuma.example.jp', define: true })).toEqual({ nendoLivery: true, source: 'define' });
  });
  test('OFF everywhere else (public)', () => {
    for (const h of ['kesennuma.example.jp', 'example.github.io', 'ts.net.evil.com', 'localhost.evil.com', '']) expect(resolveFlags({ search: '', hostname: h, define: false })).toEqual({ nendoLivery: false, source: 'default' });
    expect(resolveFlags({ search: '?livery=bogus', hostname: 'example.com', define: false }).nendoLivery).toBe(false);
  });
});

describe('fallback livery holds nothing of the nendo design', () => {
  test('the plan: bow wedge only, no lines, circles or crest; every item tagged fallback', () => {
    const p = fallbackPlan();
    expect(p.mode).toBe('fallback'); expect(p.crest).toBeNull();
    for (const side of ['port', 'starboard']) {
      expect(p[side].lines).toEqual([]); expect(p[side].circles).toEqual([]);
      expect(p[side].shapes.map((s) => s.tag)).toEqual(['bow-wedge']);
      for (const s of p[side].shapes) expect(s.src).toBe('fallback');
    }
  });
  test('building with the fallback never fetches the nendo files and adds no crest geometry', async () => {
    let calls = 0;
    const S = buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'fallback', fetchJson: async () => { calls++; return {}; } });
    await S.ready;
    expect(calls).toBe(0); expect(S.livery).toBe('fallback');
    let crest = 0; S.group.traverse((o) => { if (/crest/.test(o.name)) crest++; });
    expect(crest).toBe(0);
    // the painted atlas: no ellipse (circle) and no crest strokes in the canvas ops
    const ops = S.atlas.canvas.ops || [];
    expect(ops.some((o) => o[0] === 'ellipse')).toBe(false);
    S.dispose();
  });
  test('no module bundles the nendo data (it is fetched at runtime, behind the flag)', () => {
    for (const f of ['src/anime/world/ship/livery.js', 'src/anime/world/ship/shofukumaru1.js', 'src/anime/world/ship/flags.js']) {
      const src = read(f);
      expect(src).not.toMatch(/import[^;]*\.json/);
      expect(src).not.toMatch(/import\([^)]*nendo/);
    }
    // and livery.js holds no traced coordinates: its only numbers near the hull are the generic wedge and name boxes
    expect(read('src/anime/world/ship/livery.js')).not.toMatch(/44\.3|47\.21|34\.57|52\.59/);
    expect(Object.values(NENDO_FILES)).toEqual(['livery-nendo.json', 'lines-nendo.json', 'livery-nendo-marks.json']);
  });
});

describe('nendo livery (flag on)', () => {
  const plan = cleanNendo(NENDO);
  test('traced shapes are cleaned into crisp polygons, both sides, not mirrored', () => {
    for (const side of ['port', 'starboard']) {
      expect(plan[side].shapes.length).toBeGreaterThanOrEqual(6);
      for (const s of plan[side].shapes) { expect(s.pts.length).toBeLessThanOrEqual(8); expect(s.src).toBe('nendo'); }
      expect(plan[side].circles.length).toBe(1);
      expect(plan[side].lines.length).toBeGreaterThanOrEqual(8);
    }
    const reds = (side) => plan[side].shapes.filter((s) => s.colour === 'red').map((s) => Math.min(...s.pts.map((p) => p[0])));
    expect(reds('port')).not.toEqual(reds('starboard'));
  });
  test('starboard ignore zones drop the 舷門 and hawse hits', () => {
    for (const s of plan.starboard.shapes.filter((q) => q.tag === 'traced')) {
      const cs = s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length, ch = s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length;
      expect(cs > 22.5 && cs < 31.5 && ch > 2.5 && ch < 5).toBe(false);
    }
  });
  test('the funnel crest is added only with the nendo livery; the injected data is used without fetching', async () => {
    let calls = 0;
    const S = buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'nendo', liveryData: NENDO, fetchJson: async () => { calls++; return {}; } });
    expect(S.livery).toBe('fallback');                     // painted at once, swapped when the data is in
    await S.ready;
    expect(S.livery).toBe('nendo'); expect(calls).toBe(0);
    let crest = 0; S.group.traverse((o) => { if (/crest/.test(o.name)) crest++; });
    expect(crest).toBe(2);
    expect(S.plan.crest.length).toBeGreaterThan(0);
    S.dispose();
  });
  test('without injected data it fetches exactly the three files from data/ship/shofukumaru1/', async () => {
    const urls = [];
    const S = buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'nendo', fetchJson: async (u) => { urls.push(u); return NENDO[{ 'livery-nendo.json': 'traced', 'lines-nendo.json': 'lines', 'livery-nendo-marks.json': 'marks' }[u.split('/').pop()]]; } });
    await S.ready;
    expect(urls.map((u) => u.replace(/^.*data\/ship\/shofukumaru1\//, ''))).toEqual(['livery-nendo.json', 'lines-nendo.json', 'livery-nendo-marks.json']);
    expect(S.livery).toBe('nendo');
    S.dispose();
  });
  test('a failed fetch keeps the fallback', async () => {
    const S = buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'nendo', fetchJson: async () => { throw new Error('404'); } });
    const st = await S.ready; expect(st.mode).toBe('fallback'); expect(st.error).toMatch(/404/);
    S.dispose();
  });
});

describe('livery helpers', () => {
  test('atlas mapping: port drawn bow-left, starboard bow-right, no mirroring', () => {
    expect(sidePx('port', 10, 0)[0]).toBeLessThan(sidePx('port', 40, 0)[0]);
    expect(sidePx('starboard', 10, 0)[0]).toBeGreaterThan(sidePx('starboard', 40, 0)[0]);
    expect(sidePx('starboard', 0, ATLAS.HT)[1]).toBe(ATLAS.side.starboard);
    const [u, v] = sideUV('port', 0, 0); expect(u).toBeGreaterThan(0); expect(v).toBeGreaterThan(0.5);
  });
  test('convex hull + simplify keep a notched triangle a triangle', () => {
    const notched = [[11.52, 4.66], [11.77, 3.92], [12.5, 4.29], [12.14, 3.43], [12.99, 1.96], [14.34, 3.43], [12.99, 3.56], [12.75, 3.92], [12.99, 4.17], [14.34, 4.17], [14.71, 3.8], [15.08, 4.41]];
    const h = simplify(convexHull(notched));
    expect(h.length).toBeLessThanOrEqual(4);
    expect(polyArea(h)).toBeGreaterThan(0.9 * polyArea(convexHull(notched)));
  });
  test('painting works on a stub canvas (no DOM) and paints the antifouling last', () => {
    const c = stubCanvas(ATLAS.W, ATLAS.H); const g = c.getContext('2d');
    paintAtlas(g, cleanNendo(NENDO), { profile: { sheerAt } });
    const fills = c.ops.filter((o) => o[0] === 'set:fillStyle').map((o) => o[1]);
    expect(fills).toContain('#8c2b2b');
    expect(c.ops.filter((o) => o[0] === 'ellipse').length).toBeGreaterThanOrEqual(2);
  });
});

describe('runtime API', () => {
  test('anchors for the other builders', () => {
    const A = built.high.anchors;
    for (const k of ['gangwayStbd', 'sternSetting', 'bridge', 'mastTop', 'hornPos']) { expect(A[k].length).toBe(3); for (const v of A[k]) expect(Number.isFinite(v)).toBe(true); }
    expect(A.mastTop[1]).toBe(SHIP.radarMast.top);
    expect(A.sternSetting[2]).toBeCloseTo(zOf(58.0), 5);
    expect(A.railPoints.length).toBe(A.railPointsBySide.port.length + A.railPointsBySide.starboard.length);
    expect(A.railPointsBySide.port.every((p) => p[0] > 0)).toBe(true);
    expect(A.railPointsBySide.starboard.every((p) => p[0] < 0)).toBe(true);
    expect(A.flagPoints.length).toBe(TIERS.high.flags);
    expect(A.lights.some((l) => l.kind === 'port' && l.p[0] > 0)).toBe(true);
    expect(A.lights.some((l) => l.kind === 'starboard' && l.p[0] < 0)).toBe(true);
  });
  test('flags, night, update and dispose', () => {
    const S = buildShofukumaru(fakeCtx(), { tier: 'phone', livery: 'fallback' });
    const flags = S.group.getObjectByName('tairyo-flags');
    expect(flags.visible).toBe(false); S.setFlags(true); expect(flags.visible).toBe(true);
    S.setNight(0.8); S.setPropeller(2); S.update(0.5, 1.0); S.update(0.5, 1.5);
    expect(S.group.getObjectByName('propeller').rotation.z).toBeGreaterThan(0);
    const parent = new THREE.Group(); parent.add(S.group); S.dispose(); expect(S.group.parent).toBeNull();
  });
});
