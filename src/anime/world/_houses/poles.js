// [v3:foundation] First-look utility poles + sagging wires on L.POLE_RUNS near the hero (town owns the real ones:
// crossarms, insulators, transformers, streetlights, service drops). Concrete poles 11 m, a crossarm with three
// power lines, a lower telecom cable, a pole transformer on every third pole.
import * as THREE from 'three';

export function buildPoles(ctx, { centre, radius = 420 } = {}) {
  const L = ctx.L, k = ctx.kit(null);
  const g = new THREE.Group(); g.name = 'klc-poles';
  const concrete = ctx.mat.toon('#c4c2ba', { paint: 0.06 }), dark = ctx.mat.toon('#5b5f66'), trans = ctx.mat.toon('#9ea4aa'), band = ctx.mat.toon('#e8c547');
  const kit = ctx.kit(g);
  let n = 0;
  const top = [];
  for (const run of L.POLE_RUNS) {
    const pts = run.pts.filter((p) => Math.hypot(p[0] - centre.x, p[1] - centre.z) < radius);
    if (pts.length < 2) continue;
    const poles = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const y = L.heightAt(x, z);
      const a = pts[Math.min(pts.length - 1, i + 1)], b = pts[Math.max(0, i - 1)];
      const ang = Math.atan2(a[0] - b[0], a[1] - b[1]);
      const H = 10.8 + ((i * 7 + n) % 3) * 0.3;
      kit.cyl(0.13, 0.17, H, concrete, [x, y + H / 2 - 0.3, z], [0, 0, 0], 8);
      kit.cyl(0.175, 0.175, 1.6, band, [x, y + 0.9, z], [0, 0, 0], 8);      // yellow-black guard sleeve band
      const arm = kit.group([x, y + H - 0.55, z], ang + Math.PI / 2);
      ctx.kit(arm).box(1.9, 0.12, 0.12, dark, [0, 0, 0]);
      if (i % 3 === 1) kit.cyl(0.28, 0.28, 0.9, trans, [x + Math.sin(ang + Math.PI / 2) * 0.45, y + H - 2.1, z + Math.cos(ang + Math.PI / 2) * 0.45], [0, 0, 0], 10);
      poles.push({ x, y, z, H, ang });
      n++;
    }
    for (let i = 1; i < poles.length; i++) {
      const p = poles[i - 1], q = poles[i];
      const span = Math.hypot(q.x - p.x, q.z - p.z);
      if (span > 48) continue;
      for (const o of [-0.8, 0, 0.8]) {
        const pa = [p.x + Math.sin(p.ang + Math.PI / 2) * o, p.y + p.H - 0.47, p.z + Math.cos(p.ang + Math.PI / 2) * o];
        const qa = [q.x + Math.sin(q.ang + Math.PI / 2) * o, q.y + q.H - 0.47, q.z + Math.cos(q.ang + Math.PI / 2) * o];
        ctx.wires.add(ctx.geo.catenary(pa, qa, 0.35 + span * 0.012, 14), { width: 0.022, color: '#3a3346' });
      }
      ctx.wires.add(ctx.geo.catenary([p.x, p.y + 7.4, p.z], [q.x, q.y + 7.4, q.z], 0.55 + span * 0.018, 14), { width: 0.035, color: '#34303a' });
      ctx.wires.add(ctx.geo.catenary([p.x, p.y + 6.9, p.z], [q.x, q.y + 6.9, q.z], 0.7 + span * 0.02, 14), { width: 0.028, color: '#403a48' });
    }
    top.push(...poles);
  }
  ctx.addStatic(g);
  return { count: n, poles: top };
}
