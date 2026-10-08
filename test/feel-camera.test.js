// [feel] The walker's camera (play/avatar/camera.js placeWalk + thirdFor) driven by the real Player the way main.js drives it: no lag, no
// catch-up, no overshoot after a stop, a look-ahead that turns the view, no shake on kerbs, walls never seen through, the same at 30 fps,
// and a portrait phone framing him at ~20 % of the picture.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { Player } from '../src/anime/core/player.js';
import { createWalkCam, liftBoom, placeWalk, thirdFor, THIRD, THIRD_PORTRAIT, WALK } from '../src/anime/play/avatar/camera.js';
import { fovFor } from '../src/anime/core/fov.js';

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
import { stepSpacing, hoyaCadence } from '../src/anime/play/avatar/steps.js';
describe('feel: the walk cycle locked to speed (the hoya model API, when it is there)', () => {
  test('no gait() on the model: undefined (his own cadence), and the footsteps keep his own spacing', () => {
    expect(gaitCadence({}, 3)).toBeUndefined(); expect(gaitCadence(null, 3)).toBeUndefined();
    expect(stepSpacing(3, 'hoya')).toBeCloseTo(3 / (hoyaCadence(3) * 2), 9);
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
    expect(stepSpacing(1.2, 'hoya', undefined, 3)).toBeCloseTo(0.2, 9);   // two footfalls a cycle
  });
});

import { HOYA_SPEED, hoyaSpeedFrom, RUN_FOV, runFovStep } from '../src/anime/play/avatar/index.js';
describe('feel: his speeds and the run (deploy #8)', () => {
  test('HOYA_SPEED is 1.5 / 3.0 (planted feet); ?hoyaSpeed= overrides it for trying, 0 gives him the walker\u2019s', () => {
    expect(HOYA_SPEED).toEqual({ walk: 1.5, run: 3.0 });
    expect(hoyaSpeedFrom('')).toEqual({ walk: 1.5, run: 3.0 });
    expect(hoyaSpeedFrom('?hoyaSpeed=1.8,3.2')).toEqual({ walk: 1.8, run: 3.2 });
    expect(hoyaSpeedFrom('?hoyaSpeed=2')).toEqual({ walk: 2, run: 4 });
    expect(hoyaSpeedFrom('?hoyaSpeed=0')).toEqual({ walk: null, run: null });
  });
  test('the run widens the view by 3.5° in ~0.4 s and gives it back in ~0.3 s, never past either end', () => {
    const o = { x: 0, v: 0 }; let t90 = null, max = 0;
    for (let i = 1; i <= 90; i++) { runFovStep(o.x, o.v, 1, 1 / 60, o); max = Math.max(max, o.x); if (t90 === null && o.x >= 0.9) t90 = i / 60; }
    expect(t90).toBeGreaterThan(0.5); expect(t90).toBeLessThan(0.75);   // ~0.65 s to 90 %: a gentle swell, not a punch
    expect(max).toBeLessThanOrEqual(1);
    let t10 = null; for (let i = 1; i <= 90; i++) { runFovStep(o.x, o.v, 0, 1 / 60, o); expect(o.x).toBeGreaterThanOrEqual(0); if (t10 === null && o.x <= 0.1) t10 = i / 60; }
    expect(t10).toBeLessThan(0.5);
    expect(RUN_FOV.deg).toBeGreaterThanOrEqual(3); expect(RUN_FOV.deg).toBeLessThanOrEqual(4);
    expect(runFovStep(0.7, 0.2, 0, 0, o).x).toBe(0);   // a still: at once
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
    expect(st.boom).toBeLessThan(1.3);                                   // with him counted, the boom stops at the person (and hides him)
    withoutMoving(P, () => placeWalk(st, f, 0, solid, () => 0, true, C));
    expect(st.boom).toBeCloseTo(C.dist, 1);                              // the walker's camera ignores him
    expect(P.solidAt(0.15, 1.2, 1)).toBe(true);                          // and he is back for the walker's own collisions
    expect(() => withoutMoving(P, () => { throw new Error('x'); })).toThrow();
    expect(P.solidAt(0.15, 1.2, 1)).toBe(true);                          // even after a throw
  });
});
