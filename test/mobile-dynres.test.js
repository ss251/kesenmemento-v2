// [mobile-perf] core/dynres.js, the first frames: settle behind the title, start at the held scale, and never judge the GPU by frames the
// main thread held up. Safari has no GPU timer, so these run the frame-pacing path (gpu: null).
import { test, expect, describe } from 'bun:test';
import { createDynRes, readHeld, writeHeld } from '../src/anime/core/dynres.js';
import { PHONE } from '../src/anime/core/tier.js';

const B = 1000 / 60;
/** `secs` of frames: frameAt(scale, t) -> ms between drawn frames; o.lagAt / o.cpuAt per frame. -> scales per frame */
function drive(dr, secs, frameAt, o = {}) {
  const out = [];
  for (let i = 0; i < secs * 60; i++) {
    const t = i / 60;
    dr.sample({ gpu: null, frame: frameAt(dr.scale, t), cpu: o.cpuAt ? o.cpuAt(t) : 4, lag: o.lagAt ? o.lagAt(t) : 0.5 });
    out.push(dr.scale);
  }
  return out;
}

test('start: the controller begins at the scale it is given (rounded to a step, inside min..max)', () => {
  expect(createDynRes({ start: 0.7 }).scale).toBeCloseTo(0.7, 6);
  expect(createDynRes({ start: 0.73 }).scale).toBeCloseTo(0.7, 6);
  expect(createDynRes({ start: 0.2 }).scale).toBeCloseTo(0.6, 6);
  expect(createDynRes({ start: null }).scale).toBe(1);
  expect(createDynRes({ start: NaN }).scale).toBe(1);
});

test('settling behind the title finds the scale the device holds within ~3 s, and does not shimmer around it', () => {
  // the GPU makes its vsyncs at 0.8 and below, not at 0.9 or 1.0 (Safari: the frames come two vsyncs apart)
  const frameAt = (s) => (s > 0.85 ? 2 * B : B);
  const dr = createDynRes();
  dr.settle(true);
  const scales = drive(dr, 6, frameAt);
  expect(scales[3 * 60]).toBeCloseTo(0.8, 6);
  // after it found 0.8 it never probes 0.9 again while settling
  const after = scales.slice(3 * 60);
  expect(Math.max(...after)).toBeCloseTo(0.8, 6);
  expect(new Set(after.map((s) => s.toFixed(2))).size).toBe(1);
});

test('settling from a low held scale climbs to full resolution quickly when the device can (one clean window a step)', () => {
  const dr = createDynRes({ start: 0.6 });
  dr.settle(true);
  const scales = drive(dr, 4, () => B);
  // 20 warm frames, then a step every half second: 0.6 -> 1.0 in four steps
  expect(scales[scales.length - 1]).toBe(1);
  const t1 = scales.findIndex((s) => s === 1) / 60;
  expect(t1).toBeLessThan(2.8);
});

test('the first frames after the load (uploads, first programs) are not judged while settling', () => {
  // the first 18 frames are late (the load's leftovers), then every frame makes its vsync at full resolution
  const dr = createDynRes();
  dr.settle(true);
  const scales = drive(dr, 5, (s, t) => (t < 0.3 ? 3 * B : B));
  expect(scales.every((s) => s === 1)).toBe(true);
  expect(dr.changes).toBe(0);
});

test('a frame the main thread held up (late rAF callback) is not counted against the GPU', () => {
  // every 4th frame is late because a long task ran before its callback (lag 9 ms); the GPU itself keeps up
  const dr = createDynRes();
  drive(dr, 20, (s, t) => (Math.round(t * 60) % 4 === 0 ? 2 * B : B), { lagAt: (t) => (Math.round(t * 60) % 4 === 0 ? 9 : 0.5) });
  expect(dr.scale).toBe(1);
  expect(dr.changes).toBe(0);
  // the same late frames with callbacks on time are the GPU's: the scale comes down
  const g = createDynRes();
  drive(g, 20, (s, t) => (s > 0.85 && Math.round(t * 60) % 4 === 0 ? 2 * B : B));
  expect(g.scale).toBeLessThan(1);
});

test('a browser whose callbacks always start late (a steady lag) still has its GPU-late frames counted', () => {
  // every callback starts 8 ms after its timestamp (the browser's clock, not a hold-up); the GPU misses every vsync above 0.85
  const dr = createDynRes();
  drive(dr, 20, (s) => (s > 0.85 ? 2 * B : B), { lagAt: () => 8 });
  expect(dr.scale).toBeLessThanOrEqual(0.8);
});

test('after the title the normal controller keeps the settled scale and starts with a fresh back-off', () => {
  const frameAt = (s) => (s > 0.75 ? 2 * B : B);   // 0.7 holds
  const dr = createDynRes();
  dr.settle(true);
  drive(dr, 6, frameAt);
  expect(dr.scale).toBeCloseTo(0.7, 6);
  dr.settle(false);
  expect(dr.settling).toBe(false);
  const scales = drive(dr, 10, frameAt);
  // the first probe up comes after the normal hold (4 clean windows: 2 s), not at once
  const firstUp = scales.findIndex((s) => s > 0.75);
  expect(firstUp === -1 || firstUp / 60 >= 1.9).toBe(true);
  expect(scales[scales.length - 1]).toBeCloseTo(0.7, 6);
});

test('the held scale round-trips through a store; a stale, broken or out-of-range one is ignored', () => {
  const m = new Map(), store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  expect(readHeld(store)).toBe(null);
  expect(writeHeld(store, 0.7, 'klc.dr', 1000)).toBe(true);
  expect(readHeld(store, 'klc.dr', { now: 2000 })).toBeCloseTo(0.7, 6);
  expect(readHeld(store, 'klc.dr', { now: 1000 + 31 * 864e5 })).toBe(null);
  m.set('klc.dr', '{"s":0.2,"t":1000}'); expect(readHeld(store, 'klc.dr', { now: 2000 })).toBe(null);
  m.set('klc.dr', 'not json'); expect(readHeld(store, 'klc.dr', { now: 2000 })).toBe(null);
  const broken = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('quota'); } };
  expect(readHeld(broken)).toBe(null);
  expect(writeHeld(broken, 0.8)).toBe(false);
  expect(readHeld(null)).toBe(null);
});

test('a phone with GPU room climbs above its tier ratio, up to max (1.2), and only one step a window', () => {
  const dr = createDynRes({ max: 1.2, start: 1 });
  expect(dr.scale).toBe(1);
  dr.settle(true);
  const scales = drive(dr, 4, () => B);
  expect(scales[scales.length - 1]).toBeCloseTo(1.2, 6);
  for (let i = 1; i < scales.length; i++) expect(scales[i] - scales[i - 1]).toBeLessThan(0.1 + 1e-6);
  // a GPU that holds 1.0 but not 1.1 stays at 1.0 behind the title
  const g = createDynRes({ max: 1.2, start: 1 });
  g.settle(true);
  const s2 = drive(g, 6, (s) => (s > 1.05 ? 2 * B : B));
  expect(s2[s2.length - 1]).toBe(1);
});

describe('the adaptive floor (a phone: softMin 1.0 = 1.5x, min 0.85 = 1.275x)', () => {
  test('the tier: the second floor is at least 1.25x and a whole number of steps under the soft floor (no 1 % resize at the end)', () => {
    expect(PHONE.drFloor * PHONE.pixelRatio).toBeGreaterThanOrEqual(1.25);
    const k = (PHONE.drMin - PHONE.drFloor) / PHONE.drStep; expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
  });
  const opts = { min: PHONE.drFloor, max: 1.3, step: 0.05, softMin: 1, slowMs: 38, okMs: 33, span: 2000, start: 1 };
  // frames at a given interval, the scale per frame; `frameAt(scale, t)` in ms (Safari: no GPU timer)
  const run2 = (dr, secs, frameAt) => { const out = []; let t = 0; while (t < secs * 1000) { const f = frameAt(dr.scale, t); dr.sample({ gpu: null, frame: f, cpu: 4, lag: 0.5 }); t += f; out.push([t, dr.scale]); } return out; };
  test('holds 1.5x while frames are late for 60 Hz but under 33 ms (a 30-40 fps phone keeps its sharpness)', () => {
    const dr = createDynRes(opts);
    const s = run2(dr, 30, () => 25);
    expect(dr.scale).toBe(1); expect(Math.min(...s.map((x) => x[1]))).toBe(1);
  });
  test('a sustained slow stretch (median > 38 ms) steps down one 0.05 at a time, at least 2 s apart, and never below the second floor', () => {
    const dr = createDynRes(opts);
    const s = run2(dr, 40, (sc) => 10 + 45 * sc * sc);   // 55 ms at 1.0, 42.5 at 0.9, 41.8 at 0.85 ... always past 38: down to the floor
    const ch = []; for (let i = 1; i < s.length; i++) if (s[i][1] !== s[i - 1][1]) ch.push(s[i]);
    expect(dr.scale).toBeCloseTo(0.85, 6);
    expect(Math.min(...s.map((x) => x[1]))).toBeCloseTo(0.85, 6);
    for (let i = 1; i < ch.length; i++) expect(ch[i][0] - ch[i - 1][0]).toBeGreaterThanOrEqual(2000);
    for (let i = 0; i < ch.length; i++) expect((i ? ch[i - 1][1] : 1) - ch[i][1]).toBeLessThanOrEqual(0.05 + 1e-6);
  });
  test('between okMs and slowMs it holds where it is (no flapping), and at or under okMs it climbs back to 1.5x, then the 60 Hz controller takes over', () => {
    const dr = createDynRes({ ...opts, start: 0.9 });
    // 35 ms at 0.9: in the band
    run2(dr, 20, () => 35);
    expect(dr.scale).toBeCloseTo(0.9, 6); expect(dr.changes).toBe(0);
    // the phone cools down: 20 ms frames (on time for 60 Hz): back to 1.0 by the slow rule, then up past it by clean windows
    const s = run2(dr, 30, () => 16.7);
    expect(s.some((x) => x[1] === 1)).toBe(true);
    expect(dr.scale).toBeGreaterThan(1);
  });
  test('without softMin (desktop, a lite boot) nothing changes: the 60 Hz controller can go to min', () => {
    const dr = createDynRes({ min: 0.6, max: 1, step: 0.1 });
    run2(dr, 20, () => 33.4);
    expect(dr.scale).toBeLessThan(1);
  });
});
