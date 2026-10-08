// [play:underwater] Swim rules, the breach, species, ropes and the school. No WebGL.
import { describe, test, expect } from 'bun:test';
import { TUNE } from '../src/anime/play/underwater/tune.js';
import {
  createState, swimStep, speciesAt, canDive, cameraBeat, fogK, waterMix, snellRadius, refractSun, swimLight, WATER,
  planDrops, pathDistance, stepSchool, entryPose, airTap, planOrganisms, stepPasser, nearRopes, FARM,
  planBed, MEADOWS, turnFlash, quayStart,
} from '../src/anime/play/underwater/logic.js';
import { puffDue, PUFF_EVERY } from '../src/anime/play/underwater/bits.js';

const bed = () => -12;
const shore = () => 40;
const env = { bed, shore };
const dt = 1 / 60;

function hold(s, input, seconds, e = env) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) swimStep(s, input, dt, e);
  return s;
}

describe('swim', () => {
  test('a held dash settles near 9 m/s and a cruise near 4', () => {
    const dash = hold(createState(0, -3, 0), { thrust: 1, dash: true }, 1.2);
    const cruise = hold(createState(0, -3, 0), { thrust: 1, dash: false }, 1.2);
    const sd = Math.hypot(dash.vx, dash.vy, dash.vz);
    const sc = Math.hypot(cruise.vx, cruise.vy, cruise.vz);
    expect(sd).toBeGreaterThan(8.2);
    expect(sd).toBeLessThan(9.4);
    expect(sc).toBeGreaterThan(3.5);
    expect(sc).toBeLessThan(4.4);
  });

  test('letting go coasts: the water keeps the speed for a moment', () => {
    const s = hold(createState(0, -3, 0), { thrust: 1, dash: true }, 1);
    const before = Math.hypot(s.vx, s.vy, s.vz);
    hold(s, { thrust: 0, dash: false }, 0.35);
    const after = Math.hypot(s.vx, s.vy, s.vz);
    expect(before).toBeGreaterThan(8);
    expect(after).toBeGreaterThan(3);
    expect(after).toBeLessThan(before);
  });

  test('the dash empties the tank, then the fish is back to cruise', () => {
    const s = createState(0, -3, 0);
    let low = s.stamina;
    const n = Math.round((TUNE.staminaMax + 0.5) / dt);
    for (let i = 0; i < n; i++) {
      swimStep(s, { thrust: 1, dash: true }, dt, env);
      if (s.stamina < low) low = s.stamina;
    }
    expect(low).toBe(0);
    expect(s.dashing).toBe(false);
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    expect(sp).toBeLessThan(5.2);
  });

  test('looking up and dashing leaves the water in an arc', () => {
    const s = createState(0, -1.2, 0);
    s.pitch = 1.05;
    let leapt = false, back = false, apex = -1;
    for (let i = 0; i < 240; i++) {
      swimStep(s, { thrust: 1, lift: 1, dash: true }, dt, env);
      if (s.splash === 1) leapt = true;
      if (s.y > apex) apex = s.y;
      if (s.splash === 2) back = true;
      if (back) break;
    }
    expect(leapt).toBe(true);
    expect(apex).toBeGreaterThan(2.6);
    expect(back).toBe(true);
    expect(s.mode).toBe('swim');
    expect(s.y).toBeLessThan(0);
  });

  test('a gentle rise does not leap', () => {
    const s = hold(createState(0, -2, 0), { lift: 1, dash: false }, 2);
    expect(s.mode).toBe('swim');
    expect(s.y).toBeLessThanOrEqual(TUNE.surfaceHold + 1e-6);
  });

  test('the belly stays off the bed and the body stays out of the land', () => {
    const s = createState(0, -1, 0);
    const e = { bed: () => -2, shore: (x) => (x > 3 ? -2 : 20) };
    hold(s, { thrust: -1, lift: -1, dash: true }, 2, e);
    expect(s.y).toBeGreaterThanOrEqual(-2 + TUNE.clearance - 1e-6);
    expect(s.x).toBeLessThanOrEqual(3.2);
  });

  test('reduced motion keeps the leap and drops the camera beat', () => {
    const still = cameraBeat('breach', 0.4, true);
    const full = cameraBeat('breach', 0.4, false);
    expect(still.fov).toBe(0);
    expect(still.roll).toBe(0);
    expect(still.back).toBe(TUNE.camBack);
    expect(full.fov).toBeGreaterThan(4);
    expect(full.back).toBeGreaterThan(TUNE.camBack + 2);
  });

  test('the water keeps a near thing clear, takes half by 10 m, and is gone by 25 m, red first', () => {
    const near = fogK(2), mid = fogK(10), far = fogK(25);
    for (const c of near) expect(c).toBeLessThan(0.1);
    expect(mid[1]).toBeGreaterThan(0.35);
    expect(mid[1]).toBeLessThan(0.7);
    for (const c of far) expect(c).toBeGreaterThan(0.9);
    const k8 = fogK(8);
    expect(k8[0]).toBeGreaterThan(k8[1]);
    expect(k8[0]).toBeGreaterThan(k8[2]);
    expect(fogK(0)).toEqual([0, 0, 0]);
  });

  test('the colour goes 浅葱 at the surface, 藍 by 16 m and 鉄紺 by 32 m', () => {
    const sum = (w) => w[0] + w[1] + w[2] + w[3];
    for (const d of [0, 3, 7, 12, 16, 24, 32, 50]) expect(sum(waterMix(d))).toBeCloseTo(1, 6);
    expect(waterMix(0)[0]).toBe(1);
    expect(waterMix(16)[2]).toBeGreaterThan(0.85);
    expect(waterMix(32)[3]).toBe(1);
    // the inner bay (2.5 m) is only the two bright teals
    const bay = waterMix(2.5);
    expect(bay[0]).toBeGreaterThan(0.6);
    expect(bay[0] + bay[1]).toBeCloseTo(1, 6);
  });

  test("Snell's window is about 48.6° wide, and the sun comes down steeply under the water", () => {
    expect(Math.atan(snellRadius(1)) * 180 / Math.PI).toBeCloseTo(48.6, 0);
    expect(snellRadius(4)).toBeCloseTo(4 * Math.tan(Math.asin(1 / WATER.ior)), 9);
    expect(snellRadius(-1)).toBe(0);
    const low = { x: Math.cos(0.17), y: Math.sin(0.17), z: 0 };   // a sun 10° above the horizon
    const out = { x: 0, y: 0, z: 0 };
    refractSun(low, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
    expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(1 / WATER.ior + 1e-9);
    expect(out.y).toBeGreaterThan(0.6);
    const flat = refractSun({ x: 1, y: 0, z: 0 }, out);
    expect(flat.y).toBeGreaterThan(0.1);
  });

  test('night dims the water and turns the caustics and shafts off', () => {
    const day = swimLight(0.6, 0), night = swimLight(-0.3, 1, {});
    expect(day.light).toBe(1);
    expect(day.caustic).toBe(1);
    expect(night.light).toBeLessThan(0.2);
    expect(night.caustic).toBe(0);
    expect(swimLight(0.1, 0).caustic).toBeLessThan(0.5);
  });

  test('bubbles leave in puffs: faster on a dash, slower at rest, round the ring', () => {
    const count = (speed, dash, seconds) => {
      const st = { wait: 0, next: 0 };
      let n = 0;
      for (let i = 0; i < seconds * 60; i++) if (puffDue(st, 1 / 60, speed, dash) >= 0) n++;
      return { n, st };
    };
    const rest = count(0, false, 9).n, swim = count(4, false, 9).n, dash = count(9, true, 9).n;
    expect(rest).toBeCloseTo(9 / PUFF_EVERY.rest, -0.5);
    expect(swim).toBeGreaterThan(rest * 2);
    expect(dash).toBeGreaterThan(swim * 2);
    const st = { wait: 0, next: 11 };
    expect(puffDue(st, 0.01, 4, false)).toBe(11);
    expect(st.next).toBe(0);
  });

  test('the first breach hangs for 0.2 s at the apex, and the next one does not', () => {
    const s = createState(0, -1.2, 0);
    s.pitch = 1.05;
    let armed = false;
    for (let i = 0; i < 240 && !armed; i++) {
      swimStep(s, { thrust: 1, lift: 1, dash: true }, dt, env);
      if (s.slowLeft > 0) armed = true;
    }
    expect(armed).toBe(true);
    expect(s.breachN).toBe(1);
    expect(s.slowUsed).toBe(1);
    const y0 = s.y;
    for (let i = 0; i < 12; i++) swimStep(s, { thrust: 0 }, dt, env);
    const hung = y0 - s.y;
    expect(hung).toBeGreaterThan(0);
    expect(hung).toBeLessThan(0.09);
    for (let i = 0; i < 400 && s.mode === 'breach'; i++) swimStep(s, { thrust: 0 }, dt, env);
    expect(s.mode).toBe('swim');
    for (let i = 0; i < 180; i++) swimStep(s, { thrust: 0.2 }, dt, env);
    s.y = -1.2;
    s.pitch = 1.05;
    s.vy = 0; s.vx = 0; s.vz = 0;
    let second = false;
    let yA = 0;
    for (let i = 0; i < 300; i++) {
      swimStep(s, { thrust: 1, lift: 1, dash: true }, dt, env);
      if (s.mode === 'breach' && s.vy < 0 && s.y > 1 && s.breachN === 2) { second = true; yA = s.y; break; }
    }
    expect(second).toBe(true);
    expect(s.slowLeft).toBe(0);
    for (let i = 0; i < 12; i++) swimStep(s, { thrust: 0 }, dt, env);
    expect(yA - s.y).toBeGreaterThan(hung + 0.05);
  });

  test('a tap in the air arms one spin, and reduced motion keeps the body still', () => {
    const s = createState(0, 2.2, 0);
    s.mode = 'breach';
    expect(airTap(s)).toBe(true);
    expect(s.trick).toBe(1);
    expect(s.spinV).toBeGreaterThan(8);
    expect(airTap(s)).toBe(false);
    swimStep(s, {}, 0.25, env);
    expect(s.spin).toBeGreaterThan(2);
    const low = createState(0, 0.4, 0);
    low.mode = 'breach';
    expect(airTap(low)).toBe(false);
    const still = createState(0, 2.2, 0);
    still.mode = 'breach';
    expect(airTap(still, TUNE, true)).toBe(true);
    expect(still.spinV).toBe(0);
    expect(still.trick).toBe(1);
  });
});

describe('species and entry', () => {
  test('the bay is アイナメ and the water past the mouth is カツオ', () => {
    expect(speciesAt(360, -10)).toBe('ainame');
    expect(speciesAt(1620, 3644)).toBe('ainame');
    expect(speciesAt(1700, 7500)).toBe('ainame');
    expect(speciesAt(1700, 8100)).toBe('katsuo');
    expect(speciesAt(2025, 8000)).toBe('katsuo');
  });

  test('you can dive from a quay edge or a stopped boat, and not from a moving one', () => {
    expect(canDive('walk', -2, 0)).toBe(true);
    expect(canDive('walk', -20, 0)).toBe(false);
    expect(canDive('walk', 4, 0)).toBe(false);
    expect(canDive('sail', -2, 0.1)).toBe(true);
    expect(canDive('sail', 30, 2)).toBe(false);
    expect(canDive('drive', -1, 0)).toBe(false);
    expect(canDive('fly', -1, 0)).toBe(false);
  });

  test('「海の中」 starts at the quay nearest the spawn, one stroke under, facing out to sea', () => {
    // land for z < 0, the sea deepening southward
    const e = { shore: (x, z) => z, bed: (x, z) => -0.2 - z * 0.25 };
    const p = quayStart(0, 20, e);
    expect(p).not.toBeNull();
    // out far enough that the follow camera (3.5 m behind) stays in the water
    expect(p.z).toBeGreaterThan(6.5);
    expect(p.z).toBeLessThan(9);
    expect(p.y).toBeLessThanOrEqual(-0.9);
    expect(p.y).toBeGreaterThanOrEqual(-1.7);
    // nose toward +z, the open water
    expect(-Math.cos(p.yaw)).toBeCloseTo(1, 3);
    expect(quayStart(0, 20, { shore: () => 50, bed: () => -9 })).toBeNull();
  });

  test('the entry pose is in the water, above the bed', () => {
    const p = entryPose(100, 0, 0, {
      shore: (x) => x - 100,
      bed: () => -4,
    });
    expect(p.y).toBeLessThan(0);
    expect(p.y).toBeGreaterThan(-4);
    expect(Math.hypot(p.x - 100, p.z)).toBeGreaterThan(2);
  });
});

describe('farms and schools', () => {
  test('ropes stop above the bed, and kelp stands in the shallows', () => {
    const rafts = [{ x: 10, z: 10, field: 'southA' }, { x: 20, z: 20, field: 'southB' }];
    const lines = [{ id: 'w', kind: 'wakame', x: 40, z: 0, yaw: 0, length: 20, ropes: 5 }];
    const kelp = [{ x: 5, z: 5, n: 6, r: 4 }];
    const beds = (x) => (x < 8 ? -2.4 : -14);
    const drops = planDrops(rafts, lines, kelp, beds, { southA: 'hoya', southB: 'oyster' });
    expect(drops.some((d) => d.kind === 'hoya')).toBe(true);
    expect(drops.some((d) => d.kind === 'oyster')).toBe(true);
    expect(drops.some((d) => d.kind === 'wakame')).toBe(true);
    expect(drops.some((d) => d.kind === 'kelp')).toBe(true);
    for (const d of drops) {
      expect(d.y1).toBeGreaterThan(beds(d.x) + 0.05);
      expect(d.y0).toBeGreaterThan(d.y1);
    }
  });

  test('a shallow bed does not grow an 8 m rope', () => {
    const drops = planDrops([{ x: 0, z: 0, field: 'southA' }], [], [], () => -2, { southA: 'hoya' });
    expect(drops.length).toBe(0);
  });

  test('the school stays in its home and does not allocate', () => {
    const n = 16;
    const a = {
      n,
      x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      a.x[i] = Math.cos(i) * 3; a.z[i] = Math.sin(i) * 3; a.y[i] = -3;
    }
    const home = { x: 0, y: -3, z: 0, r: 8 };
    const player = { x: 0, y: -3, z: 0 };
    const before = a.x.buffer;
    for (let k = 0; k < 180; k++) stepSchool(a, dt, home, player);
    expect(a.x.buffer).toBe(before);
    for (let i = 0; i < n; i++) {
      expect(Math.hypot(a.x[i], a.y[i] + 3, a.z[i])).toBeLessThanOrEqual(home.r + 1e-6);
    }
  });

  test('マボヤ are 11–18 cm, in clumps of three to five all down the rope; oysters every 30 cm; one lantern per scallop rope', () => {
    const rafts = [{ x: 10, z: 10, field: 'southA' }, { x: 30, z: 10, field: 'southB' }];
    const lines = [{ id: 's', kind: 'scallop', x: 80, z: 0, yaw: 0, length: 20, ropes: 4 }];
    const drops = planDrops(rafts, lines, [], () => -14, { southA: 'hoya', southB: 'oyster' });
    const org = planOrganisms(drops);
    const hoyaRopes = drops.filter((d) => d.kind === 'hoya').length;
    expect(org.scallop.length).toBe(4);
    for (const s of org.scallop) expect(s.lantern).toBe(1);
    // every ホヤ rope is clumped from near its top to near its bottom
    expect(org.clumps.length).toBeGreaterThan(hoyaRopes * 12);
    for (const c of org.clumps) { expect(c.n).toBeGreaterThanOrEqual(3); expect(c.n).toBeLessThanOrEqual(5); }
    expect(org.hoya.length).toBe(org.clumps.reduce((a, c) => a + c.n, 0));
    for (const h of org.hoya) {
      expect(h.r).toBeGreaterThanOrEqual(FARM.hoyaMin - 1e-9);
      expect(h.r).toBeLessThanOrEqual(FARM.hoyaMax + 1e-9);
      const d = drops[h.rope];
      expect(Math.hypot(h.x - d.x, h.z - d.z)).toBeLessThan(0.04);
      expect(h.y).toBeLessThan(d.y0);
      expect(h.y).toBeGreaterThan(d.y1);
      // it sways with its rope: the rope's phase, and the rope's own parameter at that height
      expect(h.phase).toBe(d.phase);
      expect(h.hang).toBeCloseTo((d.y0 - h.y) / (d.y0 - d.y1), 6);
      expect(h.lean).toBeGreaterThan(0.7);
      expect(h.lean).toBeLessThan(1.6);
    }
    // ropes come out in rope order, so the near set can copy whole ropes
    for (let i = 1; i < org.hoya.length; i++) expect(org.hoya[i].rope).toBeGreaterThanOrEqual(org.hoya[i - 1].rope);
    const oysterRopes = drops.filter((d) => d.kind === 'oyster').length;
    expect(org.oyster.length).toBeGreaterThan(oysterRopes * 18);
    // the phone draws fewer clumps per rope
    expect(planOrganisms(drops, { phone: true }).clumps.length).toBeLessThan(org.clumps.length);
  });

  test('the near set takes the ropes within reach, nearest band first, and never overflows', () => {
    const ropes = new Float32Array([0, 0, 5, 0, 20, 0, 40, 0, 0, 8]);
    const near = new Int32Array(8), far = new Int32Array(8);
    nearRopes(ropes, 5, 0, 0, 9, 26, near, far);
    expect(Array.from(near.slice(0, 4))).toEqual([0, 1, 4, -1]);
    expect(Array.from(far.slice(0, 2))).toEqual([2, -1]);
    const tiny = new Int32Array(2);
    nearRopes(ropes, 5, 0, 0, 9, 26, tiny, far);
    expect(Array.from(tiny)).toEqual([0, -1]);
  });

  test('a dash scatters the school, and it gathers again once the dash stops', () => {
    const n = 16;
    const make = () => {
      const a = {
        n,
        x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
        vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      };
      for (let i = 0; i < n; i++) {
        a.x[i] = Math.cos(i) * 1.2; a.z[i] = Math.sin(i) * 1.2; a.y[i] = -3;
      }
      return a;
    };
    const home = { x: 0, y: -3, z: 0, r: 10 };
    const mean = (a) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.hypot(a.x[i], a.y[i] + 3, a.z[i]);
      return s / n;
    };
    const calm = make();
    const wild = make();
    const still = { x: 0, y: -3, z: 0, dashing: false };
    const dash = { x: 0, y: -3, z: 0, dashing: true };
    for (let k = 0; k < 90; k++) {
      stepSchool(calm, dt, home, still);
      stepSchool(wild, dt, home, dash);
    }
    const spread = mean(wild);
    expect(spread).toBeGreaterThan(mean(calm) + 1.2);
    const away = { x: 80, y: -3, z: 80, dashing: false };
    for (let k = 0; k < 280; k++) stepSchool(wild, dt, home, away);
    expect(mean(wild)).toBeLessThan(spread - 0.8);
  });

  test('the bed plan puts rocks and アマモ only in water of the right depth, on the floor, within the caps', () => {
    // a basin: dry west of x = 0, about 4.5 m deep and deepening slowly eastward
    const wet = (x) => x > 0;
    const height = (x) => -4.4 - 0.002 * x;
    const plan = planBed(wet, height, {});
    const phone = planBed(wet, height, { phone: true });
    expect(plan.rocks.length).toBeGreaterThan(10);
    expect(plan.rocks.length).toBeLessThanOrEqual(170);
    expect(phone.rocks.length).toBeLessThanOrEqual(90);
    expect(phone.grass.length).toBeLessThan(plan.grass.length);
    for (const r of plan.rocks) {
      expect(r.x).toBeGreaterThan(0);
      const floor = Math.min(-0.55, height(r.x) + 0.18);
      expect(r.y).toBeCloseTo(floor - 0.06, 6);
      expect(floor).toBeLessThanOrEqual(-1.5);
      expect(floor).toBeGreaterThanOrEqual(-12);
    }
    for (const g of plan.grass) {
      const floor = Math.min(-0.55, height(g.x) + 0.18);
      expect(floor).toBeLessThanOrEqual(-2.5);
      expect(floor).toBeGreaterThanOrEqual(-6.5);
      expect(g.len).toBeGreaterThan(0.5);
      expect(g.len).toBeLessThan(1.4);
    }
    // every meadow sits by a start or a school's home, and the plan is the same every time
    for (const [x, z] of MEADOWS) expect(Math.min(Math.hypot(x - 368, z - 12), Math.hypot(x - 186, z - 18))).toBeLessThan(200);
    expect(JSON.stringify(planBed(wet, height, {}))).toBe(JSON.stringify(plan));
  });

  test('a school fish banks into its turn and flashes, then settles', () => {
    const n = 2;
    const a = {
      n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
      vx: new Float32Array([0, 0]), vy: new Float32Array(n), vz: new Float32Array([-1, -1]),
      yaw: new Float32Array(n), roll: new Float32Array(n), flash: new Float32Array(n),
    };
    turnFlash(a, 1 / 60);
    expect(a.flash[0]).toBe(0);
    // fish 0 swings 30° in one step; fish 1 swims on
    a.vx[0] = -Math.sin(0.52); a.vz[0] = -Math.cos(0.52);
    turnFlash(a, 1 / 60);
    expect(a.flash[0]).toBeGreaterThan(0.9);
    expect(Math.abs(a.roll[0])).toBeGreaterThan(0.05);
    expect(a.flash[1]).toBe(0);
    for (let k = 0; k < 120; k++) turnFlash(a, 1 / 60);
    expect(a.flash[0]).toBeLessThan(0.01);
    expect(Math.abs(a.roll[0])).toBeLessThan(0.01);
  });

  test('a passer stays on its loop', () => {
    const p = { t: 0.2, w: 0.2, cx: 10, cy: -4, cz: 20, r: 12, x: 0, y: 0, z: 0, yaw: 0 };
    stepPasser(p, 0);
    for (let i = 0; i < 200; i++) stepPasser(p, dt);
    expect(Math.hypot(p.x - 10, p.z - 20)).toBeLessThan(12 * 1.42);
    expect(Number.isFinite(p.yaw)).toBe(true);
  });

  test('path distance is zero on a segment and the gap beside it', () => {
    const pts = [[0, 0], [10, 0]];
    expect(pathDistance(4, 0, pts)).toBeLessThan(1e-6);
    expect(pathDistance(4, 6, pts)).toBeCloseTo(6, 5);
  });
});

describe('kit', () => {
  test('the dive loads the shared kit, not the shim', async () => {
    const { loadKit } = await import('../src/anime/play/underwater/kit-link.js');
    const kit = await loadKit();
    expect(kit).toBeTruthy();
    expect(kit.shim).toBeUndefined();
    expect(typeof kit.sfx.play).toBe('function');
    expect(typeof kit.fx.burst).toBe('function');
    expect(typeof kit.fx.ripple).toBe('function');
    expect(typeof kit.ui.toast).toBe('function');
    expect(typeof kit.ui.notebook.register).toBe('function');
  });
});
