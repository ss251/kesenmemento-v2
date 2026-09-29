// [v3:fix] Spring cherry trees (ソメイヨシノ) at the hero stops: a row along the 内湾 promenade lawn, a pair framing the
// 浮見堂 walkway and its sea-side torii, and a few at the Pier 7 end of the inner bay. Real Sakura-grade trees (ported
// from Sakuragaoka Station's sakura module, MIT: bark tubes, banded blossom masses, petal cards) instead of pink paint on
// broadleaf crowns. They are the spring face of the town: shown while ctx.shared.uSeason says spring (> 0.5), hidden in
// the other seasons (ctx.add, never merged, so the toggle is one visibility flag per cluster).
import * as THREE from 'three';
import { createSakuraTextures } from './textures.js';
import { createSakuraMaterials } from './materials.js';
import { makeTree } from './tree.js';
import { createNoise } from './util.js';

/** where: [{ id, x, z, lod?, lean?: [x, z], big? }] world positions of trunks. */
export function buildCherries(ctx, where, opts = {}) {
  const L = ctx.L, H = L.heightAt;
  const lots = (L.LOTS || []).filter((l) => l.zone === 'hero');
  const inLot = (x, z, pad) => lots.some((l) => { const o = l.obb, dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), s = Math.sin(o.rotY); const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < o.w / 2 + pad && Math.abs(lz) < o.d / 2 + pad; });
  const roads = (L.ROADS || []).filter((r) => r.zone === 'hero');
  const onRoad = (x, z) => roads.some((rd) => { for (let i = 1; i < rd.pts.length; i++) { const [ax, az] = rd.pts[i - 1], [bx, bz] = rd.pts[i]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < (rd.width || 6) / 2 + 0.6) return true; } return false; });
  const ok = (p) => !L.isWater(p.x, p.z) && (L.shoreDist ? L.shoreDist(p.x, p.z) < -1.5 : true) && !inLot(p.x, p.z, 1.2) && !onRoad(p.x, p.z);
  const specs = [];
  const R = ctx.rng('kesennuma-cherry');
  const jit = (a) => (R() - 0.5) * 2 * a;
  for (const p of where) {
    if (!ok(p)) continue;
    const big = !!p.big, lean = p.lean || [0, 0];
    specs.push({
      id: p.id, kind: big ? 'old' : 'medium', lod: p.lod ?? 1, bark: 'old', seed: 'kcherry-' + p.id,
      x: p.x, z: p.z, height: (big ? 9.0 : 7.4) + jit(0.5), spread: (big ? 5.4 : 4.0) + jit(0.3), spreadZ: (big ? 4.8 : 3.6) + jit(0.3), vr: big ? 0.5 : 0.54,
      trunkR: big ? 0.36 : 0.27, forkH: big ? 2.5 : 2.25, lean: [lean[0] + jit(0.15), lean[1] + jit(0.15)], offset: [lean[0] * 1.6 + jit(0.3), lean[1] * 1.6 + jit(0.3)],
      limbs: big ? 5 : 4, padR: big ? 1.2 : 1.12, rootReach: big ? 0.95 : 0.7, gnarl: big ? 0.15 : undefined, limbArch: big ? 0.22 : undefined, lobes: big ? 0.2 : undefined,
      floorAt: (x, z) => H(x, z) + 2.7,
    });
  }
  if (!specs.length) return { trees: 0 };
  // built lazily the first time spring starts blending in (they cost ~1 s of load for a season the demo opens in
  // autumn); the build runs inside the frame update, so a shot that switches to spring still renders them at once
  const stats = { trees: 0, tris: 0, specs: specs.length, built: false };
  let root = null;
  const build = () => {
    const T = createSakuraTextures(ctx);
    const M = createSakuraMaterials(ctx, T);
    const env = { rng: ctx.rng, noise: createNoise(ctx.rng('kcherry-noise')), heightAt: H };
    root = new THREE.Group(); root.name = 'cherries';
    const blobs = new Map();
    for (const spec of specs) {
      let t; try { t = makeTree(spec, env); } catch (e) { console.warn('[cherry] tree failed', spec.id, e); continue; }
      const bg = t.bark.build(false);
      if (bg) { const m = new THREE.Mesh(bg, M.barkOld); m.castShadow = true; m.receiveShadow = true; root.add(m); }
      const blob = t.blob.build(true);
      if (blob) { const key = spec.id.split('-')[0]; (blobs.get(key) || blobs.set(key, []).get(key)).push(blob); }
      const cg = t.cards.build(true);
      if (cg) { const m = new THREE.Mesh(cg, M.cards); m.castShadow = true; ctx.noOutline(m); root.add(m); }
      stats.trees++; stats.tris += t.bark.tris + t.blob.tris + t.cards.tris;
    }
    for (const [key, list] of blobs) {
      const geo = list.length > 1 ? ctx.geo.mergeGeometries(list, false) : list[0];
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, M.blob); m.name = 'cherry-mass-' + key; m.castShadow = true; m.customDepthMaterial = M.blobDepth;
      root.add(m);
    }
    ctx.noBatch(root);
    ctx.add(root);
    stats.built = true;
  };
  if (opts.eager) build();
  const sync = () => {
    const spring = opts.always ? 1 : (ctx.shared.uSeason?.value?.x ?? 0);
    if (!root && spring > 0.01) build();
    if (root) root.visible = spring > 0.5;
  };
  sync(); ctx.onUpdate(sync);
  return stats;
}
