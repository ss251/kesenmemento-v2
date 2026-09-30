// [v4:landmarks-A] 安波山 (239 m) as it is (harbor/real.js ANBA; docs/anime/landmarks/anbasan.md; kesennuma-kanko.jp/anbasan):
// the summit is a small grass clearing of about 25 × 25 m in the forest, open to the south (z18 photo), with the
// summit post, benches facing the bay and a stone plaque; no pavilion and no big deck (none on the photo). Below it,
// on the path from the car park: ほしのてらす (8合目, the small roof on the z17 photo) and ひのでのてらす (6合目, the OSM
// 安波山展望台 viewpoint), timber viewing terraces with rails and benches, and the footpath with log steps between them,
// lit by footlights up to the first terrace (until 22:00, yakei.jp). Returns { eye, perches, terraces, path }.
import * as THREE from 'three';
import { ANBA } from './real.js';
import { resample, sweepSlab, worldKit, seg } from './lmkit.js';
import { nightMat, registry } from './lights.js';
import { vTextTex, textTex, FONT, mapMat } from './util.js';

const C = { grass: '#93b06c', soil: '#9c8a6c', deck: '#a98464', rail: '#6d5242', post: '#8a6446', roof: '#56677a', stone: '#aaa69b', sign: '#efe6d2', ink: '#3b3740' };

export function buildAnba4(ctx) {
  const L = ctx.L, A = ANBA;
  const { k } = worldKit(ctx, 'anbasan4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = { grass: t(C.grass, { paint: 0.1 }), soil: t(C.soil, { paint: 0.1 }), deck: t(C.deck, { paint: 0.08 }), rail: t(C.rail, { paint: 0.05 }), post: t(C.post, { paint: 0.08 }), roof: t(C.roof, { paint: 0.04, side: 'double' }), stone: t(C.stone, { paint: 0.1 }) };
  const H = (x, z) => L.heightAt(x, z);
  const out = { perches: [], terraces: [] };
  const [sx, sz] = A.summit, sy = H(sx, sz);

  // ---- the summit clearing: a grass patch following the ground (outline read on the z18 photo, metres from the peak)
  {
    const ring = [[-17, -13.5], [-9.8, -9], [6.8, -6], [7.5, 3], [-0.8, 12.5], [-7.5, 7.5], [-14, -4]].map(([dx, dz]) => [sx + dx, sz + dz]);
    const c = [sx - 3, sz]; const rings = 4, pos = [], idx = [], n = ring.length;
    for (let r = 0; r <= rings; r++) for (const p of ring) { const f = r / rings, x = c[0] + (p[0] - c[0]) * f, z = c[1] + (p[1] - c[1]) * f; pos.push(x, H(x, z) + 0.06, z); }
    for (let r = 0; r < rings; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, cc = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n; idx.push(a, b, cc, b, d, cc); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    let up = 0; for (let i = 0; i < g.attributes.normal.count; i++) up += g.attributes.normal.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } g.computeVertexNormals(); }
    k.mesh(g, m.grass);
  }
  // summit post 「安波山 山頂 239m」, benches facing the bay (south-east), a stone plaque at the north-west edge
  {
    const post = [sx + 0.8, sz - 1.2], py = H(...post);
    k.box(0.32, 2.4, 0.32, m.post, [post[0], py + 1.2, post[1]]);
    const face = vTextTex(ctx, '安波山山頂', { w: 128, h: 512, color: C.ink, bg: C.sign, font: FONT.brush, border: C.rail });
    k.plane(0.3, 1.5, mapMat(ctx, 'toon', '#ffffff', face, { paint: 0 }), [post[0], py + 1.45, post[1] + 0.17]);
    const el = textTex(ctx, '標高 239m', { w: 256, h: 64, color: C.ink, bg: C.sign, font: FONT.sans, weight: 700 });
    k.plane(0.3, 0.08, mapMat(ctx, 'toon', '#ffffff', el, { paint: 0 }), [post[0], py + 0.55, post[1] + 0.17]);
    const bay = Math.atan2(156 - sx, -33 - sz);
    for (const [dx, dz] of [[-4, 5], [0.5, 6.5], [4.5, 2.5]]) {
      const x = sx + dx, z = sz + dz, y = H(x, z), g = k.group([x, y, z], bay), kk = ctx.kit(g);
      kk.rbox(1.8, 0.08, 0.45, 0.03, m.deck, [0, 0.44, 0]); kk.rbox(1.8, 0.35, 0.06, 0.02, m.deck, [0, 0.72, -0.22], [-0.15, 0, 0]);
      for (const s of [-0.75, 0.75]) kk.box(0.08, 0.44, 0.4, m.rail, [s, 0.22, 0]);
    }
    const st = [sx - 17, sz - 12], y = H(...st);
    k.rbox(1.4, 1.1, 0.5, 0.12, m.stone, [st[0], y + 0.55, st[1]]);
    const plq = textTex(ctx, '安波山', { w: 256, h: 96, color: '#f1ede2', bg: '#6e6a62', font: FONT.serif, weight: 700 });
    k.plane(0.9, 0.34, mapMat(ctx, 'toon', '#ffffff', plq, { paint: 0 }), [st[0], y + 0.75, st[1] + 0.26]);
    out.perches.push([post[0], py + 2.5, post[1]]);
  }

  // ---- the footpath from ひのでのてらす up past ほしのてらす to the summit (dirt, log steps), footlights to the 1st terrace
  const route = [[A.hinode[0] + 2, A.hinode[1] - 6], [-507, -730], [-503, -790], [-499, -840], [A.hoshi[0] + 2, A.hoshi[1] + 4], [-501, -905], [-498, -945], [sx - 4, sz + 14]];
  const smp = resample(route, 2.5); for (const p of smp) p.y = H(p.x, p.z) + 0.05;
  k.mesh(sweepSlab(smp, { l0: -0.6, l1: 0.6, th: 0.15, tile: 2, bottom: false }), m.soil);
  for (let i = 3; i < smp.length - 1; i += 3) { const p = smp[i], q = smp[i + 1]; if (Math.abs(q.y - p.y) < 0.35) continue; k.cyl(0.1, 0.1, 1.6, m.post, [p.x, p.y + 0.08, p.z], [0, Math.atan2(p.ux, p.uz), Math.PI / 2], 6); }
  const foot = nightMat(ctx, '#cfc6b4', '#ffd9a0', 1.8);
  for (let i = 0; i < smp.length; i += 6) { const p = smp[i]; if (p.s > 60) break; const x = p.x - p.uz * 1.1, z = p.z + p.ux * 1.1; k.box(0.14, 0.5, 0.14, foot, [x, H(x, z) + 0.25, z]); registry(ctx)?.point({ x, y: H(x, z) + 0.5, z, color: '#ffd9a0', size: 0.35, intensity: 1.2, mode: 'lamps' }); }
  out.path = route;

  // ---- the two terraces: timber decks cantilevered toward the bay, rails, benches, a name board; ほしのてらす has a roof
  for (const [id, p, label, roofed] of [['hinode', A.hinode, 'ひのでのてらす', false], ['hoshi', A.hoshi, 'ほしのてらす', true]]) {
    const [x, z] = p, face = Math.atan2(156 - x, -33 - z), gy = Math.max(H(x, z), H(x + Math.sin(face) * 4, z + Math.cos(face) * 4) + 0.3), dy = 0.5;
    const g = k.group([x, gy, z], face), kk = ctx.kit(g);
    const W = 7, D = 4.2;
    kk.box(W, 0.16, D, m.deck, [0, dy, 0]);
    for (const xx of [-W / 2 + 0.3, 0, W / 2 - 0.3]) for (const zz of [-D / 2 + 0.3, D / 2 - 0.3]) kk.box(0.22, dy + 3, 0.22, m.rail, [xx, dy - 1.5, zz]);
    for (let xx = -W / 2 + 0.1; xx <= W / 2; xx += 1.1) kk.box(0.08, 1.0, 0.08, m.rail, [xx, dy + 0.55, D / 2 - 0.05]);
    for (const s of [-1, 1]) kk.box(0.08, 1.0, 0.08, m.rail, [s * (W / 2 - 0.05), dy + 0.55, 0]);
    kk.box(W, 0.1, 0.12, m.rail, [0, dy + 1.05, D / 2 - 0.05]); for (const s of [-1, 1]) kk.box(0.12, 0.1, D, m.rail, [s * (W / 2 - 0.05), dy + 1.05, 0]);
    kk.rbox(2.4, 0.08, 0.45, 0.03, m.deck, [0, dy + 0.45, -D / 2 + 0.6]);
    if (roofed) { for (const xx of [-1.4, 1.4]) for (const zz of [-1.4, 1.4]) kk.box(0.16, 2.4, 0.16, m.post, [xx, dy + 1.2, zz - 0.4]); kk.mesh(new THREE.ConeGeometry(2.7, 1.1, 4, 1, true).rotateY(Math.PI / 4), m.roof, [0, dy + 2.95, -0.4]); }
    const bd = textTex(ctx, label, { w: 512, h: 96, color: '#f4efe4', bg: '#4f6b5a', font: FONT.round, weight: 700 });
    kk.box(0.1, 1.2, 0.1, m.rail, [W / 2 - 0.6, dy + 0.6, -D / 2 - 0.3]);
    kk.plane(1.6, 0.3, mapMat(ctx, 'toon', '#ffffff', bd, { paint: 0 }), [W / 2 - 0.6, dy + 1.3, -D / 2 - 0.24]);
    if (ctx.physics?.addWalkBox) ctx.physics.addWalkBox(x, z, W, D, face, gy + dy + 0.08, gy - 1);
    out.terraces.push({ id, x, z, y: gy + dy, face });
  }
  // the view: from the south edge of the summit clearing toward the bay
  const bayDir = [156 - sx, -33 - sz], bl = Math.hypot(...bayDir);
  const ex = sx + bayDir[0] / bl * 7, ez = sz + bayDir[1] / bl * 7;
  out.eye = new THREE.Vector3(ex, H(ex, ez) + 1.55, ez);
  void seg;
  return out;
}
