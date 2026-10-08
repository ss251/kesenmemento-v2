// [feel] The walker's camera (play/avatar/camera.js placeWalk + thirdFor) driven by the real Player the way main.js drives it: no lag, no
// catch-up, no overshoot after a stop, a look-ahead that turns the view, no shake on kerbs, walls never seen through, the same at 30 fps,
// and a portrait phone framing him at ~20 % of the picture.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { Player } from '../src/anime/core/player.js';
import { ARRIVE, BOOM, SIGHT, chooseArrival, createWalkCam, liftBoom, occludesBoom, placeWalk, sightClear, solveWalkBoom, terrainLift, thirdFor, THIRD, THIRD_PORTRAIT, WALK, walkGround } from '../src/anime/play/avatar/camera.js';
import { createTrunkProbe, trunkOf, TREE_FOOT } from '../src/anime/play/avatar/trunks.js';
import { fovFor } from '../src/anime/core/fov.js';
import * as L from '../src/anime/world/layout.js';
import { createTour } from '../src/anime/world/life/tour.js';
import { WALK_SET, WALK_THIRD, EXTRA_PLACES, placeStops } from '../src/anime/world/explore/places.js';

globalThis.addEventListener ??= () => {};
const flatWorld = (ground = () => 0, solid = () => false, wallZ = null) => ({
  heightAt: ground, groundHeight: (x, z) => ground(x, z), isWater: () => false, standable: () => true, solidAt: (x, z, y) => solid(x, y, z),
  resolve(p, r) { if (wallZ !== null && p.z < wallZ + r) p.z = wallZ + r; },   // a wall across the way at z = wallZ (the walker collides)
});

/** Walk the script `plan(t) -> keys[]` for `secs` at `fps`; rows of { t, body {x,y,z}, cam {x,y,z}, look {x,z}, boom, v }. */
function drive({ aspect = 16 / 9, fps = 60, secs = 6, plan, ground = () => 0, solid = () => false, wallZ = null, start = [0, 0, 0] }) {
  const camera = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 1000);
  const phys = flatWorld(ground, solid, wallZ);
  const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, phys, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
  p.enabled = true; p.person = 'third';
  const st = createWalkCam();
  p.chase = (pl, f) => {
    placWalkCall(st, f, pl.yaw, solid, (x, z) => ground(x, z), !(f.dt > 0), thirdFor(aspect));
    camera.position.set(st.x, st.y, st.z); camera.lookAt(st.tx, st.ty, st.tz);
  };
  p.setPose(start[0], start[1], start[2], 0);
  const rows = []; const step = 1 / 60; let acc = 0;
  for (let i = 0; i < secs * fps; i++) {
    const t0 = i / fps;   // (the frame's own time, exact: accumulated floats put the 30 fps input a frame late)
    p.keys.clear(); for (const k of plan(t0)) p.keys.add(k);
    acc += 1 / fps; while (acc >= step - 1e-9) { p.step(step); acc -= step; }
    const alpha = Math.min(1, acc / step);
    const t = (i + 1) / fps;
    p.present(alpha, 1 / fps);
    const a = alpha, P = p.pos, Q = p.prevPos;
    rows.push({ t, body: { x: Q.x + (P.x - Q.x) * a, y: Q.y + (P.y - Q.y) * a, z: Q.z + (P.z - Q.z) * a }, cam: { x: st.x, y: st.y, z: st.z }, look: { x: st.tx, z: st.tz }, boom: st.boom, v: Math.hypot(p.vel.x, p.vel.z), camera });
  }
  return { rows, p, st, camera };
}
const placWalkCall = (st, f, yaw, solid, ground, snap, C) => placeWalk(st, f, yaw, solid, ground, snap, C);
const walkThenStop = (run = false) => (t) => (t >= 1 && t < 3.5 ? (run ? ['KeyW', 'ShiftLeft'] : ['KeyW']) : []);

describe('feel camera: follow and stop', () => {
  for (const run of [false, true]) {
    test(`${run ? 'run' : 'walk'}: trails by at most ${run ? 12 : 6} cm at speed; after a stop it is still within 0.12 s, under 2 cm, no overshoot`, () => {
      const { rows } = drive({ plan: walkThenStop(run) });
      const rest = rows.find((r) => r.t > 0.9), off0 = rest.cam.z - rest.body.z;
      const end = rows.filter((r) => r.t < 3.5).at(-1);
      expect(Math.abs(end.cam.z - end.body.z - off0)).toBeLessThan(run ? 0.12 : 0.06);
      const still = rows.findIndex((r) => r.t > 3.5 && r.v < 0.02);
      let last = still, travel = 0; const final = rows.at(-1).cam.z;
      let over = 0;
      for (let i = still + 1; i < rows.length; i++) { const d = Math.abs(rows[i].cam.z - rows[i - 1].cam.z); travel += d; if (d > 5e-4) last = i; over = Math.max(over, -(rows[i].cam.z - final)); }
      expect(rows[last].t - rows[still].t).toBeLessThanOrEqual(0.12);
      expect(travel).toBeLessThan(0.02);
      expect(over).toBeLessThan(0.01);
    });
  }
  test('the same picture at 30 fps as at 60: the camera within 1 cm at the same instants', () => {
    const a = drive({ plan: walkThenStop(), fps: 60 }).rows, b = drive({ plan: walkThenStop(), fps: 30 }).rows;
    for (const t of [1.5, 2.5, 3.6, 4.5]) {
      const ra = a.find((r) => r.t >= t - 1e-9), rb = b.find((r) => r.t >= t - 1e-9);
      expect(Math.abs(ra.t - rb.t)).toBeLessThan(1e-9);
      expect(Math.hypot(ra.cam.x - rb.cam.x, ra.cam.z - rb.cam.z)).toBeLessThan(0.01);
      expect(Math.abs(ra.body.z - rb.body.z)).toBeLessThan(0.002);
    }
  });
  test('dropped frames (16.7 / 25 / 33.3 / 50 ms mixed, like a busy phone) draw the same walk: the camera within 1 cm of 60 fps', () => {
    const plan = walkThenStop();
    const steady = drive({ plan, fps: 60, secs: 5 }).rows;
    // irregular frames: the clock (fixed 1/60 s steps) under uneven frame times, the camera on each frame's own dt
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, flatWorld(), { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
    p.enabled = true; p.person = 'third';
    const st = createWalkCam();
    p.chase = (pl, f) => { placeWalk(st, f, pl.yaw, null, () => 0, !(f.dt > 0), thirdFor(16 / 9)); };
    p.setPose(0, 0, 0, 0);
    const pattern = [1 / 60, 1 / 40, 1 / 30, 1 / 60, 1 / 20, 1 / 60, 1 / 30];
    // the camera's job is its place relative to him: compare the camera-to-body offset with 60 fps's while he walks steadily and once
    // he has stopped (the input itself lands up to a frame later with long frames, which moves the body, not the camera's behaviour)
    const offsetAt = (rows, lo, hi) => { const r = rows.filter((q) => q.t >= lo && q.t <= hi); return r.map((q) => [q.cam.x - q.body.x, q.cam.z - q.body.z]); };
    const ref = { walk: offsetAt(steady, 2.2, 3.3)[0], rest: offsetAt(steady, 4.6, 5)[0] };
    let t = 0, acc = 0, i = 0, worst = 0;
    while (t < 5) {
      const dt = pattern[i++ % pattern.length];
      p.keys.clear(); for (const k of plan(t)) p.keys.add(k);
      acc += dt; while (acc >= 1 / 60 - 1e-9) { p.step(1 / 60); acc -= 1 / 60; }
      const a = Math.min(1, acc * 60);
      p.present(a, dt); t += dt;
      const bx = p.prevPos.x + (p.pos.x - p.prevPos.x) * a, bz = p.prevPos.z + (p.pos.z - p.prevPos.z) * a;
      const o = (t >= 2.2 && t <= 3.3) ? ref.walk : t >= 4.6 ? ref.rest : null;
      if (o) worst = Math.max(worst, Math.hypot(st.x - bx - o[0], st.z - bz - o[1]));
    }
    expect(worst).toBeLessThan(0.01);
  });
  test('the look-ahead turns the view toward a sideways walk (≥ 0.3 m to his right, within ~10° of the view) and lets go after', () => {
    const { rows } = drive({ plan: (t) => (t >= 1 && t < 3 ? ['KeyD'] : []) });
    const mid = rows.find((r) => r.t >= 2.9);
    const lead = mid.look.x - mid.body.x;                    // walking +x (to the camera's right)
    expect(lead).toBeGreaterThan(0.3); expect(lead).toBeLessThanOrEqual(WALK.leadAngle * THIRD.dist + THIRD.shoulder + 1e-6);
    const late = rows.at(-1);
    expect(Math.abs(late.look.x - late.body.x - THIRD.shoulder)).toBeLessThan(0.02);   // back on his shoulder once he stands still
  });
});

describe('feel camera: kerbs and walls', () => {
  test('a 0.2 m kerb: the camera rises without a shake (under 1 cm a frame) while the drawn body eases', () => {
    const { rows } = drive({ plan: (t) => (t >= 0.5 ? ['KeyW'] : []), ground: (x, z) => (z < -3 ? 0.2 : 0), secs: 3 });
    let maxDy = 0; for (let i = 1; i < rows.length; i++) maxDy = Math.max(maxDy, Math.abs(rows[i].cam.y - rows[i - 1].cam.y));
    expect(maxDy).toBeLessThan(0.01);
    expect(rows.at(-1).cam.y).toBeGreaterThan(rows[0].cam.y + 0.15);
  });
  test('walking into a wall: the camera stays behind him, never past him, and he stays in view (boom > 0.7 m)', () => {
    const wall = (x, y, z) => z < -4;   // a wall across the way, 4 m ahead: he walks into it and pushes against it
    const { rows } = drive({ plan: (t) => (t >= 0.5 ? ['KeyW'] : []), solid: wall, wallZ: -4, secs: 4 });
    for (const r of rows) { expect(r.boom).toBeGreaterThan(0.7); expect(r.cam.z).toBeGreaterThan(r.body.z); }
  });
  test('a wall that starts beside his shoulder: the camera slides over smoothly (no sideways jump), never into it', () => {
    const wall = (x, y, z) => x > 0.45 && z < -3;   // on his right (the shoulder side) from 3 m ahead
    const { rows } = drive({ plan: (t) => (t >= 0.5 ? ['KeyW'] : []), solid: wall, secs: 4 });
    let maxDx = 0; for (let i = 1; i < rows.length; i++) maxDx = Math.max(maxDx, Math.abs(rows[i].cam.x - rows[i - 1].cam.x));
    expect(maxDx).toBeLessThan(0.02);   // an eased slide (it snapped 0.35 m in one frame)
    const late = rows.at(-1);
    expect(late.cam.x).toBeLessThan(0.3);   // pulled in toward his column
    for (const r of rows) expect(wall(r.cam.x, r.cam.y, r.cam.z)).toBe(false);
  });
  test('a wall behind the camera: the boom is never through it, and it eases back out slowly once clear', () => {
    let wallOn = true;
    const wall = (x, y, z) => wallOn && z > 2.5;   // 2.5 m behind him: the 4.5 m boom must shorten
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    const st = createWalkCam(), C = thirdFor(16 / 9);
    const f = { x: 0, y: 0, z: 0, vx: 0, vz: 0, dt: 0, landing: false };
    placeWalk(st, f, 0, wall, () => 0, true, C);
    f.dt = 1 / 60;
    for (let i = 0; i < 30; i++) { placeWalk(st, f, 0, wall, () => 0, false, C); expect(st.z).toBeLessThanOrEqual(2.5 + 1e-6); }
    wallOn = false;
    let t90 = null; for (let i = 1; i <= 120; i++) { placeWalk(st, f, 0, wall, () => 0, false, C); if (t90 === null && st.boom > 0.9 * C.dist) t90 = i / 60; }
    expect(t90).toBeGreaterThan(0.4); expect(t90).toBeLessThan(1.2);
    void camera;
  });
});

describe('feel camera: the short-boom rise follows the rig', () => {
  test('the landscape rig rises under 2.4 m as before; the portrait rig only under its own 1.39 m', () => {
    const land = thirdFor(16 / 9, {}), tall = thirdFor(390 / 844, {});
    expect(land.liftAt).toBeCloseTo(2.4, 9); expect(tall.liftAt).toBeCloseTo(2.4 * 2.6 / 4.5, 9);
    const at = (C, dist) => liftBoom({ x: 0, y: 1, z: 0, dist }, null, null, C).y - 1;
    expect(at(land, 1.4)).toBeCloseTo(0.4, 1);        // (2.4 - 1.4) x 0.45 = 0.45, in 0.1 m steps
    expect(at(tall, 1.4)).toBe(0);                   // the portrait boom at 1.4 m is barely short: no rise
    expect(at(tall, 0.4)).toBeGreaterThan(0.3);      // much shorter: it rises
    expect(at(tall, 0.4)).toBeLessThan(at(land, 0.4));
  });
});

describe('feel camera: framing by screen shape', () => {
  const share = (aspect) => {
    const { rows } = drive({ aspect, plan: () => [], secs: 0.5 });
    const cam = rows.at(-1).camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const b = rows.at(-1).body;
    const lo = new THREE.Vector3(b.x, b.y, b.z).project(cam).y, hi = new THREE.Vector3(b.x, b.y + 1.1, b.z).project(cam).y;
    return { share: (hi - lo) / 2, feet: (1 - lo) / 2 };   // feet: from the top, 0..1
  };
  test('a portrait phone (390×844) frames him at 18–22 % of the height, feet about two thirds down', () => {
    const s = share(390 / 844);
    expect(s.share).toBeGreaterThan(0.18); expect(s.share).toBeLessThan(0.22);
    expect(s.feet).toBeGreaterThan(0.6); expect(s.feet).toBeLessThan(0.72);
  });
  test('desktop and a landscape phone keep the 4.5 m boom (15–25 %)', () => {
    for (const a of [16 / 9, 852 / 393]) { const s = share(a); expect(s.share).toBeGreaterThan(0.15); expect(s.share).toBeLessThan(0.25); }
    expect(thirdFor(16 / 9).dist).toBe(THIRD.dist);
    const tall = thirdFor(390 / 844, {}); expect(tall.dist).toBe(THIRD_PORTRAIT.dist); expect(tall.pitch).toBe(THIRD_PORTRAIT.pitch);
    const square = thirdFor(0.75, {}); expect(square.dist).toBeGreaterThan(THIRD_PORTRAIT.dist); expect(square.dist).toBeLessThan(THIRD.dist);
  });
});

import { gaitCadence, CADENCE } from '../src/anime/play/avatar/index.js';
import { stepSpacing, characterCadence } from '../src/anime/play/avatar/steps.js';
describe('feel: the walk cycle locked to speed (the character slot, when a model offers gait)', () => {
  test('no gait() on the model: undefined (its own cadence), and the footsteps keep that spacing', () => {
    expect(gaitCadence({}, 3)).toBeUndefined(); expect(gaitCadence(null, 3)).toBeUndefined();
    expect(stepSpacing(3, 'meme')).toBeCloseTo(3 / (characterCadence(3) * 2), 9);
  });
  test('with gait(): the model\u2019s own rate for the pose (walk or run), passed through gait(speed, run)', () => {
    const seen = [];
    const m = { gait: (v, run) => { seen.push(run); return { travel: 0.2, stance: 0.5, rate: run ? 5.5 : 4.2 }; } };
    expect(gaitCadence(m, 3, 1)).toBe(5.5); expect(gaitCadence(m, 3, 0)).toBe(4.2);
    expect(seen).toEqual([1, 0]);
  });
  test('with gait(): speed × stance / travel, held to 1.6–5.5 Hz; the footsteps follow it', () => {
    const m = { gait: () => ({ travel: 0.2, stance: 0.5 }) };
    expect(gaitCadence(m, 1.2)).toBeCloseTo(3, 9);           // 1.2 × 0.5 / 0.2
    expect(gaitCadence(m, 0.2)).toBe(CADENCE.min); expect(gaitCadence(m, 9)).toBe(CADENCE.max);
    expect(stepSpacing(1.2, 'meme', undefined, 3)).toBeCloseTo(0.2, 9);   // two footfalls a cycle
  });
});

import { CHARACTER_SPEED, speedFrom, RUN_FOV, runFovStep } from '../src/anime/play/avatar/index.js';
describe('feel: a custom character\'s speeds and the run (deploy #8)', () => {
  test('CHARACTER_SPEED is 1.5 / 3.0 (planted feet); ?speed= overrides it for trying, 0 gives the walker\'s', () => {
    expect(CHARACTER_SPEED).toEqual({ walk: 1.5, run: 3.0 });
    expect(speedFrom('')).toEqual({ walk: 1.5, run: 3.0 });
    expect(speedFrom('?speed=1.8,3.2')).toEqual({ walk: 1.8, run: 3.2 });
    expect(speedFrom('?speed=2')).toEqual({ walk: 2, run: 4 });
    expect(speedFrom('?speed=0')).toEqual({ walk: null, run: null });
  });
  test('the run widens the view by at most 2° in ~1.3 s and gives it back in about a second, never past either end', () => {
    const o = { x: 0, v: 0 }; let t90 = null, max = 0;
    for (let i = 1; i <= 120; i++) { runFovStep(o.x, o.v, 1, 1 / 60, o); max = Math.max(max, o.x); if (t90 === null && o.x >= 0.9) t90 = i / 60; }
    expect(t90).toBeGreaterThan(1.05); expect(t90).toBeLessThan(1.55);   // ~1.3 s to 90 %: a slow swell, not a distort
    expect(max).toBeLessThanOrEqual(1);
    expect(RUN_FOV.deg * max).toBeLessThanOrEqual(2);
    let t10 = null; for (let i = 1; i <= 120; i++) { runFovStep(o.x, o.v, 0, 1 / 60, o); expect(o.x).toBeGreaterThanOrEqual(0); if (t10 === null && o.x <= 0.1) t10 = i / 60; }
    expect(t10).toBeGreaterThan(0.7); expect(t10).toBeLessThan(1.25);
    expect(RUN_FOV.deg).toBe(2);
    expect(runFovStep(0.7, 0.2, 0, 0, o).x).toBe(0);   // a still: at once
    const held = { x: 0, v: 0 };
    for (let i = 0; i < 30; i++) runFovStep(held.x, held.v, 0, 1 / 60, held);
    expect(held.x).toBe(0);   // walking (want 0) does not change the lens
  });
});

import { footstepGain } from '../src/anime/play/avatar/index.js';
describe('feel: the footsteps at his new patter', () => {
  test('0.5 up to 5 footfalls a second, softer in proportion above, never under 0.25', () => {
    expect(footstepGain(undefined)).toBe(0.5); expect(footstepGain(2.5)).toBe(0.5);
    expect(footstepGain(4.1)).toBeCloseTo(0.5 * 5 / 8.2, 6);   // his walk: 8.2 a second
    expect(footstepGain(5.5)).toBeCloseTo(0.25, 6);            // his run: 11 a second
    expect(footstepGain(9)).toBe(0.25);
  });
});

import { withoutMoving } from '../src/anime/play/avatar/index.js';
import { Physics } from '../src/anime/core/physics.js';
describe('feel camera: a passer-by does not collapse the boom', () => {
  test('the walker camera solves its boom without the townspeople\u2019s moving boxes, and gives them back', () => {
    const P = new Physics(() => 0);
    // a townsperson 1.2 m behind him, where a portrait phone's low boom runs (from his chest at 0.9 m to 1.53 m)
    const person = { cx: 0.15, cz: 1.2, w: 0.46, d: 0.46, y0: 0, y1: 1.5 };
    P.addDynamic(() => [person]); P.refreshDynamic();
    expect(P.solidAt(0.15, 1.2, 1)).toBe(true);
    const solid = (x, y, z) => P.solidAt(x, z, y), C = thirdFor(390 / 844, {});
    const st = createWalkCam(), f = { x: 0, y: 0, z: 0, vx: 0, vz: 0, dt: 0, landing: false };
    placeWalk(st, f, 0, solid, () => 0, true, C);
    expect(st.boom).toBeGreaterThan(C.dist - 0.2);                       // he is thin: the boom stays out even while his box is solid
    withoutMoving(P, () => placeWalk(st, f, 0, solid, () => 0, true, C));
    expect(st.boom).toBeCloseTo(C.dist, 1);                              // and the moving boxes are still restored afterwards
    expect(P.solidAt(0.15, 1.2, 1)).toBe(true);                          // and he is back for the walker's own collisions
    expect(() => withoutMoving(P, () => { throw new Error('x'); })).toThrow();
    expect(P.solidAt(0.15, 1.2, 1)).toBe(true);                          // even after a throw
  });
});

describe('walk camera: boom spring, thin occluders, the floor', () => {
  const pose = { x: 0, y: 0, z: 0, vx: 0, vz: 0, dt: 0, landing: false };
  const C = () => thirdFor(390 / 844, {});

  test('a pole, a passer-by and a bench under the line to his head do not shorten it; a wall does', () => {
    const pole = (x, y, z) => Math.hypot(x - 0.15, z - 1.2) < 0.12 && y > 0 && y < 6;
    const person = (x, y, z) => Math.abs(x - 0.15) < 0.23 && Math.abs(z - 1.2) < 0.23 && y > 0 && y < 1.7;
    const bench = (x, y, z) => Math.abs(x) < 0.8 && z > 0.8 && z < 4.2 && y > 0 && y < 0.5;   // (a car's roof is not under the line: see the sight tests)
    const wall = (x, y, z) => z > 1.6 && z < 2.1 && Math.abs(x) < 3 && y > 0 && y < 8;
    for (const solid of [pole, person, bench]) {
      const st = createWalkCam();
      placeWalk(st, pose, 0, solid, () => 0, true, C());
      expect(st.boom).toBeGreaterThan(C().dist - 0.15);
    }
    expect(occludesBoom(pole, 0.15, 1.2, 1.2, 1, 0, 0, 1)).toBe(false);
    expect(occludesBoom(wall, 0, 1.2, 1.8, 1, 0, 0, 1)).toBe(true);
    const st = createWalkCam();
    placeWalk(st, pose, 0, wall, () => 0, true, C());
    expect(st.boom).toBeLessThan(C().dist - 0.4);
    const solved = {};
    solveWalkBoom({ x: 0, y: 0.9, z: 0 }, { x: 0, y: 1.53, z: C().dist }, bench, solved, C());
    expect(solved.dist).toBeGreaterThan(C().dist - 0.15);
  });

  test('a wall that crosses the boom shortens it by at most 0.24 m in one frame, then settles', () => {
    let on = false;
    const wall = (x, y, z) => on && z > 1.5 && z < 2.2 && Math.abs(x) < 4 && y < 8;
    const st = createWalkCam(), rig = C();
    const f = { ...pose };
    placeWalk(st, f, 0, wall, () => 0, true, rig);
    f.dt = 1 / 60;
    for (let i = 0; i < 8; i++) placeWalk(st, f, 0, wall, () => 0, false, rig);
    const full = st.boom;
    on = true;
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      const b = st.boom;
      placeWalk(st, f, 0, wall, () => 0, false, rig);
      worst = Math.max(worst, b - st.boom);
    }
    expect(worst).toBeLessThanOrEqual(BOOM.maxIn + 1e-6);
    expect(st.boom).toBeLessThan(full - 0.4);
    expect(st.z).toBeLessThanOrEqual(1.5 + BOOM.maxIn);
  });

  test('the camera stays at least 0.6 m above the ground under it and never looks up', () => {
    const ground = (x, z) => (z > 0.4 ? 2.2 : 0);
    const st = createWalkCam(), rig = C();
    placeWalk(st, pose, 0, () => false, ground, true, rig);
    const g = ground(st.x, st.z);
    expect(g).toBeGreaterThan(1);
    expect(st.y).toBeGreaterThanOrEqual(g + BOOM.floor - 1e-6);
    expect(st.y).toBeGreaterThanOrEqual(st.ty - 1e-6);
    expect(st.boom).toBeGreaterThan(rig.dist - 0.15);   // the step behind him does not collapse the framing
    const high = createWalkCam();
    placeWalk(high, pose, 0, () => false, () => 8, true, rig);
    expect(high.y).toBeLessThan(3);   // a deck far above the camera is a ceiling, not the floor
    expect(high.boom).toBeGreaterThan(rig.dist - 0.15);
  });

  test('a building the ray starts inside does not collapse the boom; letting it out is capped', () => {
    const rig = C();
    const building = (x, y, z) => Math.abs(x) < 3 && z > -1 && z < rig.dist + 1 && y > -1 && y < 12;
    const st = createWalkCam();
    placeWalk(st, pose, 0, building, () => 0, true, rig);
    expect(st.boom).toBeGreaterThan(rig.dist - 0.15);
    st.boom = 0.2; st.boomV = 0;
    const f = { ...pose, dt: 0.5 };
    placeWalk(st, f, 0, () => false, () => 0, false, rig);
    expect(st.boom).toBeLessThanOrEqual(0.2 + BOOM.maxIn + 1e-6);
    expect(st.boom).toBeGreaterThan(0.2);
  });

  test('a step up is followed within 0.24 m, and stepping off a high surface drops at most that', () => {
    const rig = C();
    let high = true;
    const ground = (x, z) => (high && z > 0.4 ? 2.2 : 0);
    const st = createWalkCam();
    const f = { ...pose, dt: 1 / 30 };
    placeWalk(st, f, 0, () => false, ground, true, rig);
    const lifted = st.y;
    expect(lifted).toBeGreaterThan(2.5);
    high = false;
    placeWalk(st, f, 0, () => false, ground, false, rig);
    expect(lifted - st.y).toBeLessThanOrEqual(BOOM.maxIn + 1e-6);
    expect(st.y).toBeGreaterThan(lifted - BOOM.maxIn - 1e-6);
    const y1 = st.y;
    f.y = 0.8;
    placeWalk(st, f, 0, () => false, ground, false, rig);
    expect(st.y).toBeGreaterThanOrEqual(y1 + 0.8 - BOOM.maxIn - 1e-6);
  });

  test('an upper deck is not the ground under the boom', () => {
    const P = new Physics(() => 0);
    P.addWalkBox(0, 1.5, 8, 6, 0, 6);
    expect(P.groundHeight(0, 1.5, 1e9)).toBeCloseTo(6, 5);
    expect(walkGround((x, z, y) => P.groundHeight(x, z, y), 0, 0, 1.5)).toBeCloseTo(0, 5);
    const st = createWalkCam(), rig = C();
    const ground = (x, z) => walkGround((a, b, y) => P.groundHeight(a, b, y), 0, x, z);
    placeWalk(st, pose, 0, () => false, ground, true, rig);
    expect(st.boom).toBeGreaterThan(rig.dist - 0.15);
    expect(st.y).toBeLessThan(3);
  });
});

// ------------------------------------------------------------------ [sight] a cut, and he is never left hidden
describe('walk camera: a cut solves straight to the clear distance', () => {
  const flat = () => 0;
  const frame = (x, z, dt = 1 / 60) => ({ x, y: 0, z, vx: 0, vz: 0, dt, landing: false });
  const rig = () => thirdFor(16 / 9, {});

  test('his feet jumping over 2 m in one frame is a cut (no easing); a step of 1.5 m is walking (at most 0.24 m a frame)', () => {
    const wall = (x, y, z) => x > -10 && x < 10 && z > 2.4 && z < 3.2 && y < 8;   // 2.4 m behind him where he arrives
    const C = rig();
    const st = createWalkCam();
    placeWalk(st, frame(300, 0, 0), 0, wall, flat, true, C);
    expect(st.boom).toBeCloseTo(C.dist, 2);
    placeWalk(st, frame(0, 0), 0, wall, flat, false, C);           // 300 m in one frame, not flagged as a placed pose
    expect(st.cut).toBe(true);
    const clear = st.boom;
    expect(clear).toBeLessThan(2.4);                                // in front of the wall, at once
    expect(clear).toBeGreaterThan(1.5);
    placeWalk(st, frame(0, 0), 0, wall, flat, false, C);
    expect(st.cut).toBe(false);
    expect(Math.abs(st.boom - clear)).toBeLessThan(0.01);           // and walking again: it does not slide after the cut
    // the same wall reached by a 1.5 m step is eased
    const walk = createWalkCam();
    placeWalk(walk, frame(-11.2, 0), 0, wall, flat, true, C);
    expect(walk.boom).toBeCloseTo(C.dist, 2);
    let worst = 0, prev = walk.boom;
    placeWalk(walk, frame(-9.7, 0), 0, wall, flat, false, C);
    expect(walk.cut).toBe(false);
    for (let i = 0; i < 40; i++) { worst = Math.max(worst, prev - walk.boom); prev = walk.boom; placeWalk(walk, frame(-9.7, 0), 0, wall, flat, false, C); }
    expect(worst).toBeLessThanOrEqual(BOOM.maxIn + 1e-6);
    expect(walk.boom).toBeLessThan(2.4);
  });

  test('setPose (a tour stop, a door) is a cut: the camera is clear of the wall behind him in the same frame, and stays there', () => {
    const wall = (x, y, z) => x > 250 && z > 302.2 && z < 303 && y < 8;
    const camera = new THREE.PerspectiveCamera(fovFor(16 / 9), 16 / 9, 0.1, 1000);
    const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, flatWorld(flat, wall), { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
    p.enabled = true; p.person = 'third';
    const st = createWalkCam(), C = rig();
    p.chase = (pl, f) => { placeWalk(st, f, pl.yaw, wall, flat, !!pl._placed, C); camera.position.set(st.x, st.y, st.z); camera.lookAt(st.tx, st.ty, st.tz); };   // as play/avatar/index.js
    p.setPose(0, 0, 0, 0);
    for (let i = 0; i < 20; i++) { p.step(1 / 60); p.present(1, 1 / 60); }
    expect(st.boom).toBeCloseTo(C.dist, 1);
    p.setPose(300, 300, 0, 0);                                      // yaw 0: the camera is behind him, at z + 4.45: the wall is 2.2 m behind
    const boom = st.boom;
    expect(boom).toBeLessThan(2.2);
    expect(wall(camera.position.x, camera.position.y, camera.position.z)).toBe(false);
    expect(camera.position.z).toBeLessThan(302.2);
    for (let i = 0; i < 30; i++) { p.step(1 / 60); p.present(1, 1 / 60); expect(Math.abs(st.boom - boom)).toBeLessThan(0.01); }
  });
});

describe('walk camera: he is seen (sight lines, not the old "wall top under the camera" pass)', () => {
  const flat = () => 0;
  const at0 = { x: 0, y: 0, z: 0, vx: 0, vz: 0, dt: 0, landing: false };
  const rig = () => thirdFor(16 / 9, {});
  const cut = (solid, C = rig(), yaw = 0) => { const st = createWalkCam(); placeWalk(st, at0, yaw, solid, flat, true, C); return st; };

  test('a wall that rises above the line from the camera to his head occludes, even when its top is under the camera + 0.35 m', () => {
    const C = rig();
    const camY = C.height - C.dist * Math.sin(C.pitch);              // the ideal camera's height: 2.23 m
    const wall = (x, y, z) => z > 2 && z < 2.4 && Math.abs(x) < 6 && y < camY + 0.3;   // 2.5 m high: top <= camera + 0.35, the old pass
    expect(camY + 0.3).toBeGreaterThan(2.4);
    const st = cut(wall, C);
    expect(st.boom).toBeLessThan(2.0);
    expect(st.boom).toBeGreaterThan(1.2);
    expect(wall(st.x, st.y, st.z)).toBe(false);
    // a wall whose top is under the line (1.0 m, 2 m behind him, the line is 1.46 m there) does not
    const low = (x, y, z) => z > 2 && z < 2.4 && Math.abs(x) < 6 && y < 1.0;
    expect(cut(low, C).boom).toBeGreaterThan(C.dist - 0.05);
    // 1.6 m, 2 m behind him: above the line there (1.46 m): it hides his head
    const mid = (x, y, z) => z > 2 && z < 2.4 && Math.abs(x) < 6 && y < 1.6;
    expect(cut(mid, C).boom).toBeLessThan(2.0);
    // and a wall that only reaches the camera end of the line, under it, lets the camera over: the line to his head is clear there
    const kerb = (x, y, z) => z > 3.4 && z < 4.8 && Math.abs(x) < 6 && y < 1.0;
    expect(cut(kerb, C).boom).toBeGreaterThan(C.dist - 0.05);
  });

  test('a 0.3 m wall met at 45 degrees is a wall (it read as a pole when only the ray and its cross were measured); a 0.5 m pole is not, at any heading', () => {
    const c = Math.SQRT1_2;
    const diagonal = (x, y, z) => Math.abs((z - x) * c - 2) < 0.15 && Math.abs((x + z) * c) < 8 && y < 3;   // 0.3 m thick, 16 m long, on the diagonal, 2 m to the side of him: the boom behind him meets it at 45 degrees
    const pole = (x, y, z) => Math.hypot(x - 1, z - 1) < 0.25 && y < 6;
    expect(occludesBoom(diagonal, 0.35, 1, 0.35 + 2 * Math.SQRT2)).toBe(true);
    expect(occludesBoom(diagonal, 2, 1, 2 + 2 * Math.SQRT2)).toBe(true);
    for (let a = 0; a < 8; a++) expect(occludesBoom(pole, 1 + Math.cos(a * 0.7) * 0.1, 1, 1 + Math.sin(a * 0.7) * 0.1)).toBe(false);
    const C = rig(), st = cut(diagonal, C, 0);
    expect(st.boom).toBeLessThan(2 * Math.SQRT2 + 0.35 - 0.2);                     // in front of the wall, it is 3.2 m behind
    expect(st.boom).toBeGreaterThan(2);
  });

  test('a car whose roof rises above the line between the camera and him shortens the boom; it no longer rides inside it', () => {
    const C = thirdFor(390 / 844, {});                               // the portrait rig: the camera is at 1.53 m, the roof at 1.6 m
    const car = (x, y, z) => Math.abs(x) < 0.8 && z > 0.8 && z < 4.2 && y > 0 && y < 1.6;
    const st = cut(car, C);
    expect(st.boom).toBeLessThan(C.dist - 1);
    expect(car(st.x, st.y, st.z)).toBe(false);
  });

  test('a thick trunk on the line: a cut goes in front of it, standing still comes in after a moment, a trunk beside the line does nothing', () => {
    const C = rig();
    let on = false;
    const trunk = (x, y, z) => on && Math.hypot(x, z - 2.5) < 0.3 && y < 8;   // 0.6 m across (thin), 2.5 m behind him, on the line
    const hidden = (st) => sightClear(trunk, { x: 0, y: 0, z: 0 }, 0, st.x, st.y, st.z);
    // a cut: straight to the clear distance
    on = true;
    const cutSt = cut(trunk, C);
    expect(cutSt.boom).toBeGreaterThan(1.5); expect(cutSt.boom).toBeLessThan(2.3);
    expect(hidden(cutSt)).toBe(1);                                    // he is seen from there
    // walking: not hidden at first, then the trunk is there
    on = false;
    const st = cut(trunk, C);
    expect(st.boom).toBeCloseTo(C.dist, 1);
    const f = { ...at0, dt: 1 / 60 };
    on = true;
    let worst = 0, prev = st.boom;
    const trace = [];
    for (let i = 1; i <= 120; i++) { placeWalk(st, f, 0, trunk, flat, false, C); worst = Math.max(worst, prev - st.boom); prev = st.boom; trace.push(st.boom); }
    expect(trace[Math.round(0.3 * 60) - 1]).toBeGreaterThan(C.dist - 0.05);   // 0.3 s: a pole going by, not a wall
    expect(trace[trace.length - 1]).toBeGreaterThan(1.5); expect(trace[trace.length - 1]).toBeLessThan(2.3);
    expect(worst).toBeLessThanOrEqual(BOOM.maxIn + 1e-6);
    expect(hidden(st)).toBe(1);
    // a trunk beside the line (0.9 m to the side): he is seen past it
    const beside = (x, y, z) => Math.hypot(x - 0.9, z - 2.5) < 0.3 && y < 8;
    expect(cut(beside, C).boom).toBeGreaterThan(C.dist - 0.05);
  });

  test('a pole within 1.5 m of the lens hides him at any width; the same pole near him hides only part of him', () => {
    const C = rig();
    const pole = (z, r = 0.12) => (x, y, zz) => Math.hypot(x - 0.3, zz - z) < r && y > 0 && y < 6;   // on the line (the camera is 0.35 m to his right)
    const nearLens = cut(pole(3.4), C);                               // 1.06 m from the camera
    expect(nearLens.boom).toBeLessThan(3.4);
    expect(nearLens.boom).toBeGreaterThan(SIGHT.minThin);
    expect(cut(pole(1.0), C).boom).toBeGreaterThan(C.dist - 0.05);    // 1 m from him: his shoulders are clear, and it is not worth his head
  });

  test('a pole going by does not pump the boom: it passes the lens in a moment, at a walk and at a run', () => {
    for (const speed of [1.5, 3.1]) {
      const pole = { x: 0.56, z: -8, r: 0.24 };                        // beside his path, as close as his own body lets him pass
      const solid = (x, y, z) => Math.hypot(x - pole.x, z - pole.z) < pole.r && y > -0.5 && y < 6;
      const world = { ...flatWorld(flat, solid), resolve(p, r) { const dx = p.x - pole.x, dz = p.z - pole.z, d = Math.hypot(dx, dz), m = r + pole.r; if (d < m && d > 1e-6) { p.x = pole.x + dx / d * m; p.z = pole.z + dz / d * m; } } };
      const camera = new THREE.PerspectiveCamera(fovFor(16 / 9), 16 / 9, 0.1, 1000);
      const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, world, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
      p.enabled = true; p.person = 'third'; p.walk3 = speed; p.run3 = speed;
      const st = createWalkCam(), C = rig();
      p.chase = (pl, f) => { placeWalk(st, f, pl.yaw, solid, flat, !!pl._placed, C); camera.position.set(st.x, st.y, st.z); camera.lookAt(st.tx, st.ty, st.tz); };
      p.setPose(0.56 - 0.56, 3, 0, 0);
      let minBoom = Infinity, maxStep = 0, prev = null;
      for (let i = 0; i < 60 * (16 / speed + 2); i++) {
        p.keys.clear(); p.keys.add('KeyW');
        p.step(1 / 60); p.present(1, 1 / 60);
        minBoom = Math.min(minBoom, st.boom);
        const rel = [st.x - p.pos.x, st.z - p.pos.z];
        if (prev) maxStep = Math.max(maxStep, Math.hypot(rel[0] - prev[0], rel[1] - prev[1]));
        prev = rel;
      }
      expect(p.pos.z).toBeLessThan(-10);                               // he walked past it
      expect(minBoom).toBeGreaterThan(C.dist - 0.02);                  // the boom never moved
      expect(maxStep).toBeLessThan(0.05);
    }
  });

  test('reduced motion snaps every frame to the boom\'s target but is not a cut: a thing hiding him for a moment changes nothing; a placed pose does not wait', () => {
    const C = rig();
    let on = false;
    const trunk = (x, y, z) => on && Math.hypot(x, z - 2.5) < 0.3 && y < 8;
    const f = { ...at0, dt: 1 / 60, cut: false };
    const st = createWalkCam();
    placeWalk(st, { ...f, dt: 0 }, 0, trunk, flat, true, C);
    on = true;
    for (let i = 0; i < 15; i++) { placeWalk(st, f, 0, trunk, flat, true, C); expect(st.cut).toBe(false); expect(st.boom).toBeCloseTo(C.dist, 2); }   // 0.25 s, snapping
    for (let i = 0; i < 90; i++) placeWalk(st, f, 0, trunk, flat, true, C);
    expect(st.boom).toBeLessThan(2.3);                                    // and after the moment it is in front of it, at once
    const placed = createWalkCam();
    placeWalk(placed, { ...f, dt: 0 }, 0, () => false, flat, true, C);
    placeWalk(placed, { ...f, cut: true }, 0, trunk, flat, true, C);
    expect(placed.cut).toBe(true); expect(placed.boom).toBeLessThan(2.3);
  });

  test('after a cut he is seen, or the boom has no room: random walls and trunks, both rigs, any heading', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const scene = (walls) => {
      const obs = [], k = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) {
        const a = rnd() * Math.PI * 2, d = 0.8 + rnd() * 5, cx = Math.cos(a) * d, cz = Math.sin(a) * d, top = 0.6 + rnd() * 3.2;
        if (!walls && rnd() < 0.5) { const r = 0.4 + rnd() * 0.3; obs.push((x, y, z) => y < top && Math.hypot(x - cx, z - cz) < r); }
        else { const w = 3 + rnd() * 5, t = 0.3 + rnd() * 0.3, rot = rnd() * Math.PI, c = Math.cos(rot), s = Math.sin(rot); obs.push((x, y, z) => { const dx = x - cx, dz = z - cz; return y < top && Math.abs(dx * c - dz * s) < w / 2 && Math.abs(dx * s + dz * c) < t / 2; }); }
      }
      return (x, y, z) => { for (const o of obs) if (o(x, y, z)) return true; return false; };
    };
    // (he stands on free ground: nothing within 0.4 m of his body)
    const free = (solid) => { for (const h of [0.2, 0.55, 0.85, 1.1]) for (let a = 0; a < 8; a++) if (solid(Math.cos(a * Math.PI / 4) * 0.4, h, Math.sin(a * Math.PI / 4) * 0.4)) return false; return !solid(0, 0.2, 0) && !solid(0, 0.85, 0); };
    const headClear = (solid, st) => {
      const head = { x: 0, y: SIGHT.lines[0][0], z: 0 }, L = Math.hypot(st.x - head.x, st.y - head.y, st.z - head.z);
      for (let d = 0.25; d < L - 0.3; d += 0.05) if (solid(head.x + (st.x - head.x) * d / L, head.y + (st.y - head.y) * d / L, head.z + (st.z - head.z) * d / L)) return false;
      return true;
    };
    for (const walls of [true, false]) {
      let n = 0, tight = 0;
      for (let trial = 0; trial < 400; trial++) {
        const solid = scene(walls), C = thirdFor(rnd() < 0.5 ? 16 / 9 : 390 / 844, {}), yaw = rnd() * Math.PI * 2;
        if (!free(solid)) continue;
        const st = createWalkCam();
        placeWalk(st, at0, yaw, solid, flat, true, C);
        n++;
        if (st.boom <= 0.8) { tight++; continue; }
        // a wall on the line to his head is never left there; a mixed scene (a trunk's rim, a stump) leaves him at least partly seen
        if (walls) expect(headClear(solid, st)).toBe(true);
        else expect(sightClear(solid, { x: 0, y: 0, z: 0 }, yaw, st.x, st.y, st.z)).toBe(1);
      }
      expect(n).toBeGreaterThan(150);
      expect(tight).toBeLessThan(n);
    }
  });
});

// ------------------------------------------------------------------ [sight] what the camera could not see: trunks, the drawn ground
describe('walk camera: the forest\'s trunks, the drawn terrain, an arrival with his back to a wall', () => {
  const flat = () => 0;
  const at0 = { x: 0, y: 0, z: 0, vx: 0, vz: 0, dt: 0, landing: false };

  test('a forest tree\'s trunk is the drawn one: 0.1 x the crown radius (broadleaf) and 0.118 x (cedar) at the foot, tapering, planted 0.35 m down', () => {
    const t = { x: 1, z: 2, y: 20.5, h: 12.4, r: 5.6, type: 'broadleaf' };
    const k = trunkOf(t);
    expect(k[0]).toBeCloseTo(20.5 - TREE_FOOT, 9);
    expect(k[1]).toBeCloseTo(20.5 - TREE_FOOT + 0.4 * 12.4, 9);
    expect(k[2]).toBeCloseTo(0.56, 9); expect(k[3]).toBeCloseTo(0.392, 9);
    const c = trunkOf({ x: 0, z: 0, y: 0, h: 10, r: 2.2, type: 'cedar' });
    expect(c[2]).toBeCloseTo(0.026 / 0.22 * 2.2, 9); expect(c[1] - c[0]).toBeCloseTo(0.22 * 10, 9);
    expect(trunkOf({ x: 0, z: 0, y: 0, h: 0, r: 1 })).toBe(null);
    expect(trunkOf({ x: NaN, z: 0, y: 0, h: 1, r: 1 })).toBe(null);
  });

  test('the trunk probe answers inside a trunk only, within its height, gathers round the walker, and follows a new list', () => {
    const trees = [{ x: 0, z: 3, y: 0, h: 10, r: 5, type: 'broadleaf' }, { x: 40, z: 0, y: 0, h: 10, r: 5, type: 'cedar' }];
    const probe = createTrunkProbe(() => trees);
    expect(probe.prepare(0, 0)).toBe(1);                                   // the far one is not gathered
    expect(probe.hit(0, 1, 3)).toBe(true);                                 // in the trunk, 1 m up
    expect(probe.hit(0.44, 1, 3)).toBe(true);                              // 0.449 m across at 1 m up (0.5 at the foot, 0.35 at 4 m)
    expect(probe.hit(0.6, 1, 3)).toBe(false);
    expect(probe.hit(0, 3, 3)).toBe(true); expect(probe.hit(0.45, 3.6, 3)).toBe(false);   // tapering: 0.35 m across at the top of the trunk (3.65 m)
    expect(probe.hit(0, 3.8, 3)).toBe(false);                              // above the trunk (3.65 m): the crown, not modelled
    expect(probe.hit(0, -1, 3)).toBe(false);                               // under the planted foot
    expect(probe.prepare(40, 0)).toBe(1); expect(probe.hit(40, 1, 0)).toBe(true);
    trees.push({ x: 41, z: 0, y: 0, h: 10, r: 5, type: 'broadleaf' });
    expect(probe.prepare(40, 0)).toBe(2);                                  // a longer list is indexed again
    expect(createTrunkProbe(() => null).prepare(0, 0)).toBe(0);
    expect(createTrunkProbe(() => []).hit(0, 1, 0)).toBe(false);
  });

  test('a big trunk at his heels hides him and there is no boom to give: an arrival steps ahead along the view until he is seen, and the trunk is never a wall', () => {
    const trees = [{ x: 0.1, z: 0.9, y: 0.72, h: 12.4, r: 5.6, type: 'broadleaf' }];   // the 気仙沼ハリストス正教会 spot, in his own frame (view -z, the camera at +z)
    const probe = createTrunkProbe(() => trees);
    const C = thirdFor(16 / 9, {});
    const solve = (zAhead, cut = true) => {
      const f = { x: 0, y: 0, z: -zAhead, vx: 0, vz: 0, dt: 0, landing: false };
      probe.prepare(f.x, f.z);
      const st = createWalkCam();
      placeWalk(st, f, 0, () => false, flat, true, C, undefined, probe.hit);
      return st;
    };
    const here = solve(0);
    expect(here.seen).toBe(false);                                           // hidden by a trunk 0.34 m from him, and the boom cannot come in below 1.2 m
    expect(here.boom).toBeCloseTo(C.dist, 1);                                // (a trunk he walks through is no wall: the boom is not collapsed onto his head)
    const score = (z) => { const st = solve(z); return st.seen ? st.boom : Math.min(st.boom, 0.4); };
    const s = chooseArrival(score, C);
    expect(ARRIVE.steps).toContain(s);
    const there = solve(s);
    expect(there.seen).toBe(true);
    expect(there.boom).toBeGreaterThan(C.dist * ARRIVE.good - 0.01);
    expect(sightClear((x, y, z) => probe.hit(x, y, z), { x: 0, y: 0, z: -s }, 0, there.x, there.y, there.z)).toBe(1);   // and the line to his head is clear from there
  });

  test('chooseArrival: here when the boom has room; the nearest good place; the best gain; never a worse one', () => {
    const C = { dist: 4.5 };
    const calls = [];
    expect(chooseArrival((s) => { calls.push(s); return 4.5; }, C)).toBe(0);
    expect(calls).toEqual([0]);                                                // (it did not even look ahead)
    expect(chooseArrival((s) => [0.3, 1, 2.5, 3.4, 4, 4.5][ARRIVE.steps.indexOf(s) + 1] ?? 0.3, C)).toBe(2.25);   // 3.4 >= 0.7 x 4.5 (3.15)
    expect(chooseArrival((s) => (s === 0 ? 0.3 : s === 1.5 ? 1.5 : s === 3 ? 2.5 : -1), C)).toBe(3);        // none good: the most gained
    expect(chooseArrival((s) => (s === 0 ? 2 : s === 1.5 ? 2.3 : 1.9), C)).toBe(0);                        // a gain under 0.5 m is not worth moving him
    expect(chooseArrival((s) => (s === 0 ? 2 : -1), C)).toBe(0);                                          // nowhere to stand
  });

  test('he is drawn on the higher of the DEM and the terrain skin, on bare terrain only: never on a deck, never under a road cut', () => {
    const dem = () => 6.33, walk = () => 6.33, skin = (x, z) => 7.3;
    expect(terrainLift(dem, walk, skin, 0, 6.33, 0)).toBeCloseTo(0.97, 9);
    expect(terrainLift(dem, walk, () => 6.2, 0, 6.33, 0)).toBe(0);            // the skin is under the DEM: a road mesh is drawn at the DEM
    expect(terrainLift(dem, () => 7.9, skin, 0, 7.9, 0)).toBe(0);             // on a deck / a stair (his feet are not at the DEM)
    expect(terrainLift(dem, () => 6.5, skin, 0, 6.33, 0)).toBe(0);            // a walk box under him
    expect(terrainLift(dem, walk, () => 9, 0, 6.33, 0)).toBe(1.5);            // clamped
    expect(terrainLift(dem, walk, null, 0, 6.33, 0)).toBe(0);
    expect(terrainLift(dem, walk, () => 6.34, 0, 6.33, 0)).toBe(0);           // (a centimetre is not worth a lift)
  });
});

describe('arrivals: tour.walkTo hands the spot to the third-person camera', () => {
  const fakeCtx = (player) => ({ L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: 'high' }, playerObj: player });

  test('walkTo sets the pose, then asks the avatar to arrive (with the stop\'s own walk spot); an avatar that throws does not fail the walk', () => {
    const calls = [];
    const player = { fly: true, setPose: (...a) => calls.push(['setPose', ...a]), arrive: (spot) => { calls.push(['arrive', spot]); } };
    const tour = createTour(fakeCtx(player));
    const hero = tour.stops.find((s) => s.id === 'hero');
    expect(tour.walkTo('hero')).toBe(true);
    expect(player.fly).toBe(false);
    expect(calls.map((c) => c[0])).toEqual(['setPose', 'arrive']);
    expect(calls[1][1]).toBe(hero.walk);
    const rude = { fly: true, setPose() {}, arrive() { throw new Error('no'); } };
    expect(createTour(fakeCtx(rude)).walkTo('hero')).toBe(true);
    expect(createTour(fakeCtx({ fly: true, setPose() {} })).walkTo('hero')).toBe(true);   // (a player with no avatar)
  });

  test('four spots say how the third-person camera wants him (カトリック, 勝林寺, 紫神社, 安波山), and the stops carry it; the first-person spot is untouched', () => {
    expect(WALK_THIRD.catholic).toEqual({ ahead: 1.5, turn: 30 });
    expect(WALK_THIRD['lm-shorinji']).toEqual({ ahead: 2.25 });
    expect(WALK_THIRD['lm-murasaki']).toEqual({ ahead: 1.5 }); expect(WALK_THIRD.atago).toEqual({ turn: 20 });
    for (const [id, t] of Object.entries(WALK_THIRD)) expect([id, (t.ahead || 0) >= 0 && (t.ahead || 0) <= 4 && Math.abs(t.turn || 0) <= 45]).toEqual([id, true]);
    const net = { onRoad: () => true, nearest: () => null, segmentsNear: () => [] };
    const stops = placeStops(L, net, EXTRA_PLACES.filter((p) => p.id === 'catholic'));
    const c = stops.find((s) => s.id === 'catholic');
    expect(c.walk.third).toEqual(WALK_THIRD.catholic);
    expect({ x: c.walk.x, z: c.walk.z, yaw: c.walk.yaw, pitch: c.walk.pitch }).toEqual({ x: WALK_SET.catholic.x, z: WALK_SET.catholic.z, yaw: WALK_SET.catholic.yaw, pitch: WALK_SET.catholic.pitch });
    expect(WALK_SET.catholic.third).toBeUndefined();
  });
});
