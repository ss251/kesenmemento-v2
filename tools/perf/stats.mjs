// [perf] Summaries of the frames core/perf.js records (pure: test/perf-stats.test.js). Used by tools/perf/run.mjs and wk-run.mjs.
//
//   summarize(rec, { secs }) -> { frames, fps, interval: { p50, p95, p99, max, mean }, hitches: { over25, over33, over50, over100 },
//                                 cpu: { mean, p95, max, by: { bucket: { mean, p95 } } }, gpu, calls, tris, longtasks, gc, steps, worst }
//
// interval = differences of the requestAnimationFrame timestamps (what the screen got); hitch thresholds: > 25 ms (a frame dropped at
// 60 Hz), > 33.4 ms (two or more), > 50.1 ms, > 100 ms. GC is read from the JS heap per frame (Chrome with --enable-precise-memory-info):
// a drop of more than 0.25 MB between two frames is a collection, the rise between drops is allocation.

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}
const r2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export function dist(values) {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return { n: v.length, mean: r2(mean(v)), p50: r2(quantile(s, 0.5)), p95: r2(quantile(s, 0.95)), p99: r2(quantile(s, 0.99)), max: r2(s[s.length - 1]) };
}

export const HITCH = { over25: 25, over33: 33.4, over50: 50.1, over100: 100 };

export function intervals(t) {
  const out = [];
  for (let i = 1; i < t.length; i++) out.push(t[i] - t[i - 1]);
  return out;
}

/** GC events and allocation from a per-frame heap series (MB). -> { gcs, allocMBps, gcFrames: Set of frame indices } */
export function heapEvents(heap, t, dropMB = 0.25) {
  let gcs = 0, alloc = 0; const frames = new Set();
  for (let i = 1; i < heap.length; i++) {
    const a = heap[i - 1], b = heap[i];
    if (a === null || b === null) continue;
    const d = b - a;
    if (d < -dropMB) { gcs++; frames.add(i); } else if (d > 0) alloc += d;
  }
  const secs = t.length > 1 ? (t[t.length - 1] - t[0]) / 1000 : 0;
  return { gcs, allocMBps: secs > 0 ? r2(alloc / secs) : null, frames };
}

export function summarize(rec) {
  const n = rec.n;
  const iv = intervals(rec.t);
  const secs = n > 1 ? (rec.t[n - 1] - rec.t[0]) / 1000 : 0;
  const hitches = {};
  for (const [k, ms] of Object.entries(HITCH)) hitches[k] = iv.filter((x) => x > ms).length;
  const by = {};
  for (const [name, col] of Object.entries(rec.buckets || {})) {
    const d = dist(col);
    if (d && d.mean >= 0.005) by[name] = { mean: d.mean, p95: d.p95, max: d.max };
  }
  const order = Object.entries(by).sort((a, b) => b[1].mean - a[1].mean);
  const heapOk = rec.heap && rec.heap.some((h) => h !== null && h !== rec.heap[0]);
  let gc = heapOk ? heapEvents(rec.heap, rec.t) : null;
  // [perf] V8's own GC pauses from the trace (run.mjs, on the page's clock): the frame whose interval holds a pause
  let gcTrace = null;
  if (rec.gcEvents?.events) {
    const ev = rec.gcEvents.events, frames = new Set();
    let total = 0, max = 0, j = 0;
    const sorted = [...ev].sort((a, b) => a[0] - b[0]);
    for (const e of sorted) { total += e[1]; max = Math.max(max, e[1]); }
    // interval i runs from frame i-1's callback start to frame i's
    for (let i = 1; i < n; i++) {
      while (j < sorted.length && sorted[j][0] < rec.cb[i - 1]) j++;
      for (let k = j; k < sorted.length && sorted[k][0] < rec.cb[i]; k++) if (sorted[k][1] >= 1) frames.add(i);
    }
    gcTrace = { n: ev.length, totalMs: r2(total), maxMs: r2(max), frames, names: rec.gcEvents.names };
    gc = { gcs: ev.length, allocMBps: null, frames };
  }
  // the worst frames: interval, what the frame spent most on, gpu, calls, whether a GC ran
  const worst = iv.map((v, i) => [v, i + 1]).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([v, i]) => {
    let top = null, topMs = 0;
    for (const [name, col] of Object.entries(rec.buckets || {})) if (col[i] > topMs) { topMs = col[i]; top = name; }
    // the frame before the long interval did the work (the interval ends when frame i starts)
    let top0 = null, top0Ms = 0;
    for (const [name, col] of Object.entries(rec.buckets || {})) if (col[i - 1] > top0Ms) { top0Ms = col[i - 1]; top0 = name; }
    return { ms: r2(v), frame: i, cpuPrev: r2(rec.cpu[i - 1]), topPrev: top0 ? `${top0} ${r2(top0Ms)}` : null, cpu: r2(rec.cpu[i]), top: top ? `${top} ${r2(topMs)}` : null, gpuPrev: r2(rec.gpu?.[i - 1]), gc: gc ? gc.frames.has(i) || gc.frames.has(i - 1) : null, calls: rec.calls?.[i - 1] };
  });
  const lt = rec.longtasks || [];
  let gcHitches = null;
  if (gc) { gcHitches = 0; for (let i = 0; i < iv.length; i++) if (iv[i] > HITCH.over33 && (gc.frames.has(i + 1) || gc.frames.has(i))) gcHitches++; }
  const stepHist = {};
  for (const s of rec.steps || []) stepHist[s] = (stepHist[s] || 0) + 1;
  return {
    frames: n, secs: r2(secs), fps: secs > 0 ? r2((n - 1) / secs) : null,
    interval: dist(iv), hitches,
    cpu: { ...dist(rec.cpu), by: Object.fromEntries(order) },
    gpu: rec.gpuTimer ? dist(rec.gpu || []) : null,
    calls: dist(rec.calls || []), tris: dist(rec.tris || []),
    longtasks: { n: lt.length, totalMs: r2(lt.reduce((s, x) => s + x[1], 0)), maxMs: r2(lt.reduce((m, x) => Math.max(m, x[1]), 0)) },
    gc: gc ? { n: gc.gcs, allocMBps: gc.allocMBps, hitchesWithGc: gcHitches, ...(gcTrace ? { totalMs: gcTrace.totalMs, maxMs: gcTrace.maxMs, source: 'trace' } : { source: 'heap' }) } : null,
    steps: Object.keys(stepHist).length > 1 || stepHist[0] === undefined ? stepHist : null,
    worst,
  };
}

/** One Markdown row per scenario: the columns of docs/perf/BASELINE.md. */
export function mdRow(config, scenario, s, extra = {}) {
  const f = (v, d = 1) => (v === null || v === undefined ? '–' : Number(v).toFixed(d));
  const top = Object.entries(s.cpu.by || {}).slice(0, 4).map(([k, v]) => `${k} ${f(v.mean, 2)}`).join(', ');
  return `| ${config} | ${scenario} | ${f(s.fps)} | ${f(s.interval?.p50)} / ${f(s.interval?.p95)} / ${f(s.interval?.p99)} / ${f(s.interval?.max, 0)} | ${s.hitches.over25} / ${s.hitches.over33} / ${s.hitches.over50} / ${s.hitches.over100} | ${f(s.cpu.mean)} / ${f(s.cpu.p95)} | ${s.gpu ? `${f(s.gpu.p50)} / ${f(s.gpu.p95)}` : 'n/a'} | ${f(s.calls?.mean, 0)} / ${f(s.calls?.max, 0)} | ${f((s.tris?.mean || 0) / 1e6, 2)} M | ${extra.programs ?? '–'} | ${s.longtasks.n} (${f(s.longtasks.maxMs, 0)}) | ${s.gc ? `${s.gc.n} / ${f(s.gc.totalMs)} / ${f(s.gc.maxMs)} / ${s.gc.hitchesWithGc}` : 'n/a'} | ${top} |`;
}
export const MD_HEAD = '| config | scenario | fps | interval ms p50 / p95 / p99 / max | hitches >25 / >33 / >50 / >100 | CPU ms mean / p95 | GPU ms p50 / p95 | calls mean / max | tris | programs | long tasks (max ms) | GC pauses n / total ms / max ms / in hitches | top CPU (ms/frame) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
