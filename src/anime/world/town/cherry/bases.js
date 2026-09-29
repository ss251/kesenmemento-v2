// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/bases.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Tree bases: square tree pits, low stone rings (石組み), natural soil patches — each with
// grass tufts, small wild flowers (tanpopo / hakobera / sumire) and moss. Plus the shrine tree's
// shimenawa (sacred rope with shide paper).
import * as THREE from 'three';
import { GeoBuilder, hex, mix3 } from './util.js';

// flora atlas cells (u0,v0) in the 2x2 flora texture (flipY: canvas row 0 = top = v 0.5..1)
const FL = { grass: [0, 0.5], dandelion: [0.5, 0.5], white: [0, 0], violet: [0.5, 0] };
const GROUND = { soil: [0, 0], moss: [0.5, 0] }; // 2x1 atlas (u0, width 0.5)

export function createBaseBuilder(ctx, M) {
  const H = ctx.L.heightAt;
  const R = ctx.rng('sakura-bases');
  const flora = new GeoBuilder(), ground = new GeoBuilder(), stones = new GeoBuilder();
  const kitGroup = new THREE.Group(); kitGroup.name = 'sakura-bases';
  const kit = ctx.kit(kitGroup);
  const grassCols = [hex('#e9f0dc'), hex('#f4f6e8'), hex('#dfe8cf'), hex('#ecefd8')];
  const stoneCols = [hex('#aaa69c'), hex('#9d998f'), hex('#b5b0a4'), hex('#a39d92'), hex('#b9b4a9')];

  function tuft(x, z, y, h, cell, rot) {
    const w = h * (cell === FL.grass ? 1.05 : 0.9);
    const col = cell === FL.grass ? grassCols[Math.floor(R() * grassCols.length)] : [0.95, 0.95, 0.95];
    for (let q = 0; q < 2; q++) {
      const a = rot + q * Math.PI / 2, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2;
      const b = flora.count;
      // normals point up so both faces read like lit ground
      flora.v(x - cx, y - 0.02, z - cz, 0, 1, 0, cell[0], cell[1], ...col);
      flora.v(x + cx, y - 0.02, z + cz, 0, 1, 0, cell[0] + 0.5, cell[1], ...col);
      flora.v(x + cx, y + h, z + cz, 0, 1, 0, cell[0] + 0.5, cell[1] + 0.5, ...col);
      flora.v(x - cx, y + h, z - cz, 0, 1, 0, cell[0], cell[1] + 0.5, ...col);
      flora.t(b, b + 1, b + 2); flora.t(b, b + 2, b + 3);
    }
  }
  /** Flat decal patch draped on a surface function (soil or moss). */
  function patch(cx, cz, rad, cell, yFn, rot = 0, tint = [1, 1, 1], lift = 0.022) {
    const n = 6, b = ground.count;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const u = i / n, v = j / n;
      const lx = (u - 0.5) * 2 * rad, lz = (v - 0.5) * 2 * rad;
      const x = cx + lx * c - lz * s, z = cz + lx * s + lz * c;
      ground.v(x, yFn(x, z) + lift, z, 0, 1, 0, cell[0] + u * 0.5, cell[1] + v, ...tint);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = b + i * (n + 1) + j, bb = a + 1, cc = a + (n + 1), d = cc + 1;
      ground.t(a, bb, d); ground.t(a, d, cc);
    }
  }
  function scatterFlora(x, z, rIn, rOut, count, yFn, flowerP = 0.3) {
    for (let k = 0; k < count; k++) {
      const a = R() * Math.PI * 2, d = rIn + Math.sqrt(R()) * (rOut - rIn);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const roll = R();
      const cell = roll < 1 - flowerP ? FL.grass : roll < 1 - flowerP * 0.55 ? FL.white : roll < 1 - flowerP * 0.22 ? FL.dandelion : FL.violet;
      tuft(px, pz, yFn(px, pz), cell === FL.grass ? 0.2 + R() * 0.2 : 0.16 + R() * 0.12, cell, R() * Math.PI);
    }
  }
  /** Irregular natural stone (lumpy rounded box via a displaced low-poly sphere). */
  function stone(x, y, z, sx, sy, sz, rotY) {
    const col = stoneCols[Math.floor(R() * stoneCols.length)];
    const mossy = R() < 0.4;
    const lon = 8, lat = 5, b = stones.count;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const ph = R() * 10;
    for (let i = 0; i <= lat; i++) {
      const th = (i / lat) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j <= lon; j++) {
        const pphi = (j / lon) * Math.PI * 2;
        // superellipsoid-ish (boxy but rounded), flat bottom
        const sgn = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
        let ux = sgn(st, 0.6) * sgn(Math.cos(pphi), 0.6), uy = sgn(ct, 0.6), uz = sgn(st, 0.6) * sgn(Math.sin(pphi), 0.6);
        const bump = 1 + 0.08 * Math.sin(pphi * 3 + ph) * st + 0.05 * Math.sin(th * 4 + ph);
        ux *= bump; uz *= bump; if (uy < -0.3) uy = -0.3 - (uy + 0.3) * 0.2;
        const lx = ux * sx / 2, ly = uy * sy / 2, lz = uz * sz / 2;
        const nx0 = st * Math.cos(pphi) / sx, ny0 = ct / sy, nz0 = st * Math.sin(pphi) / sz;
        const nl = Math.hypot(nx0, ny0, nz0) || 1;
        const k = mossy && ct > 0.55 ? 0.7 : 0;
        const cc = k ? mix3(col, hex('#8d9d68'), k) : col;
        stones.v(x + lx * c + lz * s, y + sy / 2 + ly, z - lx * s + lz * c, (nx0 * c + nz0 * s) / nl, ny0 / nl, (-nx0 * s + nz0 * c) / nl, 0, 0, ...cc);
      }
    }
    for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
      const a = b + i * (lon + 1) + j, bb = a + 1, cc = a + (lon + 1), d = cc + 1;
      stones.t(a, bb, cc); stones.t(bb, d, cc);
    }
  }

  const colliders = [];
  function build(tree) {
    const base = tree.spec.base || { type: 'soil' };
    const { x, z } = tree.spec;
    const tr = tree.spec.trunkR;
    const gy = H(x, z);
    if (base.type === 'none') return;
    if (base.type === 'pit') {
      const S = base.size, cw = 0.12, ch = 0.15;
      // ground under a pit is ~flat; use the lowest corner so nothing floats
      let g = Infinity; for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) g = Math.min(g, H(x + dx * S / 2, z + dz * S / 2));
      const cm = M.curb;
      kit.rbox(S, ch + 0.1, cw, 0.03, cm, [x, g + (ch - 0.1) / 2, z - S / 2 + cw / 2]);
      kit.rbox(S, ch + 0.1, cw, 0.03, cm, [x, g + (ch - 0.1) / 2, z + S / 2 - cw / 2]);
      kit.rbox(cw, ch + 0.1, S - cw * 2, 0.03, cm, [x - S / 2 + cw / 2, g + (ch - 0.1) / 2, z]);
      kit.rbox(cw, ch + 0.1, S - cw * 2, 0.03, cm, [x + S / 2 - cw / 2, g + (ch - 0.1) / 2, z]);
      const top = g + ch - 0.05;
      const soil = kit.box(S - cw * 2, 0.2, S - cw * 2, M.soil, [x, top - 0.1, z]); soil.castShadow = false;
      const flat = () => top;
      patch(x, z, S * 0.36, GROUND.moss, flat, R() * 6, [1, 1, 1], 0.012);
      patch(x + (R() - 0.5) * 0.3, z + (R() - 0.5) * 0.3, S * 0.25, GROUND.moss, flat, R() * 6, [0.92, 0.97, 0.9], 0.016);
      const inner = S / 2 - cw - 0.05;
      const n = Math.round(10 + S * S * 7);
      for (let k = 0; k < n; k++) {
        const px = x + (R() - 0.5) * 2 * inner, pz = z + (R() - 0.5) * 2 * inner;
        if (Math.hypot(px - x, pz - z) < tr * 1.35) continue;
        const roll = R();
        const cell = roll < 0.62 ? FL.grass : roll < 0.8 ? FL.white : roll < 0.92 ? FL.dandelion : FL.violet;
        tuft(px, pz, top, cell === FL.grass ? 0.16 + R() * 0.16 : 0.14 + R() * 0.1, cell, R() * Math.PI);
      }
      return;
    }
    if (base.type === 'stones') {
      const rr = base.r;
      const n = Math.max(8, Math.round((2 * Math.PI * rr) / 0.42));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (R() - 0.5) * 0.12;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const sx = 0.36 + R() * 0.14, sy = 0.22 + R() * 0.14, sz = 0.26 + R() * 0.1;
        stone(px, H(px, pz) - 0.06, pz, sx, sy, sz, -a + Math.PI / 2 + (R() - 0.5) * 0.3);
      }
      // slightly raised soil inside the ring
      const mound = (px, pz) => { const d = Math.hypot(px - x, pz - z) / rr; return H(px, pz) + 0.08 * Math.max(0, 1 - d * d); };
      patch(x, z, rr * 1.02, GROUND.soil, mound, R() * 6, [1, 1, 1], 0.02);
      patch(x + 0.15, z - 0.1, rr * 0.55, GROUND.moss, mound, R() * 6, [1, 1, 1], 0.03);
      scatterFlora(x, z, tr * 1.4, rr * 0.8, Math.round(rr * rr * 16), mound, 0.36);
      scatterFlora(x, z, rr * 1.05, rr * 1.45, Math.round(rr * 12), H, 0.25);
      if (base.shimenawa) shimenawa(tree);
      return;
    }
    // natural soil
    const rr = base.r ?? 1.0;
    patch(x, z, rr * 1.15, GROUND.soil, H, R() * 6, [1, 1, 1], 0.02);
    patch(x + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.4, rr * 0.6, GROUND.moss, H, R() * 6, [1, 1, 1], 0.028);
    scatterFlora(x, z, rr * 0.55, rr * 1.35, Math.round(rr * rr * 20), H, 0.3);
  }

  function shimenawa(tree) {
    const { x, z, trunkR } = tree.spec;
    const y = H(x, z) + 1.55;
    const rr = trunkR * 1.12 + 0.04;
    const pts = [];
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * rr, y + Math.sin(a * 2) * 0.015, z + Math.sin(a) * rr)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 32, 0.035, 6, true);
    kit.mesh(g, M.rope);
    // shide (zigzag paper streamers)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const px = x + Math.cos(a) * (rr + 0.02), pz = z + Math.sin(a) * (rr + 0.02);
      const grp = kit.group([px, y - 0.03, pz], Math.atan2(Math.cos(a), Math.sin(a)));
      const k2 = ctx.kit(grp);
      k2.box(0.06, 0.07, 0.004, M.paper, [0, -0.04, 0]);
      k2.box(0.06, 0.07, 0.004, M.paper, [0.025, -0.1, 0.002], [0, 0, 0.35]);
      k2.box(0.06, 0.07, 0.004, M.paper, [-0.005, -0.16, 0.004], [0, 0, -0.35]);
      k2.box(0.06, 0.06, 0.004, M.paper, [0.02, -0.22, 0.006], [0, 0, 0.3]);
    }
  }

  function finish() {
    const out = [];
    const gF = flora.build(); if (gF) { const m = new THREE.Mesh(gF, M.flora); m.receiveShadow = true; m.castShadow = false; m.name = 'sakura-flora'; ctx.noOutline(m); out.push(m); }
    const gG = ground.build(); if (gG) { const m = new THREE.Mesh(gG, M.ground); m.receiveShadow = true; m.castShadow = false; m.name = 'sakura-groundpatch'; ctx.noOutline(m); out.push(m); }
    const gS = stones.build(); if (gS) { const m = new THREE.Mesh(gS, M.stone); m.receiveShadow = true; m.castShadow = true; m.name = 'sakura-stones'; out.push(m); }
    return { meshes: out, group: kitGroup, colliders, tris: flora.tris + ground.tris + stones.tris };
  }
  return { build, finish };
}
