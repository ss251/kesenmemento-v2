// [smooth] The fixed-step simulation with interpolation, through the real Player and the real car (explore/drive.js), driven the way main.js
// drives them: clock.advance(frame) -> step() x steps -> lookStep / present at alpha. The walker and the car end in the same place at
// 60 Hz and at 120 Hz, the drawn camera moves by an even amount every frame (no stepping judder), and a placed pose is never blended.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { Player } from '../src/anime/core/player.js';
import { createClock } from '../src/anime/core/timestep.js';
import { createDrive } from '../src/anime/world/explore/drive.js';
import { makeRoadNet } from '../src/anime/world/explore/roadnet.js';

globalThis.addEventListener ??= () => {};
const flat = { groundHeight: () => 0, resolve() {}, standable: () => true };
function mkPlayer() {
  const camera = new THREE.PerspectiveCamera();
  const p = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, flat, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
  p.enabled = true;
  return p;
}
/** main.js's loop for the walker alone: frames of `ms` milliseconds, `secs` seconds; -> the camera x per frame and the player */
function walk(ms, secs, { holdShift = false } = {}) {
  const p = mkPlayer(); const clock = createClock();
  p.setPose(0, 0, 90, 0);   // facing west (-x)
  p.keys.add('KeyW'); if (holdShift) p.keys.add('ShiftLeft');
  const xs = []; let renderT = 0;
  const frames = Math.round(secs * 1000 / ms);
  for (let i = 0; i < frames; i++) {
    const { steps, alpha } = clock.advance(ms / 1000);
    for (let k = 0; k < steps; k++) p.step(clock.step);
    const dt = clock.renderTime - renderT; renderT = clock.renderTime;
    p.lookStep(dt); p.present(alpha, dt);
    xs.push(p.camera.position.x);
  }
  return { p, xs, clock };
}

describe('the walker', () => {
  test('ends in the same place at 60 Hz and at 120 Hz (the fixed step, not the frame, moves it)', () => {
    const a = walk(1000 / 60, 3), b = walk(1000 / 120, 3);
    expect(a.clock.time).toBeCloseTo(b.clock.time, 9);
    expect(a.p.pos.x).toBeCloseTo(b.p.pos.x, 9);
    expect(a.p.pos.x).toBeLessThan(-7);   // ~3.1 m/s for 3 s, accelerating from rest
  });
  test('at 120 Hz the drawn camera moves every frame by the same amount (once at full speed): no 60 Hz stepping', () => {
    const { xs } = walk(1000 / 120, 3);
    const d = []; for (let i = 240; i < xs.length; i++) d.push(xs[i] - xs[i - 1]);   // the last second, at walking speed
    const mean = d.reduce((s, v) => s + v, 0) / d.length;
    expect(mean).toBeLessThan(0);
    for (const v of d) expect(Math.abs(v - mean)).toBeLessThan(Math.abs(mean) * 0.02);
  });
  test('uneven frames (16.7 / 25 / 33.3 ms) still draw an even motion for the time each frame shows', () => {
    const p = mkPlayer(); const clock = createClock(); p.setPose(0, 0, 90, 0); p.keys.add('KeyW');
    let renderT = 0; const rows = [];
    for (let i = 0; i < 400; i++) {
      const ms = [1000 / 60, 25, 1000 / 30][i % 3];
      const { steps, alpha } = clock.advance(ms / 1000);
      for (let k = 0; k < steps; k++) p.step(clock.step);
      const dt = clock.renderTime - renderT; renderT = clock.renderTime;
      p.present(alpha, dt); rows.push([dt, p.camera.position.x]);
    }
    // speed = distance drawn / time shown, the same every frame once walking
    const v = []; for (let i = 300; i < rows.length; i++) v.push((rows[i][1] - rows[i - 1][1]) / rows[i][0]);
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    expect(mean).toBeCloseTo(-3.1, 1);
    for (const x of v) expect(Math.abs(x - mean)).toBeLessThan(0.05);
  });
  test('a placed pose is drawn there at once, never blended from the old one', () => {
    const { p } = walk(1000 / 60, 1);
    p.setPose(500, 500, 0, 0);
    p.present(0.3, 1 / 60);
    expect(p.camera.position.x).toBeCloseTo(500, 9);
    expect(p.camera.position.z).toBeCloseTo(500, 9);
  });
  test('the legacy update(dt) still walks (tests and tools that have no clock)', () => {
    const p = mkPlayer(); p.setPose(0, 0, 90, 0); p.keys.add('KeyW');
    for (let i = 0; i < 120; i++) p.update(1 / 60);
    expect(p.pos.x).toBeLessThan(-4);
    expect(p.camera.position.x).toBeCloseTo(p.pos.x, 9);
  });
});

describe('the car', () => {
  // a straight east-west road, 600 m, 8 m wide
  const net = makeRoadNet([{ pts: [[-300, 0], [300, 0]], width: 8 }]);
  function mkCtx() {
    const camera = new THREE.PerspectiveCamera();
    const pl = mkPlayer();
    const ctx = {
      L: { heightAt: () => 0, WORLD: { play: { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 } } },
      camera, physics: flat, playerObj: pl, shared: {}, services: {}, mat: {}, audio: null, alpha: 1,
      steps: [], frames: [],
      onStep(fn) { this.steps.push(fn); }, onUpdate(fn) { this.frames.push(fn); },
      noOutline() {}, add() {},
    };
    return ctx;
  }
  /** -> the car body x drawn per frame and its final state */
  function driveFor(hz, secs) {
    const ctx = mkCtx(); const drive = createDrive(ctx, { net, carMesh: () => new THREE.Group() });
    drive.enter({ x: 200, z: 2, yaw: Math.PI / 2 });   // facing west, on the left lane
    const clock = createClock(); let renderT = 0; const xs = [];
    // W held: the car reads its own key set from window events; feed the input through the pad stick instead (throttle forward)
    ctx.pad = { move: { x: 0, y: -1 }, brake: false, boost: false, running: false };
    for (let i = 0; i < Math.round(secs * hz); i++) {
      const { steps, alpha } = clock.advance(1 / hz);
      for (let k = 0; k < steps; k++) for (const f of ctx.steps) f(clock.step, 0);
      const dt = clock.renderTime - renderT; renderT = clock.renderTime;
      ctx.alpha = alpha;
      for (const f of ctx.frames) f(dt, 0);
      xs.push(drive.car ? drive.car.position.x : null);
    }
    return { drive, xs };
  }
  test('ends in the same place at 60 Hz and at 120 Hz', () => {
    const a = driveFor(60, 4), b = driveFor(120, 4);
    expect(a.drive.state.x).toBeCloseTo(b.drive.state.x, 6);
    expect(a.drive.state.x).toBeLessThan(190);
  });
  test('at 120 Hz the drawn car moves every frame by an even amount (interpolated between the 60 Hz steps)', () => {
    const { xs } = driveFor(120, 4);
    const d = []; for (let i = 400; i < xs.length; i++) d.push(xs[i] - xs[i - 1]);
    const mean = d.reduce((s, v) => s + v, 0) / d.length;
    expect(mean).toBeLessThan(0);
    for (const v of d) expect(Math.abs(v - mean)).toBeLessThan(Math.abs(mean) * 0.15);   // accelerating: the steps differ a little
    // without interpolation every other frame would not move at all
    expect(d.filter((v) => Math.abs(v) < Math.abs(mean) * 0.25).length).toBe(0);
  });
});
