// [perf] The frame profiler behind ?perf=1 (tools/perf/run.mjs reads it). Off by default: every call is a no-op then.
//
// Per rendered frame it records the requestAnimationFrame timestamp, the CPU time of the frame split by system (the main
// loop's sections, every ctx.onUpdate function by its module, and the systems the harness wraps: streaming, batching,
// labels, HUD ...), the GPU time of the frame (core/gputimer.js, where the browser has the timer query), draw calls,
// triangles, the JS heap (Chrome) and the simulation steps run. Long tasks come from a PerformanceObserver.
//
//   const perf = createPerf({ on: params.get('perf') === '1', gpuTimer: !!timer })
//   perf.frame(now)  perf.section('render')  perf.enter(bucket) / perf.leave()  perf.gpu(perf.index() at the query's start, ms)  perf.frameEnd(info, scale)
//   window.__perf = perf.api: start() / stop() -> the recorded frames, wrap(obj, method, bucket), bucket(name)
//
// Times are self times: a wrapped function inside an update counts for its own bucket, not twice.

const NOOP = () => {};

/** The bucket of a ctx.onUpdate function: its module (main.js tags fn.__mod while a module builds), and for explore which of its updates. */
export function updateLabel(fn) {
  const m = fn.__mod || 'main';
  if (m === 'explore') {
    const s = Function.prototype.toString.call(fn);
    if (/stream\.update|stream\.sb\.cull/.test(s)) return 'explore:stream';
    if (/labels\??\.update|ui\??\.update/.test(s)) return 'explore:labels+ui';
    if (/engine\(dt\)/.test(s)) return 'explore:drive';
  }
  return 'upd:' + m;
}

export function createPerf({ on = false, gpuTimer = false, cap = 24000, maxBuckets = 64 } = {}) {
  if (!on) {
    return { on: false, frame: NOOP, section: NOOP, enter: NOOP, leave: NOOP, gpu: NOOP, index: () => -1, frameEnd: NOOP, bucket: () => 0, steps: NOOP, api: null };
  }
  const now = () => performance.now();
  const names = [];
  const index = new Map();
  function bucket(name) {
    let i = index.get(name);
    if (i === undefined) {
      if (names.length >= maxBuckets) return bucket('other');
      i = names.length; names.push(name); index.set(name, i);
    }
    return i;
  }
  const OTHER = bucket('other');
  // per-frame records (typed arrays: no garbage while recording)
  const T = new Float64Array(cap), CB = new Float64Array(cap), CPU = new Float32Array(cap), GPU = new Float32Array(cap).fill(NaN);
  const CALLS = new Int32Array(cap), TRIS = new Int32Array(cap), HEAP = new Float32Array(cap).fill(NaN), STEPS = new Int16Array(cap), SCALE = new Float32Array(cap);
  const B = new Float32Array(cap * maxBuckets);
  const acc = new Float64Array(maxBuckets);
  let n = 0, recording = false, frameT0 = 0, cur = OTHER, t0 = 0, depth = 0, stepsNow = 0;
  const stack = new Int32Array(64);
  const longtasks = [];
  try {
    const po = new PerformanceObserver((list) => { if (!recording) return; for (const e of list.getEntries()) longtasks.push([Math.round(e.startTime * 10) / 10, Math.round(e.duration * 10) / 10]); });
    po.observe({ type: 'longtask', buffered: false });
  } catch (e) { /* no long task timing (WebKit) */ }
  const mem = typeof performance !== 'undefined' && performance.memory ? performance.memory : null;

  // ---- GPU time: main.js runs the frame's timer query (core/gputimer.js, shared with the dynamic resolution) and hands each result back
  // here with the index of the frame that issued it
  function gpu(tag, ms) { if (tag >= 0 && tag < cap) GPU[tag] = ms; }
  function frameIndex() { return recording && n < cap ? n : -1; }

  function frame(ts) {
    if (!recording) return;
    frameT0 = now(); t0 = frameT0; cur = OTHER; depth = 0; stepsNow = 0;
    acc.fill(0);
    if (n < cap) { T[n] = ts; CB[n] = frameT0; }
  }
  function section(name) {
    if (!recording) return;
    const t = now(); acc[cur] += t - t0; t0 = t; cur = typeof name === 'number' ? name : bucket(name); depth = 0;
  }
  function enter(b) {
    if (!recording) return;
    const t = now(); acc[cur] += t - t0; t0 = t; stack[depth++] = cur; cur = b;
  }
  function leave() {
    if (!recording || depth <= 0) return;
    const t = now(); acc[cur] += t - t0; t0 = t; cur = stack[--depth];
  }
  function steps(k) { stepsNow += k; }
  function frameEnd(info, scale = 1) {
    if (!recording) return;
    const t = now(); acc[cur] += t - t0;
    if (n < cap) {
      CPU[n] = t - frameT0;
      for (let i = 0; i < names.length; i++) B[n * maxBuckets + i] = acc[i];
      if (info) { CALLS[n] = info.render.calls; TRIS[n] = info.render.triangles; }
      if (mem) HEAP[n] = mem.usedJSHeapSize / 1048576;
      STEPS[n] = stepsNow; SCALE[n] = scale;
      n++;
    }
  }

  /** Time every call of obj[method] in its own bucket (the harness wraps streaming, batching, labels ...). */
  function wrap(obj, method, name) {
    if (!obj || typeof obj[method] !== 'function' || obj[method].__perf) return false;
    const fn = obj[method], b = bucket(name);
    const w = function (...a) { enter(b); try { return fn.apply(this, a); } finally { leave(); } };
    w.__perf = true; obj[method] = w;
    return true;
  }

  const api = {
    get recording() { return recording; },
    gpuTimer: !!gpuTimer,
    bucket, wrap,
    start() { n = 0; longtasks.length = 0; GPU.fill(NaN); HEAP.fill(NaN); recording = true; return true; },
    /** Stop and return the frames: arrays (rounded to 0.01 ms) by field, the buckets by name. */
    stop() {
      recording = false;
      const r2 = (v) => Math.round(v * 100) / 100;
      const out = { n, gpuTimer: !!gpuTimer, names: names.slice(), t: [], cb: [], cpu: [], gpu: [], calls: [], tris: [], heap: [], steps: [], scale: [], buckets: {}, longtasks: longtasks.slice() };
      for (let i = 0; i < n; i++) {
        out.t.push(r2(T[i])); out.cb.push(r2(CB[i])); out.cpu.push(r2(CPU[i])); out.gpu.push(Number.isNaN(GPU[i]) ? null : r2(GPU[i]));
        out.calls.push(CALLS[i]); out.tris.push(TRIS[i]); out.heap.push(Number.isNaN(HEAP[i]) ? null : Math.round(HEAP[i] * 1000) / 1000); out.steps.push(STEPS[i]); out.scale.push(Math.round(SCALE[i] * 100) / 100);
      }
      for (let b = 0; b < names.length; b++) {
        const col = new Array(n); let any = false;
        for (let i = 0; i < n; i++) { const v = B[i * maxBuckets + b]; col[i] = r2(v); if (v) any = true; }
        if (any) out.buckets[names[b]] = col;
      }
      return out;
    },
  };
  return { on: true, frame, section, enter, leave, gpu, index: frameIndex, frameEnd, bucket, steps, api };
}
