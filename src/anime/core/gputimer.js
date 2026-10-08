// [smooth] The GPU time of a frame (EXT_disjoint_timer_query_webgl2: desktop Chrome has it, Safari does not). One TIME_ELAPSED query
// around the frame's draw calls, read back a few frames later; nothing ever waits for the GPU. The dynamic resolution (core/dynres.js)
// and the ?perf=1 profiler (core/perf.js) both read it.
//
//   const timer = createGpuTimer(gl)        null without the extension
//   timer.begin(tag); ...draw...; timer.end();
//   timer.poll((ms, tag) => ...)            every result that came back since the last poll, oldest first (none while the GPU was disjoint)

export function createGpuTimer(gl) {
  const ext = gl && typeof gl.getExtension === 'function' ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  if (!ext) return null;
  const pool = [], pending = [];
  let active = null;
  return {
    begin(tag = 0) {
      if (active) return;
      const q = pool.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = { q, tag };
    },
    end() {
      if (!active) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null;
      if (pending.length > 12) pool.push(pending.shift().q);   // results that never came back: reuse the query (its old result is dropped)
    },
    poll(fn) {
      if (!pending.length) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const p = pending[0];
        if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
        const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
        pending.shift(); pool.push(p.q);
        if (!disjoint) fn(ns / 1e6, p.tag);
      }
    },
  };
}
