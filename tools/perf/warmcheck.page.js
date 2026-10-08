// [perf] Does a stream pool's compileAsync make the program its first real draw uses? Wraps renderer.compileAsync: records the program
// key each compile made, then (after the pool has been drawn) the key the material ended up with; returns the mismatches and where the two
// keys differ (window.__warmcheck.report()).
(() => {
  if (window.__warmcheck) return 'again';
  const r = window.__ctx.renderer, P = r.properties, seen = [];
  const c0 = r.compileAsync.bind(r);
  r.compileAsync = (obj, cam, scene) => {
    const pr = c0(obj, cam, scene);
    const mats = []; obj.traverse((o) => { const m = o.material; for (const x of Array.isArray(m) ? m : m ? [m] : []) mats.push(x); });
    for (const m of mats) seen.push({ m, name: obj.name, key: P.get(m).currentProgram?.cacheKey || null });
    return pr;
  };
  window.__warmcheck = {
    report() {
      const out = [];
      for (const s of seen) {
        const now = P.get(s.m).currentProgram?.cacheKey || null;
        if (now === s.key) { out.push({ name: s.name, same: true }); continue; }
        const a = (s.key || '').split(','), b = (now || '').split(',');
        const diff = []; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push(i + ':' + a[i] + '->' + b[i]);
        out.push({ name: s.name, same: false, diff: diff.slice(0, 8) });
      }
      return JSON.stringify({ compiled: seen.length, same: out.filter((x) => x.same).length, mismatches: out.filter((x) => !x.same).slice(0, 10) });
    },
  };
  return 'ok';
})();
