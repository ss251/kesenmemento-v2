// [v3:life] Street furniture that exists to carry light: promenade lanterns along the seawall and LED street lamps
// beside the hero streets. Built only when no other package registered lamps there (the town package owns the
// utility poles, and may hang its own lamps on them through lights(ctx).streetlight()); otherwise this adds nothing.
//
//   buildLamps(ctx, paths, { force })  ->  { promenade, street, skipped }
import * as THREE from 'three';
import { lights } from './lights.js';

export function buildLamps(ctx, P, o = {}) {
  const L = ctx.L, reg = lights(ctx);
  const Z = L.ZONES.hero;
  const already = reg.pools.filter((p) => Math.hypot(p.x - Z.cx, p.z - Z.cz) < Z.r).length;
  const out = { promenade: 0, street: 0, skipped: false, already, posts: [] };
  if (!o.force && already > 40) { out.skipped = true; return out; }
  const k = ctx.kit(ctx.staticRoot);
  const post = ctx.mat.toon('#4a5068', { paint: 0.03 });
  const postLight = ctx.mat.toon('#8f96a6', { paint: 0.03 });
  const cap = ctx.mat.toon('#3f4458', {});
  const shade = reg.lampMaterial('#ece6da', '#ffd9a0', 1.7);
  const led = reg.lampMaterial('#dfe3ea', '#fff1dc', 1.8);
  const G = new THREE.Group(); G.name = 'life:lamps'; ctx.addStatic(G);
  const kit = ctx.kit(G);
  const physics = ctx.physics;

  // ---- 1. seawall promenade: short cast-iron lanterns (港の街灯), every ~24 m, set back from the water
  const avoid = [];
  const clear = (x, z, r) => avoid.every((a) => Math.hypot(a[0] - x, a[1] - z) > r);
  for (const prom of P.paths.filter((p) => p.kind === 'promenade')) {
    const pos = {};
    for (let s = 6; s < prom.len - 4; s += 24) {
      P.at(prom, s, pos);
      // stand on the land side of the path
      let nx = pos.dz, nz = -pos.dx;
      if (L.isWater(pos.x + nx * 3, pos.z + nz * 3)) { nx = -nx; nz = -nz; }
      const x = pos.x + nx * 1.9, z = pos.z + nz * 1.9;
      if (L.isWater(x, z) || P.blocked(x, z)) continue;
      const y = physics.groundHeight(x, z, Math.max(L.heightAt(x, z), (prom.top ?? 0) - 0.3) + 0.6);
      const g = kit.group([x, y, z], Math.atan2(nx, nz));
      const gk = ctx.kit(g);
      gk.cyl(0.16, 0.2, 0.35, cap, [0, 0.175, 0], null, 10);
      gk.cyl(0.055, 0.075, 3.1, post, [0, 1.9, 0], null, 8);
      gk.cyl(0.11, 0.08, 0.14, cap, [0, 3.48, 0], null, 10);
      gk.cyl(0.2, 0.13, 0.46, shade, [0, 3.78, 0], null, 12);      // glowing glass
      gk.cyl(0.26, 0.2, 0.08, cap, [0, 4.05, 0], null, 12);
      gk.cyl(0.02, 0.06, 0.16, cap, [0, 4.17, 0], null, 6);
      physics.addCylinder(x, z, 0.12, y, y + 4.2);
      reg.lantern({ x, y: y + 3.78, z, color: '#ffd9a0', size: 0.55, intensity: 1.9 });
      reg.streetlight({ x, y: y + 3.9, z, groundY: y, color: '#ffd3a0', size: 0.01, intensity: 0.0, poolR: 5.5, lightI: 9, lightDist: 14 });
      avoid.push([x, z]); out.posts.push([x, z]); out.promenade++;
    }
  }

  // ---- 2. LED street lamps beside the hero streets (one side, ~34 m apart), arm over the road
  const pos = {};
  for (const p of P.paths) {
    if (p.kind === 'promenade' || !p.road) continue;
    const road = L.roadById?.(p.road);
    for (let s = 8; s < p.len - 6; s += 34) {
      P.at(p, s, pos);
      if (!clear(pos.x, pos.z, 14)) continue;
      // the road is on the other side of the sidewalk offset: find it by the road's nearest point
      let rx = 0, rz = 0, best = 1e9;
      if (road) for (const [qx, qz] of road.pts) { const d = Math.hypot(qx - pos.x, qz - pos.z); if (d < best) { best = d; rx = qx; rz = qz; } }
      let ax = rx - pos.x, az = rz - pos.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      const x = pos.x + ax * 0.8, z = pos.z + az * 0.8;            // at the curb
      if (P.blocked(x - ax * 0.4, z - az * 0.4)) continue;
      const y = physics.groundHeight(x, z, L.heightAt(x, z) + 0.6);
      const rotY = Math.atan2(ax, az);
      const g = kit.group([x, y, z], rotY);
      const gk = ctx.kit(g);
      gk.cyl(0.07, 0.09, 6.4, postLight, [0, 3.2, 0], null, 8);
      // curved arm reaching over the road (+Z local)
      const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 6.3, 0), new THREE.Vector3(0, 7.1, 0.3), new THREE.Vector3(0, 6.95, 1.5)), 8, 0.045, 6, false);
      gk.mesh(arm, postLight);
      gk.box(0.26, 0.09, 0.62, postLight, [0, 6.92, 1.62]);
      gk.box(0.2, 0.02, 0.5, led, [0, 6.865, 1.62]);
      physics.addCylinder(x, z, 0.1, y, y + 6.4);
      const lx = x + ax * 1.62, lz = z + az * 1.62;
      reg.streetlight({ x: lx, y: y + 6.82, z: lz, groundY: L.heightAt(lx, lz), color: '#fff0da', size: 0.5, intensity: 1.8, poolR: 8.5, lightI: 16, lightDist: 20 });
      avoid.push([x, z]); out.posts.push([x, z]); out.street++;
    }
  }
  // ---- 3. beyond the hero zone: lamp heads only (no posts; seen from afar they are the chains of street lights
  //         that draw the town's roads at night). Wide roads get sodium-warm pools, small roads white LED dots.
  if (o.far !== false) {
    const M = L.ZONES.mid, heroR = Z.r * (ctx.quality?.heroR ?? 1);
    const q = ctx.quality?.name || 'high';
    const step = { high: 42, medium: 56, low: 80 }[q] ?? 50;
    let n = 0;
    for (const r of L.ROADS) {
      if (r.zone === 'hero' || r.kind === 'alley' || r.pts.length < 2) continue;
      const main = r.kind === 'national' || r.kind === 'prefectural' || r.kind === 'bridge';
      if (r.zone === 'far' && !main) continue;
      let acc = step * 0.5;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
        const l = Math.hypot(bx - ax, bz - az); if (!l) continue;
        const nx = (bz - az) / l, nz = -(bx - ax) / l, off = (r.width || 5) / 2 + 0.4;
        for (; acc <= l; acc += step) {
          const u = acc / l, side = (n % 2 ? 1 : -1);
          const x = ax + (bx - ax) * u + nx * off * side, z = az + (bz - az) * u + nz * off * side;
          const dc = Math.hypot(x - Z.cx, z - Z.cz);
          if (dc < heroR + 10 || L.isWater(x, z)) continue;
          if (r.zone === 'far' && Math.hypot(x - M.cx, z - M.cz) > M.r * 2.2) continue;
          const gy = L.heightAt(x, z);
          if (main) reg.streetlight({ x: x - nx * side * 1.4, y: gy + 7.2, z: z - nz * side * 1.4, groundY: gy, color: '#ffc885', size: 0.55, intensity: 2.0, poolR: 9, real: false, minPx: 1.6 });
          else reg.point({ x: x - nx * side * 1.2, y: gy + 6.6, z: z - nz * side * 1.2, color: '#f3f1ff', size: 0.42, intensity: 1.7, mode: 'lamps', minPx: 1.4 });
          n++;
        }
        acc -= l;
      }
    }
    out.far = n;
  }
  return out;
}
