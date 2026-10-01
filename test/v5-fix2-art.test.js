// [v5:fix2] Fix round 2, art and explore (review2 against Google Earth 2026-03-11): the Japanese car-colour mix and the
// emptier car parks, the 魚市場 roof deck and its land side, the 海の市 walk spot, the 五十鈴神社 stair kept clear of
// trees, and the water at the quay walls.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from '../src/anime/world/layout.js';
import { JP_CAR_COLS, carColor, CAR_MIX } from '../src/anime/world/town/carcolors.js';
import { PARK_FILL, EARTH_FILL, parkFill } from '../src/anime/world/town/landuse.js';
import { WALK_SET } from '../src/anime/world/explore/places.js';

const ROOT = join(import.meta.dir, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lum = (h) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);
const sat = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return (Math.max(...c) - Math.min(...c)) / 255; };

describe('B6 car parks', () => {
  test('the car colours are the Japanese mix: ~45 % white / pearl, 20 % black, 15 % silver, 10 % grey, 10 % other', () => {
    expect(JP_CAR_COLS.length).toBe(20);
    const white = JP_CAR_COLS.filter((c) => lum(c) > 220 && sat(c) < 0.06).length;
    const black = JP_CAR_COLS.filter((c) => lum(c) < 50).length;
    const silver = JP_CAR_COLS.filter((c) => lum(c) >= 180 && lum(c) <= 220 && sat(c) < 0.08).length;
    const grey = JP_CAR_COLS.filter((c) => lum(c) >= 90 && lum(c) < 140 && sat(c) < 0.08).length;
    expect([white, black, silver, grey]).toEqual([9, 4, 3, 2]);
    expect(white / 20).toBeCloseTo(CAR_MIX.white, 5);
    // no pastel rainbow (mint, baby blue) anywhere a car is painted
    for (const f of ['src/anime/world/town/landuse.js', 'src/anime/world/town/parking.js', 'src/anime/world/harbor/market4.js']) {
      expect(read(f)).not.toContain('#9fd4c2'); expect(read(f)).not.toContain('#a9c5e2');
    }
    expect(carColor(0)).toBe(JP_CAR_COLS[0]); expect(carColor(0.9999)).toBe(JP_CAR_COLS[19]);
  });
  test('the town car parks fill at a fifth (was 0.45); a surface may carry its Earth count', () => {
    expect(PARK_FILL).toBe(0.2);
    expect(parkFill({ ring: [[0, 0], [10, 0], [10, 10]], fill: 0.07 })).toBe(0.07);
    expect(parkFill({ ring: [[1000, 1000], [1010, 1000], [1010, 1010]] })).toBe(0.2);
    for (const e of EARTH_FILL) { expect(e.fill).toBeGreaterThan(0); expect(e.fill).toBeLessThan(0.45); expect(e.src).toMatch(/earth/); }
    expect(read('src/anime/world/town/landuse.js')).toContain('r() < fill');
    expect(read('src/anime/world/town/landuse.js')).not.toContain('r() < 0.45');
  });
});

describe('B8 the 魚市場', () => {
  const m = read('src/anime/world/harbor/market4.js');
  test('the shed roof deck: ~25 cars (6 % of the bays), the green walkway stripe on the land side', () => {
    expect(m).toContain('parkCars(poly, roofY, r, 0.06,');
    expect(m).toContain("walkway: t('#6f9a7f'");
    expect(m).toContain('m.walkway');
  });
  test('the land side has dock shutters, truck bays and 「気仙沼市魚市場」 lettering, clear of the ramp and the party wall', () => {
    expect(m).toContain("ctx.rng('shed-land')");
    expect(m).toMatch(/k\.box\(0\.1, 3\.9, 3\.5, m\.shutter/);
    expect(m).toContain("textTex(ctx, '気仙沼市魚市場', { w: 1024, h: 160, color: C.blue, bg: C.wall");
    expect(m).toContain('if (nearRamp(...at(c, 6))) continue;');
    expect(m).toContain("!inside(mx, mz, NORTH_MAIN) && !['marketC', 'marketD'].some((id) => inside(mx, mz, SITES[id].poly))");
  });
});

describe('B5 海の市 walk spot', () => {
  const w = WALK_SET.uminoichi;
  const inObb = (l, x, z, m = 0) => { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = x - o.cx, dz = z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m; };
  test('it stands on land, outside every footprint (the override office of c11 included)', () => {
    expect(L.isWater(w.x, w.z)).toBe(false);
    for (const l of L.LOTS) if (Math.abs(l.obb.cx - w.x) < 80 && Math.abs(l.obb.cz - w.z) < 80) expect([l.id, inObb(l, w.x, w.z, 1)]).toEqual([l.id, false]);
  });
  test('it faces 海の市 and nothing stands between (the old spot looked through a 15 m slot)', () => {
    const T = [395, 672], d = Math.hypot(T[0] - w.x, T[1] - w.z), y = w.yaw * Math.PI / 180;
    expect((-Math.sin(y) * (T[0] - w.x) - Math.cos(y) * (T[1] - w.z)) / d).toBeGreaterThan(0.9);
    const near = L.LOTS.filter((l) => !l.landmark && Math.hypot(l.obb.cx - w.x, l.obb.cz - w.z) < d + 60);
    for (let s = 2; s < d - 25; s += 1) {
      const x = w.x + (T[0] - w.x) * s / d, z = w.z + (T[1] - w.z) * s / d;
      for (const l of near) expect([l.id, s, inObb(l, x, z, 0.5)]).toEqual([l.id, s, false]);
    }
  });
});

describe('art notes', () => {
  test('no tree on the 五十鈴神社 stair (a trunk filled the walk frame)', () => {
    const T = JSON.parse(read('data/anime/trees.json'));
    const A = [346.5, -144.6], B = [362.8, -137.3], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz;
    for (const r of T.rows) {
      const t = Math.max(0, Math.min(1, ((r[0] - A[0]) * dx + (r[1] - A[1]) * dz) / l2));
      expect(Math.hypot(A[0] + dx * t - r[0], A[1] + dz * t - r[1])).toBeGreaterThan(2.7);
    }
  });
  test('water: the fresnel view angle is floored, the bay is deeper and mirrors a dark band at the quay walls', () => {
    const w = read('src/anime/world/water.js');
    expect(w).toContain('clamp(max(V.y, 0.085), 0.0, 1.0)');
    expect(w).toContain('uDeep * vec3(0.78, 0.82, 0.9), smoothstep(0.35, 0.8, hard)');
    expect(w).toContain('float wallK = smoothstep(0.35, 0.8, hard)');
  });
});
