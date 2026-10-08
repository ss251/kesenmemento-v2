// [smooth] core/dynres.js: the dynamic resolution controller against a model GPU (time = fixed part + pixel part x scale^2).
import { test, expect } from 'bun:test';
import { createDynRes } from '../src/anime/core/dynres.js';

const BUDGET = 1000 / 60;
/** Run `secs` of 60 Hz frames through the controller with a GPU model; -> the scale per frame and the controller */
function run(gpuAt, secs, o = {}) {
  const dr = createDynRes(o); const scales = [];
  for (let i = 0; i < secs * 60; i++) {
    const t = i / 60, s = dr.scale;
    const g = o.noTimer ? null : gpuAt(s, t);
    // a frame is late when the GPU needs more than the budget (the next vsync), as on a real screen
    dr.sample({ gpu: g, frame: o.frameAt ? o.frameAt(s, t) : g !== null && g > BUDGET ? 2 * BUDGET : BUDGET, cpu: o.cpuAt ? o.cpuAt(t) : 4 });
    scales.push(dr.scale);
  }
  return { dr, scales };
}
const model = (fixed, pix) => (s) => fixed + pix * s * s;

test('a busy GPU that still makes every vsync keeps full resolution (no late frames, under 115 % of the budget)', () => {
  const { dr } = run(model(3, 12), 20);   // 15 ms: over 85 %, but every frame on time
  expect(dr.scale).toBe(1);
  expect(dr.changes).toBe(0);
});

test('a light GPU load stays at full resolution, no changes', () => {
  const { dr, scales } = run(model(2, 8), 20);
  expect(scales.every((s) => s === 1)).toBe(true);
  expect(dr.changes).toBe(0);
});

test('a GPU twice over budget (the Retina high tier) comes down to a scale that fits, and stays there (no shimmer)', () => {
  const gpu = model(3, 27);   // 30 ms at full scale
  const { dr, scales } = run(gpu, 30);
  const end = scales[scales.length - 1];
  expect(gpu(end)).toBeLessThan(0.85 * BUDGET);
  expect(end).toBeGreaterThanOrEqual(0.6);
  // after the first 3 s it never changes again
  const tail = scales.slice(180);
  expect(new Set(tail).size).toBe(1);
  expect(dr.changes).toBeLessThanOrEqual(3);
});

test('it climbs back to the largest step whose predicted cost fits, and no higher', () => {
  const gpu = model(2, 16);   // 18 ms at 1.0 (late), 15 at 0.9, 12.2 at 0.8
  const { scales } = run(gpu, 40);
  const end = scales[scales.length - 1];
  expect(gpu(end)).toBeLessThan(0.85 * BUDGET);
  expect(end).toBeCloseTo(0.8, 6);   // 0.9 would make its vsyncs too, but grown from 0.8 by the all-pixels guess it is 15.5 ms > 80 %: the safe side
  const light = run(model(1, 6), 40);   // after a forced drop it goes all the way back
  light.dr.set(0.6);
  for (let i = 0; i < 60 * 30; i++) light.dr.sample({ gpu: model(1, 6)(light.dr.scale), frame: BUDGET, cpu: 4 });
  expect(light.dr.scale).toBe(1);
});

test('a 3 s load spike scales down and comes back up afterwards, one step at a time', () => {
  const gpu = (s, t) => (t > 5 && t < 8 ? 4 + 26 * s * s : 2 + 8 * s * s);
  const { scales } = run(gpu, 30);
  expect(Math.min(...scales.slice(300, 480))).toBeLessThan(1);
  expect(scales[scales.length - 1]).toBe(1);
  for (let i = 1; i < scales.length; i++) if (scales[i] > scales[i - 1]) expect(scales[i] - scales[i - 1]).toBeCloseTo(0.1, 6);
});

test('min and max are respected', () => {
  const { scales } = run(model(5, 100), 20);
  expect(Math.min(...scales)).toBeCloseTo(0.6, 6);
  const r = run(model(1, 1), 10, { max: 0.8 });
  expect(Math.max(...r.scales)).toBeCloseTo(0.8, 6);
});

test('without a GPU timer (Safari): late frames with a light main thread scale down; a CPU-bound page is left alone', () => {
  // the GPU makes every frame late at full scale (two vsyncs), on time from 0.8 down
  const frameAt = (s) => (s > 0.85 ? 2 * BUDGET : BUDGET);
  const a = run(null, 20, { noTimer: true, frameAt, cpuAt: () => 5 });
  expect(a.scales[a.scales.length - 1]).toBeLessThanOrEqual(0.8);
  // the main thread takes 14 ms: lowering the resolution would not help
  const b = run(null, 20, { noTimer: true, frameAt: () => 2 * BUDGET, cpuAt: () => 14 });
  expect(b.dr.changes).toBe(0);
});

test('without a GPU timer, a step up that brings late frames back is undone and tried again later, not every second', () => {
  const frameAt = (s) => (s > 0.75 ? 2 * BUDGET : BUDGET);   // 0.7 holds, 0.8 does not
  const { scales } = run(null, 120, { noTimer: true, frameAt, cpuAt: () => 4 });
  const ups = []; for (let i = 1; i < scales.length; i++) if (scales[i] > scales[i - 1]) ups.push(i / 60);
  expect(ups.length).toBeLessThanOrEqual(8);   // probes back off: 3, 6, 12, 24, 48, 64 windows of half a second
  expect(ups[ups.length - 1] - ups[ups.length - 2]).toBeGreaterThan(20);   // by the end, one try every half minute
  expect(scales[scales.length - 1]).toBeLessThanOrEqual(0.8);
});
