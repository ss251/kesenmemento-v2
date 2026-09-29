// [v3:harbor] Harbour kit: layout-derived geometry (quay orientation, bridge crossings), hull sanity, determinism
// and content hygiene. Rendering is verified by screenshots (src/anime/world/harbor/dev/shoot.mjs), not here.
import { test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from '../src/anime/world/layout.js';
import { quayChains, fitCrossing } from '../src/anime/world/harbor/world.js';
import { BOAT_SPECS, hullShape, boatName } from '../src/anime/world/harbor/boats.js';
import { mulberry32 } from '../src/anime/core/ctx.js';
import { planMooringRows, MOORING_ROWS } from '../src/anime/world/harbor/rows.js';
import { planArrivals, arrivalSlots, routeFor, boatTypeFor, etaHours, DWELL, dwellFor } from '../src/anime/world/harbor/arrivals.js';   // [v3:fix] dwellFor

const DIR = join(import.meta.dir, '../src/anime/world/harbor');
const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]);

test('quay chains keep the water on the left of a->b', () => {
  const chains = quayChains(L);
  expect(chains.length).toBeGreaterThan(20);
  let ok = 0, n = 0;
  for (const c of chains) for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i], b = c.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 2) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    n++; if (L.isWater(mx + uz * 6, mz - ux * 6) || !L.isWater(mx - uz * 6, mz + ux * 6)) ok++;
  }
  expect(ok / n).toBeGreaterThan(0.85);
});

test('Kanae Ohashi axis crosses the bay where it is narrowest (main span 360 m fits the water)', () => {
  const f = fitCrossing(L, { x: 1492.0, z: 1465.4 }, { half: 672, crest: 34 });
  expect(f).not.toBeNull();
  expect(f.water).toBeGreaterThan(360);           // towers stand at / near the shores
  expect(f.water).toBeLessThan(560);
  const total = Math.hypot(f.b[0] - f.a[0], f.b[2] - f.a[2]);
  expect(total).toBeGreaterThan(600);
  expect(total).toBeLessThanOrEqual(1344 + 1);     // real total length 1344 m
  // both deck ends are on land
  expect(L.isWater(f.a[0], f.a[2])).toBe(false);
  expect(L.isWater(f.b[0], f.b[2])).toBe(false);
});

test('Oshima Ohashi spans the strait with its 297 m arch', () => {
  const f = fitCrossing(L, { x: 2710.8, z: 3025.1 }, { half: 178, crest: 30 });
  expect(f.water).toBeGreaterThan(200);
  expect(f.water).toBeLessThan(330);
  const total = Math.hypot(f.b[0] - f.a[0], f.b[2] - f.a[2]);
  expect(total).toBeLessThanOrEqual(357);
});

test('hulls are sane at true scale', () => {
  for (const [type, S] of Object.entries(BOAT_SPECS)) {
    const H = hullShape(S);
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const sh = H.sheer(u);
      expect(sh).toBeGreaterThan(0.8);
      expect(H.deckY(u)).toBeLessThan(sh);
      expect(H.half(u, sh)).toBeLessThanOrEqual(S.B / 2 * 1.2);
    }
    expect(H.zAt(1, H.sheer(1)) - H.zAt(0, H.sheer(0))).toBeGreaterThan(S.L * 0.95);
  }
  expect(BOAT_SPECS.katsuo.L).toBeGreaterThanOrEqual(55);
  expect(BOAT_SPECS.maguro.L).toBeGreaterThanOrEqual(45);
});

test('boat names are deterministic and natural Japanese', () => {
  const a = boatName(mulberry32('x'), 'katsuo'), b = boatName(mulberry32('x'), 'katsuo');
  expect(a).toBe(b);
  expect(a).toMatch(/^第.+丸$/);
});

test('harbour code: seeded randomness only, no disaster references', () => {
  for (const [f, src] of files) {
    expect([f, /Math\.random\(/.test(src)]).toEqual([f, false]);
    expect([f, /津波|震災|tsunami|disaster memorial/i.test(src)]).toEqual([f, false]);
  }
});

test('stern-to rows: ~40 longliners on the east quays, every hull on water, no overlaps', () => {
  const plan = planMooringRows(mulberry32, { isWater: L.isWater, heightAt: L.heightAt });
  expect(plan.length).toBeGreaterThanOrEqual(30);
  for (const row of MOORING_ROWS) expect(plan.filter((p) => p.row === row.id).length).toBeGreaterThanOrEqual(12);
  for (const p of plan) {
    const S = BOAT_SPECS[p.type], px = p.dz, pz = -p.dx;
    for (const [l, w] of [[S.L / 2, 0], [-S.L / 2, S.B / 2], [-S.L / 2, -S.B / 2], [0, S.B / 2], [0, -S.B / 2]]) expect(L.isWater(p.x + p.dx * l + px * w, p.z + p.dz * l + pz * w)).toBe(true);
    // bows point away from the quay (stern-to)
    expect(L.isWater(p.qx - p.dx * 8, p.qz - p.dz * 8)).toBe(false);
  }
  for (const row of MOORING_ROWS) {
    const r = plan.filter((p) => p.row === row.id);
    for (let i = 1; i < r.length; i++) expect(Math.hypot(r[i].qx - r[i - 1].qx, r[i].qz - r[i - 1].qz)).toBeGreaterThan((BOAT_SPECS[r[i].type].B + BOAT_SPECS[r[i - 1].type].B) / 2 + 1);
  }
  // deterministic
  expect(JSON.stringify(planMooringRows(mulberry32, { isWater: L.isWater, heightAt: L.heightAt }))).toBe(JSON.stringify(plan));
});

test('arrival routes are water-only from the bay mouth to every market berth', () => {
  const slots = arrivalSlots();
  expect(slots.length).toBeGreaterThanOrEqual(8);
  for (const b of slots) {
    const R = routeFor(b, L.isWater);
    expect(R.dry).toBe(0);
    expect(R.len).toBeGreaterThan(3600);
    const end = R.at(R.len);
    expect(Math.hypot(end[0] - b.pos[0], end[1] - b.pos[1])).toBeLessThan(1);
    // keeps off the shore until the final approach to the quay
    for (let s = 0; s < R.len - 250; s += 25) { const [x, z] = R.at(s); expect(L.shoreDist(x, z)).toBeGreaterThan(12); }
  }
});

test('arrival schedule: real list -> boat types, queued berthing, never two boats in one berth', () => {
  const list = [
    { vessel: '51喜福丸', time: '03:00', kind: 'longline' }, { vessel: '18清龍丸', time: '04:30', kind: 'pole' },
    { vessel: '21愛宕丸', time: '04:30', kind: 'pole' }, { vessel: '23海徳丸', time: '04:30', kind: 'pole' },
    { vessel: '17大師丸', time: '07:00', kind: 'seine' }, { vessel: '第八さんま丸', time: '07:00', type: 'さんま棒受網' },
  ];
  expect(etaHours(list[1])).toBe(4.5);
  expect(boatTypeFor(list[0])).toBe('maguro');
  expect(boatTypeFor(list[1])).toBe('katsuo');
  expect(boatTypeFor(list[5])).toBe('sanma');
  const P = planArrivals(list);
  expect(P.length).toBeLessThanOrEqual(list.length);   // [v3:fix] boats stay berthed all day: more boats than berths are skipped
  expect(P.length).toBeGreaterThan(0);
  for (let i = 1; i < P.length; i++) expect(P[i].h - P[i - 1].h).toBeGreaterThan(0.03);
  const slots = arrivalSlots();
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (P[i].si === P[j].si) expect(Math.abs(P[j].h - P[i].h)).toBeGreaterThanOrEqual(Math.min(dwellFor(P[i].h), dwellFor(P[j].h)) + 0.9 - 1e-9);
  // the rafted (outer) row is only used alongside a berthed boat
  for (const p of P) if (slots[p.si].row === 1) expect(P.some((q) => slots[q.si].row === 0 && slots[q.si].s === slots[p.si].s && q.h <= p.h && q.h + dwellFor(q.h) > p.h)).toBe(true);
  expect(dwellFor(4.5)).toBe(24 - 4.5); expect(dwellFor(22)).toBe(DWELL);   // [v3:fix] in by morning -> berthed all day
});
