// [v4:polish2] Polish round 2: C starts the car on keydown, the accuracy audit un-culls the streamed town, fish lamps
// dark in port, calmer water from the air, pinned labels and the drone label cap, the walk spots of 五十鈴神社 /
// 亀山テラス / 気仙沼駅, the drone white balance and the station roof, the river mouths, the camera specs of shot.mjs.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from '../src/anime/world/layout.js';
import * as RV from '../src/anime/world/town/rivers.js';
import { PLACES_B as LANDMARK_PLACES } from '../src/anime/world/landmarks/sites.js';
import { WALK_SET } from '../src/anime/world/explore/places.js';
import { AERIAL_LANDUSE } from '../src/anime/world/landuse_aerial.js';
import { LOOK } from '../src/anime/world/town/landuse.js';

const ROOT = join(import.meta.dir, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('explore', () => {
  test('C toggles the car on keydown (never lost in a frame hitch), not by polling once per frame', () => {
    const d = read('src/anime/world/explore/drive.js');
    expect(d).toContain("e.code === 'KeyC' && !e.repeat && !typing");
    expect(d).not.toContain("keys.has('KeyC')");
  });
  test('a pinned label hides behind walls beyond 120 m and drops 300 m from where the camera settled', () => {
    const s = read('src/anime/world/explore/labels.js');
    expect(s).toContain('(q.it !== pinned || q.d > 120) && occluded(');
    expect(s).toContain('> 300) pinned = null');
    expect(s).toContain('alt > 60 ? Math.min(8, cap) : cap');
    expect(s).toContain('cand[k].it.prio < 2');
  });
  test('stream budget rises while the camera stands still (high / medium)', () => {
    expect(read('src/anime/world/explore/stream.js')).toContain('budget: 4.0, still: 2.5');
    expect(read('src/anime/world/explore/index.js')).toContain('stream.R.budget * (still > 0.4 ? (stream.R.still || 1) : 1)');
  });
});

describe('walk spots', () => {
  const walkOf = (id) => LANDMARK_PLACES.find((p) => p.id === id)?.walk;
  // forward = (-sin yaw, -cos yaw) (player.js / drive.js)
  const facing = (w, x, z) => { const y = w.yaw * Math.PI / 180, fx = -Math.sin(y), fz = -Math.cos(y), dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz); return (fx * dx + fz * dz) / d; };
  // [v5:fix3] on the upper flight, the hall (362.4, -125) and its 向拝 (365.4, -137.3) both well inside the frame (qa3's
  // aim rule: within 25 deg of the view direction)
  test('五十鈴神社: on the stone stair, facing the hall front and its 向拝', () => {
    const w = WALK_SET.isuzu, A = [346.5, -144.6], B = [362.8, -137.3];
    expect(facing(w, 362.4, -125)).toBeGreaterThan(Math.cos(25 * Math.PI / 180));
    expect(facing(w, 365.4, -137.3)).toBeGreaterThan(Math.cos(30 * Math.PI / 180));
    const L2 = Math.hypot(B[0] - A[0], B[1] - A[1]), off = Math.abs(((w.x - A[0]) * (B[1] - A[1]) - (w.z - A[1]) * (B[0] - A[0])) / L2);
    expect(off).toBeLessThan(0.6);   // on the flight's centre line
    expect(w.pitch).toBe(13);
  });
  test('亀山テラス past the sofa table, 気仙沼駅 on the square facing the arcade', () => {
    expect(walkOf('kameyama')).toMatchObject({ x: 3723.9, z: 3621.7, yaw: 46.2, pitch: 1 });
    const st = walkOf('station');
    expect(st).toMatchObject({ x: -1392.6, z: -395.0, yaw: -38.9 });
    expect(facing(st, -1376, -419)).toBeGreaterThan(0.98);
  });
});

describe('look and accuracy', () => {
  test('fish lamps stay dark in port; lamp points at 1.2', () => {
    const b = read('src/anime/world/harbor/boats.js');
    expect(b).toContain("if (!opts.fishing) anchors.lights = anchors.lights.filter((L) => L.kind !== 'fishlamp')");
    expect(b).toContain("lit ? M.bulb : M.bulbOff");
    expect(b).toContain('intensity: nav ? 2.3 : 1.2');
    expect(read('src/anime/world/life/lights.js')).toContain("add(d, '#ffd9a0', 0.7, 1.2, 'lamps')");
  });
  test('water: ripple bands fade out above 25-70 m, gentler swell', () => {
    const w = read('src/anime/world/water.js');
    expect(w).toContain('(1.0 - smoothstep(25.0, 70.0, cameraPosition.y))');
    expect(w).toContain('swell * 0.3 * lod');
  });
  test('drone white balance and the lighter station roof', () => {
    const r = read('src/anime/core/renderer.js');
    expect(r).toContain('vec3(0.985, 1.0, 0.93), wb');
    expect(r).toContain('(1.0 - uStreet)');
    expect(read('src/anime/world/landmarks/station.js')).toContain("roof: '#5d6672', roofEdge: '#555d68'");
  });
  test('the accuracy audit shows every streamed slot while it renders, then re-culls for the main camera', () => {
    const a = read('tools/anime/accuracy.mjs');
    expect(a).toContain('window.__explore?.stream?.sb?.cull(null)');
    expect(a).toContain('window.__explore?.stream?.sb?.cull(ctx.camera)');
    expect((a.match(/uncull\(\);/g) || []).length).toBe(2);
    expect((a.match(/recull\(\);/g) || []).length).toBe(2);
  });
  test('aerial-traced gravel lots join the land use with a look of their own', () => {
    expect(LOOK.gravel).toBeTruthy();
    for (const a of AERIAL_LANDUSE) expect(L.LANDUSE).toContain(a);
  });
});

describe('rivers', () => {
  test('easeMouth: the last 30 m ease down to the sea (+0.08), never rising downstream', () => {
    // a straight channel running +x into the sea at x >= 100
    const S = []; for (let x = 0; x <= 120; x += 3) S.push({ x, z: 0, tx: 1, tz: 0, wet: x < 100, y: 1.5 });
    const Lf = { isWater: (x) => x >= 100, SEA: { level: 0 } };
    expect(RV.easeMouth(Lf, S, 30)).toBe(true);
    for (let i = 1; i < S.length; i++) expect(S[i].y).toBeLessThanOrEqual(S[i - 1].y + 1e-9);
    const last = S.filter((p) => p.wet).at(-1);
    expect(last.y).toBeCloseTo(0.08, 5);
    expect(S.find((p) => p.x === 60).y).toBe(1.5);   // 39 m upstream of the mouth: untouched
    for (const p of S) expect(p.y).toBeGreaterThanOrEqual(0.08);
    // an inland channel keeps its level
    const S2 = S.map((p) => ({ ...p, y: 1.5 }));
    expect(RV.easeMouth({ isWater: () => false, SEA: { level: 0 } }, S2, 30)).toBe(false);
    expect(S2.every((p) => p.y === 1.5)).toBe(true);
  });
  test('鹿折川 meets the bay at the sea surface', () => {
    const chs = RV.channels(L, { step: 4 }).filter((c) => c.name === '鹿折川');
    expect(chs.length).toBeGreaterThan(0);
    const eased = chs.some((c) => { const w = c.S.filter((p) => p.wet); return w.length && w.at(-1).y < 0.1; });
    expect(eased).toBe(true);
  });
});

describe('tooling', () => {
  test('camera specs resolve hyphenated tour ids and fail loudly otherwise', () => {
    const m = read('src/anime/main.js');
    expect(m).toContain('/^tour(walk)?:([\\w-]+)$/');
    expect(m).toContain("throw new Error('camera spec does not resolve: ' + s)");
    const s = read('tools/anime/shot.mjs');
    expect(s).toContain('did not resolve');
    expect(s).toContain('window.__life?.tour?.stops?.some');
  });
});
