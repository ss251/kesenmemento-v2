// [perf] tools/perf/stats.mjs: the numbers docs/perf/BASELINE.md and RESULTS.md are made of.
import { test, expect } from 'bun:test';
import { quantile, dist, intervals, heapEvents, summarize, HITCH } from '../tools/perf/stats.mjs';

test('quantile is the nearest-rank value', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  expect(quantile(s, 0.5)).toBe(5);
  expect(quantile(s, 0.95)).toBe(10);
  expect(quantile(s, 0.1)).toBe(1);
  expect(quantile([], 0.5)).toBeNull();
});

test('dist ignores nulls and reports mean / p50 / p95 / p99 / max', () => {
  const d = dist([16, 16, 17, null, 50]);
  expect(d.n).toBe(4);
  expect(d.mean).toBe(24.75);
  expect(d.p50).toBe(16);
  expect(d.max).toBe(50);
  expect(dist([null, null])).toBeNull();
});

test('intervals are the differences of the frame timestamps', () => {
  const iv = intervals([0, 16.7, 33.4, 83.4]);
  expect(iv.length).toBe(3);
  [16.7, 16.7, 50].forEach((v, i) => expect(iv[i]).toBeCloseTo(v, 9));
});

test('heapEvents: a drop over 0.25 MB is a collection, rises are allocation', () => {
  const heap = [10, 11, 12, 8, 9, 9.1, 9.0];
  const t = [0, 1000, 2000, 3000, 4000, 5000, 6000];
  const e = heapEvents(heap, t);
  expect(e.gcs).toBe(1);
  expect(e.frames.has(3)).toBe(true);
  expect(e.allocMBps).toBeCloseTo((1 + 1 + 1 + 0.1) / 6, 2);
});

test('summarize counts hitches against the thresholds and orders the CPU buckets', () => {
  const t = [], cpu = [], n = 61;
  for (let i = 0, x = 0; i < n; i++) { t.push(x); cpu.push(5); x += i === 30 ? 60 : i === 40 ? 120 : i === 50 ? 30 : 16.7; }
  const rec = { n, t, cb: t, cpu, gpu: new Array(n).fill(null), calls: new Array(n).fill(600), tris: new Array(n).fill(1e6), heap: new Array(n).fill(null), steps: new Array(n).fill(1), buckets: { render: new Array(n).fill(3), 'upd:life': new Array(n).fill(1.5), tiny: new Array(n).fill(0.001) }, longtasks: [[100, 70]], gpuTimer: false };
  const s = summarize(rec);
  expect(s.frames).toBe(61);
  expect(s.hitches.over25).toBe(3);
  expect(s.hitches.over33).toBe(2);
  expect(s.hitches.over50).toBe(2);
  expect(s.hitches.over100).toBe(1);
  expect(Object.keys(s.cpu.by)).toEqual(['render', 'upd:life']);   // the 0.001 ms bucket is dropped
  expect(s.gpu).toBeNull();
  expect(s.gc).toBeNull();
  expect(s.longtasks).toEqual({ n: 1, totalMs: 70, maxMs: 70 });
  expect(s.worst[0].ms).toBe(120);
  expect(HITCH.over33).toBeGreaterThan(33.34);   // one dropped frame at 60 Hz (33.3 ms) is not two
});
