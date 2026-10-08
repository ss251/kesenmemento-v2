// [v6:c8c12r3] The east-shore boat yards (浪板 c8, 大浦 c12): Earth 2026-03-11 shows them full of boats, the app drew open water.
// harbor/yards.js is an explicit placement list (not MOORING_ROWS): every afloat hull on app water corner by corner, dry hulls and
// ships clear of the building lots, no two hulls overlapping, and the survey-owned south shore untouched.
import { describe, expect, test } from 'bun:test';
import * as L from '../src/anime/world/layout.js';
import { planYards, YARD_BOATS, YARD_DRY, YARD_SHIPS, YARD_FLOATS, bearingToRotY } from '../src/anime/world/harbor/yards.js';
import { MOORING_ROWS } from '../src/anime/world/harbor/rows.js';

const lots = L.LOTS.filter((l) => l.poly && l.poly.some(([x, z]) => x > 1040 && x < 1200 && z > -80 && z < 60)).map((l) => l.poly);
const plan = (o = {}) => planYards({ isWater: L.isWater, heightAt: L.heightAt, lots, ...o });

describe('east-shore boat yards', () => {
  test('about 20 small boats and the slipway ships are placed on the app', () => {
    const p = plan();
    const small = p.boats.filter((b) => b.type === 'small');
    expect(small.length).toBeGreaterThanOrEqual(20);
    expect(p.boats.filter((b) => b.type === 'maguro').map((b) => b.id).sort()).toEqual(['c8-v1', 'c8-v2']);
    expect(p.floats.length).toBe(YARD_FLOATS.length);
  });
  test('every afloat hull has all its sample points on water; dry hulls and ships stand on land outside the lots', () => {
    for (const b of plan().boats) {
      const bw = (b.bow * Math.PI) / 180, dx = Math.sin(bw), dz = -Math.cos(bw), px = dz, pz = -dx;
      const pts = [[b.L / 2, 0], [-b.L / 2 + 1, b.B * 0.4], [-b.L / 2 + 1, -b.B * 0.4], [0, 0]].map(([l, w]) => [b.x + dx * l + px * w, b.z + dz * l + pz * w]);
      if (b.kind === 'water') for (const [x, z] of pts) expect(L.isWater(x, z)).toBe(true);
      if (b.kind === 'dry') for (const [x, z] of pts) expect(L.isWater(x, z)).toBe(false);
      expect(Math.abs(Math.sin(b.rotY) - Math.sin(bearingToRotY(b.bow)))).toBeLessThan(1e-9);
    }
  });
  test('no two small hulls overlap', () => {
    const s = plan().boats.filter((b) => b.type === 'small');
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z)).toBeGreaterThan(2.3);
  });
  test('a hull is never moved more than 7 m from its Earth position and the 浪板 fan is where Earth has it (x 1050..1092, z -50..-12)', () => {
    for (const b of plan().boats) expect(b.moved ?? 0).toBeLessThanOrEqual(7);
    const fan = plan().boats.filter((b) => b.id.startsWith('c8-') && b.kind === 'water' && b.z < -10);
    expect(fan.length).toBeGreaterThanOrEqual(10);
    for (const b of fan) { expect(b.x).toBeGreaterThan(1050); expect(b.x).toBeLessThan(1092); expect(b.z).toBeGreaterThan(-50); }
  });
  test('the 大浦 pier end holds three workboats and a white boat; the placement list stays east of x 1000 (the survey south shore is x -80..200)', () => {
    expect(plan().boats.filter((b) => b.id.startsWith('c12-')).length).toBe(4);
    for (const b of [...YARD_BOATS, ...YARD_DRY, ...YARD_SHIPS]) expect(b.x).toBeGreaterThan(1000);
  });
  test('the rows are untouched (the yards are not mooring rows)', () => {
    expect(MOORING_ROWS.map((r) => r.id)).toEqual(['uomachi-ne', 'market-north']);
  });
  test('phone / low tiers thin the small boats and keep both ships', () => {
    const full = plan().boats.length, phone = plan({ thin: 3 }), low = plan({ thin: true });
    expect(phone.boats.length).toBeLessThan(low.boats.length);
    expect(low.boats.length).toBeLessThan(full);
    expect(phone.boats.filter((b) => b.type === 'maguro').length).toBe(2);
  });
});
