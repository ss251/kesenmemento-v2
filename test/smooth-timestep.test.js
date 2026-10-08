// [smooth] core/timestep.js: the fixed-step clock, its vsync snapping, the spiral-of-death cap, and the frame-rate independent helpers.
import { test, expect } from 'bun:test';
import { createClock, createPacer, snapFrame, damp, lerp, lerpAngle, STEP } from '../src/anime/core/timestep.js';

/** Feed frames; returns per frame { steps, alpha, renderTime }. */
function run(clock, frames) { return frames.map((dt) => { const r = clock.advance(dt); return { ...r, renderTime: clock.renderTime }; }); }

test('a 60 Hz screen runs exactly one step a frame, even with timestamp jitter', () => {
  const c = createClock();
  const jitter = [0.0003, -0.0004, 0.0002, -0.0001, 0.00045, -0.00045];
  const out = run(c, Array.from({ length: 600 }, (_, i) => 1 / 60 + jitter[i % jitter.length]));
  expect(out.every((f) => f.steps === 1)).toBe(true);
  expect(c.time).toBeCloseTo(10, 9);
});

test('a 120 Hz screen alternates 0 and 1 steps, and the drawn instant moves by exactly 1/120 s a frame', () => {
  const c = createClock();
  const out = run(c, Array(240).fill(1 / 120));
  expect(out.filter((f) => f.steps === 1).length).toBe(120);
  for (let i = 1; i < out.length; i++) expect(out[i].renderTime - out[i - 1].renderTime).toBeCloseTo(1 / 120, 9);
  expect(c.time).toBeCloseTo(2, 9);
});

test('uneven frames (16.7 / 25 / 33.3 / 41.7 ms): the drawn instant always advances by the frame time (no judder from the stepping)', () => {
  const c = createClock();
  const frames = [];
  for (let i = 0; i < 400; i++) frames.push([1 / 60, 3 / 120, 1 / 30, 5 / 120][i * 7 % 4]);
  const out = run(c, frames);
  for (let i = 1; i < out.length; i++) expect(out[i].renderTime - out[i - 1].renderTime).toBeCloseTo(frames[i], 9);
  for (const f of out) { expect(f.alpha).toBeGreaterThanOrEqual(0); expect(f.alpha).toBeLessThanOrEqual(1); }
});

test('45 Hz and 50 Hz screens: steps of 1 or 2, the drawn instant still uniform', () => {
  for (const hz of [45, 50, 72, 90, 144]) {
    const c = createClock();
    const out = run(c, Array(hz * 3).fill(1 / hz));
    for (let i = 1; i < out.length; i++) expect(out[i].renderTime - out[i - 1].renderTime).toBeCloseTo(1 / hz, 6);
    expect(c.time).toBeGreaterThan(3 - 2 * STEP);
    expect(c.time).toBeLessThanOrEqual(3 + 1e-9);
  }
});

test('the spiral of death: a stalled frame runs at most maxSteps steps, the rest is dropped, the fraction kept', () => {
  const c = createClock({ maxSteps: 6, maxFrame: 0.25 });
  c.advance(STEP * 0.5);
  const r = c.advance(0.5);   // capped to 0.25 s = 15 steps (plus the half) -> 6
  expect(r.steps).toBe(6);
  expect(r.alpha).toBeCloseTo(0.5, 6);
  expect(c.dropped).toBeCloseTo(9 * STEP, 9);
  const r2 = c.advance(1 / 60);
  expect(r2.steps).toBe(1);
});

test('zero, negative and NaN frames run nothing', () => {
  const c = createClock();
  for (const dt of [0, -1, NaN, undefined]) expect(c.advance(dt).steps).toBe(0);
  expect(c.time).toBe(0);
});

test('snapFrame: within 0.5 ms of a whole number of 120 Hz vsyncs, exactly that', () => {
  expect(snapFrame(0.0168)).toBe(2 / 120);
  expect(snapFrame(0.0331)).toBe(4 / 120);
  expect(snapFrame(0.0087)).toBe(1 / 120);
  expect(snapFrame(0.0125)).toBe(0.0125);   // 1.5 vsyncs: not snapped
  expect(snapFrame(0)).toBe(0);
});

test('damp is frame-rate independent: two 120 Hz frames cover what one 60 Hz frame does', () => {
  for (const rate of [1.5, 5, 14]) {
    let a = 0, b = 0;
    a += (1 - a) * damp(rate, 1 / 60);
    b += (1 - b) * damp(rate, 1 / 120); b += (1 - b) * damp(rate, 1 / 120);
    expect(a).toBeCloseTo(b, 12);
  }
  expect(damp(5, 0)).toBe(0);
});

test('lerpAngle takes the short way round across +-pi', () => {
  expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
  expect(Math.abs(Math.sin(lerpAngle(3.0, -3.0, 0.5)))).toBeLessThan(0.15);
  expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25, 12);
  expect(lerp(2, 4, 0.5)).toBe(3);
});

/** callbacks at `hz` for `secs`; -> the gaps between drawn frames after the first second */
function pace(hz, secs, o = {}) {
  const p = createPacer(o); const drawn = [];
  for (let i = 0; i < hz * secs; i++) { const t = i * 1000 / hz; if (p.tick(t)) drawn.push(t); }
  const gaps = []; for (let i = 1; i < drawn.length; i++) if (drawn[i] > 1000) gaps.push(drawn[i] - drawn[i - 1]);
  return { gaps, p };
}
test('pacer: a 60 Hz screen draws every vsync', () => {
  const { gaps } = pace(60, 3);
  for (const g of gaps) expect(g).toBeCloseTo(1000 / 60, 6);
});
test('pacer: a 120 Hz screen draws every other vsync, an even 16.7 ms', () => {
  const { gaps, p } = pace(120, 3);
  expect(p.every).toBe(2);
  for (const g of gaps) expect(g).toBeCloseTo(1000 / 60, 6);
});
test('pacer: 144 Hz draws every other (72 fps), 90 Hz and 75 Hz every vsync, 240 Hz every fourth', () => {
  expect(pace(144, 3).p.every).toBe(2);
  expect(pace(90, 3).p.every).toBe(1);
  expect(pace(75, 3).p.every).toBe(1);
  expect(pace(240, 3).p.every).toBe(4);
});
test('pacer: fps 0 draws every vsync; a late callback is drawn at once', () => {
  expect(pace(120, 3, { fps: 0 }).p.every).toBe(1);
  const p = createPacer();
  let t = 0; for (let i = 0; i < 240; i++) { p.tick(t); t += 1000 / 120; }
  t += 1000 / 120 * 3;   // three vsyncs missed: the next callback draws
  expect(p.tick(t)).toBe(true);
});
