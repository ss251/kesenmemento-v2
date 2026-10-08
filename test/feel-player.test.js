// [feel] The walk's feel in core/player.js against the movement-feel brief's targets, through the real Player driven the way main.js drives it
// (the fixed 1/60 s step under 60 or 30 fps frames). The browser probe (tools/anime/feel-probe.mjs) measures the same numbers in the town.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { Player, FEEL, landSpot, spotGround, pivotScale } from '../src/anime/core/player.js';
import { createClock } from '../src/anime/core/timestep.js';

globalThis.addEventListener ??= () => {};
const DT = 1 / 60;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A world: ground(x, z) for the walkable height, water(x, z) for the sea (terrain −3 m there). No solids. */
function world({ ground = () => 0, water = () => false } = {}) {
  return {
    heightAt: (x, z) => (water(x, z) ? -3 : ground(x, z)),
    groundHeight: (x, z, feetY = 1e9) => { if (water(x, z)) return -3; const g = ground(x, z); return g <= feetY + 0.45 ? g : -1e9; },
    isWater: (x, z) => water(x, z),
    standable: (x, z) => !water(x, z),
    solidAt: () => false,
    resolve() {},
  };
}
function mk(phys = world(), { third = true } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, phys, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
  p.enabled = true;
  if (third) { p.person = 'third'; p.chase = () => {}; }
  p.setPose(0, 0, 0, 0);   // facing -z
  return p;
}
const speed = (p) => Math.hypot(p.vel.x, p.vel.z);
/** Steps until pred(p) holds; the seconds it took, or null within `max`. */
function until(p, pred, max = 2) { for (let t = 0; t <= max + 1e-9; t += DT) { if (pred(p)) return t; p.step(DT); } return null; }

describe('feel: start and stop (third and first person)', () => {
  for (const third of [true, false]) {
    test(`${third ? 'third' : 'first'} person: moves on the first step, 90 % of walk in 0.09-0.13 s on an eased curve`, () => {
      const p = mk(world(), { third });
      p.keys.add('KeyW'); p.step(DT);
      expect(p.pos.z).toBeLessThan(-1e-3);            // the first step already moves
      expect(speed(p)).toBeLessThan(0.3 * p.walk);    // ...on an eased curve, not a jump to speed
      const t90 = until(p, (q) => speed(q) >= 0.9 * q.walk) + DT;
      expect(t90).toBeGreaterThanOrEqual(0.09); expect(t90).toBeLessThanOrEqual(0.13);
    });
    test(`${third ? 'third' : 'first'} person: a stop from a walk is under 5 % in ~0.1 s, slides under 0.15 m and never comes back`, () => {
      const p = mk(world(), { third });
      p.keys.add('KeyW'); until(p, () => false, 1);
      const z0 = p.pos.z; p.keys.delete('KeyW');
      const t = until(p, (q) => speed(q) < 0.05 * q.walk) ;
      expect(t).toBeLessThanOrEqual(0.12);
      let last = p.pos.z; for (let i = 0; i < 60; i++) { p.step(DT); expect(p.pos.z).toBeLessThanOrEqual(last + 1e-9); last = p.pos.z; }
      expect(Math.abs(p.pos.z - z0)).toBeLessThan(0.15);
    });
  }
  test('a run stops as quickly (under 5 % in ~0.1 s)', () => {
    const p = mk(); p.keys.add('KeyW'); p.keys.add('ShiftLeft'); until(p, () => false, 1);
    expect(speed(p)).toBeCloseTo(p.run, 2);
    p.keys.clear();
    expect(until(p, (q) => speed(q) < 0.05 * q.run)).toBeLessThanOrEqual(0.12);
  });
  test('the same curves at 30 fps frames as at 60 (the fixed step): the distance after 0.5 s and 1.0 s matches to the micrometre', () => {
    const run = (fps) => {
      const p = mk(); const clock = createClock(); p.keys.add('KeyW'); const out = [];
      for (let i = 0; i < fps; i++) { const { steps } = clock.advance(1 / fps); for (let k = 0; k < steps; k++) p.step(clock.step); if (i === fps / 2 - 1 || i === fps - 1) out.push(p.pos.z); }
      return out;
    };
    const a = run(60), b = run(30);
    expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6);
  });
});

describe('feel: turns (third person)', () => {
  test('the stick straight back: he turns to face it in 0.12-0.2 s, never snaps (< 40° a step), never walks backwards', () => {
    const p = mk(); p.keys.add('KeyW'); until(p, () => false, 1);
    p.keys.delete('KeyW'); p.keys.add('KeyS');
    const want = Math.PI;
    let t = 0, done = null, maxStep = 0, back = 0;
    for (; t < 1; t += DT) {
      const f0 = p.face; p.step(DT);
      maxStep = Math.max(maxStep, Math.abs(wrap(p.face - f0)));
      const s = speed(p);
      if (s > 0.5 && Math.abs(wrap(Math.atan2(-p.vel.x, -p.vel.z) - p.face)) > 2.3) back++;
      if (done === null && Math.abs(wrap(p.face - want)) < 10 * Math.PI / 180) done = t + DT;
    }
    expect(done).toBeGreaterThanOrEqual(0.12); expect(done).toBeLessThanOrEqual(0.2);
    expect(maxStep).toBeLessThan(40 * Math.PI / 180);
    expect(back).toBe(0);
    expect(speed(p)).toBeCloseTo(p.walk, 1);
    expect(p.vel.z).toBeGreaterThan(0);   // walking toward the camera now, facing it
  });
  test('a 45° nudge curves: facing and travel follow within ~0.15 s, the speed never drops below 80 %', () => {
    const p = mk(); p.keys.add('KeyW'); until(p, () => false, 1);
    p.keys.add('KeyD');
    const want = -Math.PI / 4;
    let done = null, minS = Infinity;
    for (let t = 0; t < 0.6; t += DT) { p.step(DT); minS = Math.min(minS, speed(p)); if (done === null && Math.abs(wrap(p.face - want)) < 5 * Math.PI / 180) done = t + DT; }
    expect(done).toBeLessThanOrEqual(0.15);
    expect(minS).toBeGreaterThan(0.8 * p.walk);
  });
  test('the pivot: full speed facing the stick, none from 120° away', () => {
    expect(pivotScale(0)).toBe(1); expect(pivotScale(0.5)).toBe(1);
    expect(pivotScale(Math.PI)).toBe(0); expect(pivotScale(2.2)).toBe(0);
    expect(pivotScale(1.2)).toBeGreaterThan(0); expect(pivotScale(1.2)).toBeLessThan(1);
  });
  test('first person keeps the view heading: S walks backwards, no turn', () => {
    const p = mk(world(), { third: false }); p.keys.add('KeyS'); until(p, () => false, 0.5);
    expect(p.face).toBeCloseTo(p.yaw, 9); expect(p.vel.z).toBeGreaterThan(2.5);
  });
});

describe('feel: his own third-person speeds (deploy #8)', () => {
  test('walk3 / run3 apply in third person only; first person keeps walk / run; running is reported', () => {
    const p = mk(); p.walk3 = 1.5; p.run3 = 3.0;
    p.keys.add('KeyW'); until(p, () => false, 1);
    expect(speed(p)).toBeCloseTo(1.5, 2); expect(p.running).toBe(false);
    p.keys.add('ShiftLeft'); until(p, () => false, 1);
    expect(speed(p)).toBeCloseTo(3.0, 2); expect(p.running).toBe(true);
    const q = mk(world(), { third: false }); q.walk3 = 1.5; q.keys.add('KeyW'); until(q, () => false, 1);
    expect(speed(q)).toBeCloseTo(q.walk, 2);
    const r = mk(); r.walk3 = null; r.keys.add('KeyW'); until(r, () => false, 1);
    expect(speed(r)).toBeCloseTo(r.walk, 2);
  });
  test('from standing to his run (3.0 m/s) in at most 0.15 s, and to his walk as fast', () => {
    for (const [keys, want] of [[['KeyW', 'ShiftLeft'], 3.0], [['KeyW'], 1.5]]) {
      const p = mk(); p.walk3 = 1.5; p.run3 = 3.0; for (const k of keys) p.keys.add(k);
      const t90 = until(p, (q) => speed(q) >= 0.9 * want) + DT;
      expect(t90).toBeLessThanOrEqual(0.15);
    }
  });
});

describe('feel: kerbs, stairs and slopes', () => {
  test('a 0.2 m kerb up: the physics feet take it, the drawn feet ease over ~0.15 s (no step over 5.5 cm)', () => {
    const p = mk(world({ ground: (x, z) => (z < -2 ? 0.2 : 0) })); p.keys.add('KeyW');
    let prev = p.pos.y + p.lift, maxD = 0, t = 0, at = null;
    for (; t < 1.5; t += DT) { p.step(DT); const y = p.pos.y + p.lift; maxD = Math.max(maxD, Math.abs(y - prev)); prev = y; if (at === null && p.pos.y > 0.1) at = t; }
    expect(p.pos.y).toBeCloseTo(0.2, 6);
    expect(maxD).toBeLessThan(0.055);
    expect(Math.abs(p.lift)).toBeLessThan(1e-3);
  });
  test('a 0.3 m kerb down: never airborne, the drawn feet ease down', () => {
    const p = mk(world({ ground: (x, z) => (z < -2 ? -0.3 : 0) })); p.keys.add('KeyW');
    let air = 0, prev = 0, maxD = 0;
    for (let t = 0; t < 1.5; t += DT) { p.step(DT); if (!p.onGround) air++; const y = p.pos.y + p.lift; maxD = Math.max(maxD, Math.abs(y - prev)); prev = y; }
    expect(air).toBe(0); expect(p.pos.y).toBeCloseTo(-0.3, 6); expect(maxD).toBeLessThan(0.07);
  });
  test('a flight of 0.18 m steps down at a run: grounded every step', () => {
    const p = mk(world({ ground: (x, z) => Math.min(0, Math.ceil(z / 0.3) * 0.18) })); p.keys.add('KeyW'); p.keys.add('ShiftLeft');
    let air = 0; for (let t = 0; t < 1; t += DT) { p.step(DT); if (!p.onGround) air++; }
    expect(air).toBe(0); expect(p.pos.y).toBeLessThan(-3);
  });
  test('a 20 % slope down is walked, not floated: grounded, the drawn feet on the ground (no eased lag)', () => {
    const p = mk(world({ ground: (x, z) => Math.min(0, z * 0.2) })); p.keys.add('KeyW');
    let air = 0, lag = 0; for (let t = 0; t < 1.5; t += DT) { p.step(DT); if (!p.onGround) air++; lag = Math.max(lag, Math.abs(p.lift)); }
    expect(air).toBe(0); expect(lag).toBeLessThan(0.01);
  });
  test('a ledge higher than a step is still a fall', () => {
    const p = mk(world({ ground: (x, z) => (z < -2 ? -2 : 0) })); p.keys.add('KeyW');
    let air = 0; for (let t = 0; t < 1.5; t += DT) { p.step(DT); if (!p.onGround) air++; }
    expect(air).toBeGreaterThan(5);
  });
});

describe('feel: a walk that ends a flight lands on land', () => {
  const bay = world({ water: (x) => x > 10 });   // land for x <= 10
  test('landSpot: the nearest good ground, a little in from the edge; null with no land in reach', () => {
    const s = landSpot(bay, 40, 0, 0);
    expect(s.x).toBeLessThanOrEqual(10); expect(s.x).toBeGreaterThan(5);
    expect(spotGround(bay, s.x, s.z)).toBe(0);
    expect(landSpot(world({ water: () => true }), 0, 0, 0)).toBeNull();
    const on = landSpot(bay, 0, 0, 0); expect(on.x).toBe(0);   // already on land: right there
  });
  test('歩く from a drone 100 m over the bay: an eased descent to the quay, never the sea, no free fall', () => {
    const p = mk(bay);
    p.setPose(40, 0, 0, 0, 100 + p.eye); p.step(DT);   // flying at 100 m over the water
    expect(p.fly).toBe(true);
    p.fly = false;                                       // the pad's chip / 着地 / F
    p.step(DT);
    const L = p.landing; expect(L).not.toBeNull();
    const drop = L.y0 - L.y1;
    let maxV = 0, t = DT, landed = null;
    for (; t < 3; t += DT) {
      const y0 = p.pos.y; p.step(DT);
      maxV = Math.max(maxV, Math.abs(p.pos.y - y0) / DT);
      if (landed === null && p.onGround) landed = t + DT;
      expect(p.pos.x <= 10 || p.pos.y > 0.6 || !p.onGround).toBe(true);   // never standing on the water
    }
    expect(landed).toBeLessThanOrEqual(FEEL.landMax + DT);
    expect(p.pos.x).toBeLessThanOrEqual(10); expect(p.pos.y).toBe(0); expect(p.onGround).toBe(true);
    expect(L.dur).toBeGreaterThanOrEqual(FEEL.landMin); expect(L.dur).toBeLessThanOrEqual(FEEL.landMax);
    expect(maxV).toBeLessThan(1.9 * drop / L.dur);   // smootherstep: the peak is 1.875x the mean speed, no faster (no free fall)
  });
  test('飛ぶ again during the descent: the landing stops and he flies on from where he is', () => {
    const p = mk(bay);
    p.setPose(40, 0, 0, 0, 100 + p.eye); p.step(DT);
    p.fly = false; for (let i = 0; i < 20; i++) p.step(DT);
    expect(p.landing).not.toBeNull();
    const y = p.pos.y; p.fly = true; p.step(DT);
    expect(p.landing).toBeNull(); expect(p.fly).toBe(true);
    expect(Math.abs(p.pos.y - y)).toBeLessThan(0.5);   // no jump: flight goes on from mid-air
  });
  test('reduced motion: the landing is a cut to the quay (one step), not a descent', () => {
    const had = globalThis.window;
    globalThis.window = { matchMedia: (q) => ({ matches: String(q).includes('reduce') }) };
    try {
      const p = mk(bay);
      p.setPose(40, 0, 0, 0, 100 + p.eye); p.step(DT);
      p.fly = false; p.step(DT);
      expect(p.landing).toBeNull(); expect(p.onGround).toBe(true); expect(p.pos.x).toBeLessThanOrEqual(10); expect(p.pos.y).toBe(0);
    } finally { globalThis.window = had; }
  });
  test('a placed walk pose (a tour stop) is not a landing; a short hop over land is the ordinary drop', () => {
    const p = mk(bay);
    p.setPose(40, 0, 0, 0, 30); p.step(DT);
    p.fly = false; p.setPose(0, 0, 0, 0); p.step(DT);
    expect(p.landing).toBeNull(); expect(p.pos.x).toBe(0);
    p.setPose(0, 0, 0, 0, 2 + p.eye); p.step(DT); p.fly = false; p.step(DT);
    expect(p.landing).toBeNull();
  });
});
