// [perf] GPU time per render pass (tools/perf/run.mjs --passes 1): a timer query around every renderer.render call, named by its target
// (the outline pre-pass, the colour pass, the bloom chain, the composite), and the shadow map apart from the colour pass it runs inside.
// The page must run with ?gputimer=0 (one query at a time: the app's own frame query is off). window.__passes.start() / .stop() ->
// { frames, ms: { pass: mean ms per frame } }.
(() => {
  if (window.__passes) return 'again';
  const ctx = window.__ctx, r = ctx.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return 'no timer query';
  const pool = [], pending = [], sum = {};
  let active = null, on = false, frames = 0;
  const begin = (name) => { if (!on || active) return; const q = pool.pop() || gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = { q, name }; };
  const end = () => { if (!active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; };
  const poll = () => {
    if (!pending.length) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (pending.length) { const p = pending[0]; if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break; const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT); pending.shift(); pool.push(p.q); if (!disjoint) sum[p.name] = (sum[p.name] || 0) + ns / 1e6; }
  };
  const T = ctx.pipeline.targets, rr = r.render.bind(r);
  r.render = function (scene, camera) {
    const rt = r.getRenderTarget();
    const name = rt === T.rtND ? 'outline pre-pass' : rt === T.rtColor ? 'colour' : rt === null ? 'composite' : 'bloom';
    begin(name); try { return rr(scene, camera); } finally { end(); }
  };
  const sm = r.shadowMap, sr = sm.render.bind(sm);
  sm.render = function (...a) { const outer = active?.name; if (active) end(); begin('shadow'); try { return sr(...a); } finally { end(); if (outer) begin(outer); } };
  const tick = () => { if (on) { frames++; poll(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__passes = {
    start() { for (const k in sum) delete sum[k]; frames = 0; on = true; return 1; },
    stop() { on = false; poll(); const ms = {}; for (const [k, v] of Object.entries(sum)) ms[k] = Math.round(v / Math.max(1, frames) * 100) / 100; return { frames, ms }; },
  };
  return 'ok';
})();
