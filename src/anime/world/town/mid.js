// [v3:town] Mid-zone buildings (the fish-market district, 安波山's lower slopes, the ring around the inner bay):
// simplified but charming anime buildings on the real footprints: the OBB body with a procedural facade
// (facade.js: window grids, shopfronts, warehouse ribs + rust), real roof shapes with eaves (gable / hip / shed /
// flat with a parapet / saw-tooth) in the photo-sampled roof colour on kawara or metal textures, and a few cheap
// extras that read from the drone: shop awnings, apartment balcony slabs, rooftop tanks and AC units.
// Merged per 450 m chunk and per material (4 draw calls per chunk), kept out of the core batcher (custom attributes).
import * as THREE from 'three';
import { facadeMaterial, STYLE } from './facade.js';
import { pick } from './common.js';
import { wallOf, pitchedRoofOf, flatRoofOf } from './palette.js';

const AWN = ['#2e5d8f', '#b8452e', '#2f7a45', '#d98a3a', '#8d2f2a', '#3f6a54', '#c7743f', '#2c4f8a'];

class Buf {
  constructor(fac) { this.p = []; this.n = []; this.u = []; this.c = []; this.f = fac ? [] : null; this.i = []; this.vc = 0; }
  v(p, n, uv, col, fac) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]); this.c.push(col.r, col.g, col.b); if (this.f) this.f.push(fac[0], fac[1], fac[2], fac[3]); return this.vc++; }
  quad(ps, n, uvs, col, fac) { const k = this.vc; for (let i = 0; i < 4; i++) this.v(ps[i], n, uvs[i], col, fac); this._wind(k, [0, 1, 2, 0, 2, 3], n); }
  tri(ps, n, uvs, col, fac) { const k = this.vc; for (let i = 0; i < 3; i++) this.v(ps[i], n, uvs[i], col, fac); this._wind(k, [0, 1, 2], n); }
  _wind(k, idx, n) {
    const P = this.p, a = k * 3;
    const b = (k + idx[1]) * 3, c = (k + idx[2]) * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    for (let t = 0; t < idx.length; t += 3) { if (flip) this.i.push(k + idx[t], k + idx[t + 2], k + idx[t + 1]); else this.i.push(k + idx[t], k + idx[t + 1], k + idx[t + 2]); }
  }
  /** axis box in a local frame fn(lx, y, lz) -> world [x,y,z]; nfn(lx,lz) -> world normal */
  box(Tf, cx, y0, cz, w, h, d, col, uvS = 1) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const P = (x, y, z) => Tf.p(x, y, z), N = (x, y, z) => Tf.n(x, y, z);
    const uvq = (a, b) => [[0, 0], [a / uvS, 0], [a / uvS, b / uvS], [0, b / uvS]];
    this.quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], N(0, 0, 1), uvq(w, h), col);
    this.quad([P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], N(0, 0, -1), uvq(w, h), col);
    this.quad([P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], N(1, 0, 0), uvq(d, h), col);
    this.quad([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], N(-1, 0, 0), uvq(d, h), col);
    this.quad([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], N(0, 1, 0), uvq(w, d), col);
  }
  mesh(mat) {
    if (!this.vc) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.f) g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.f, 4));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

/** Local frame of an OBB: lx along the building's x, lz along its z (front = +z), y world. */
function frameOf(o) {
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  return {
    p: (lx, y, lz) => [o.cx + lx * c + lz * s, y, o.cz - lx * s + lz * c],
    n: (nx, ny, nz) => [nx * c + nz * s, ny, -nx * s + nz * c],
  };
}

export function styleOf(lot, main) {
  const k = lot.kind;
  if (k === 'warehouse' || k === 'factory') return STYLE.warehouse;
  if (k === 'apartment') return STYLE.apartment;
  if (k === 'office') return STYLE.office;
  if (k === 'public' || k === 'school') return STYLE.public;
  if (k === 'shop' || (main && k === 'house' && lot.area < 260 && (lot.seed % 3 === 0))) return STYLE.shop;
  return STYLE.house;
}

export function buildMid(ctx, lots, { H, roadIdx, chunk = 1800, exclude = new Set() } = {}) {
  const L = ctx.L;
  const facade = facadeMaterial(ctx);
  const kawara = H.M.kawara, metal = H.M.metal, vc = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05 });
  const chunks = new Map();
  const get = (x, z) => {
    const k = Math.floor(x / chunk) + ',' + Math.floor(z / chunk);
    let c = chunks.get(k); if (!c) chunks.set(k, (c = { wall: new Buf(true), kaw: new Buf(false), met: new Buf(false), ext: new Buf(false) })); return c;
  };
  const col = new THREE.Color(), rc = new THREE.Color(), ec = new THREE.Color();
  let n = 0, tris = 0;
  const stats = { gable: 0, hip: 0, shed: 0, flat: 0, saw: 0 };
  for (const lot of lots) {
    if (exclude.has(lot.id) || lot.landmark || lot.kind === 'shrine') continue;
    if (L.shoreDist(lot.obb.cx, lot.obb.cz) > 0.5) continue;   // footprints on pontoons / piers belong to the harbour
    const o = lot.obb;
    if (o.w < 2 || o.d < 2) continue;
    const r = ctx.rng('mid-' + lot.id);
    const road = lot.front?.roadId ? L.roadById(lot.front.roadId) : null;
    const main = !!road && road.width >= 7.5;
    const style = styleOf(lot, main);
    const isWh = style === STYLE.warehouse;
    const h = Math.max(2.8, Math.min(40, lot.height || 3));
    const w = o.w - 0.3, d = o.d - 0.3;
    const F = frameOf(o);
    // ground: the lowest corner so nothing floats; the body sinks into the slope
    let gmin = 1e9; for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) { const p = F.p(lx, 0, lz); gmin = Math.min(gmin, L.heightAt(p[0], p[2])); }
    const g0 = Math.max(gmin, lot.groundY - 1.5) - 0.4, fy = Math.max(lot.groundY, gmin) + 0.1;
    const top = fy + h;
    const c = get(o.cx, o.cz);
    col.set(wallOf(lot));
    const nearSea = isWh && L.shoreDist(o.cx, o.cz) > -90;
    const fac = [style, (lot.seed % 997) / 997, h, nearSea ? 0.4 + r() * 0.6 : 0];
    // walls: u runs along each face from its left corner (seen from outside), v = height above the floor
    const faces = [
      { a: [-w / 2, d / 2], b: [w / 2, d / 2], n: [0, 0, 1] }, { a: [w / 2, d / 2], b: [w / 2, -d / 2], n: [1, 0, 0] },
      { a: [w / 2, -d / 2], b: [-w / 2, -d / 2], n: [0, 0, -1] }, { a: [-w / 2, -d / 2], b: [-w / 2, d / 2], n: [-1, 0, 0] },
    ];
    const u0 = (lot.seed % 13) * 0.37;
    for (const f of faces) {
      const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      c.wall.quad([F.p(f.a[0], g0, f.a[1]), F.p(f.b[0], g0, f.b[1]), F.p(f.b[0], top, f.b[1]), F.p(f.a[0], top, f.a[1])], F.n(...f.n),
        [[u0, g0 - fy], [u0 + len, g0 - fy], [u0 + len, h], [u0, h]], col, fac);
    }
    // roof
    let shape = lot.roof.shape;
    if (shape === 'shed' && !isWh && r() < 0.55) shape = r() < 0.5 ? 'gable' : 'hip';
    if (shape === 'flat' && h < 7.5 && !isWh && lot.area < 220 && r() < 0.6) shape = 'gable';
    if (isWh && shape === 'hip') shape = 'gable';
    let roofCol = shape === 'flat' ? flatRoofOf(lot) : pitchedRoofOf(lot);
    if (isWh && shape !== 'flat' && r() < 0.5) roofCol = pick(r, ['#56677a', '#4a78a0', '#8e4540', '#7b8691', '#6f8f8a']);
    rc.set(roofCol);
    const useKawara = !isWh && (shape === 'gable' || shape === 'hip') && r() < 0.55;
    const RB = useKawara ? c.kaw : c.met;
    stats[shape] = (stats[shape] || 0) + 1;
    const over = isWh ? 0.35 : 0.5;
    const alongX = w >= d;
    const Lh = (alongX ? w : d) / 2 + over, Dh = (alongX ? d : w) / 2 + over;
    // roof-local -> building-local (ridge along the long axis)
    const RP = (a, y, b) => (alongX ? F.p(a, y, b) : F.p(b, y, -a));
    const RN = (a, y, b) => (alongX ? F.n(a, y, b) : F.n(b, y, -a));
    const eaveY = top - 0.12;
    if (shape === 'gable' || shape === 'hip' || shape === 'saw' && !isWh) {
      const pitch = isWh ? 0.14 + r() * 0.06 : useKawara ? 0.42 + r() * 0.1 : 0.3 + r() * 0.1;
      const ridgeY = eaveY + Dh * pitch;
      const ridgeHalf = shape === 'hip' ? Math.max(0.2, Lh - Dh) : Lh;
      const nrm = (s) => [0, 1 / Math.hypot(1, pitch), s * pitch / Math.hypot(1, pitch)];
      for (const s of [1, -1]) {
        const ns = nrm(s);
        RB.quad([RP(-Lh, eaveY, s * Dh), RP(Lh, eaveY, s * Dh), RP(ridgeHalf, ridgeY, 0), RP(-ridgeHalf, ridgeY, 0)], RN(ns[0], ns[1], ns[2]),
          [[-Lh / 1.1, 0], [Lh / 1.1, 0], [ridgeHalf / 1.1, Dh], [-ridgeHalf / 1.1, Dh]], rc);
        // fascia under the eave edge (reads as a crisp line from above)
        c.ext.quad([RP(-Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY, s * Dh), RP(-Lh, eaveY, s * Dh)], RN(0, 0, s), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
      }
      if (shape === 'hip') {
        for (const s of [1, -1]) {
          RB.tri([RP(s * Lh, eaveY, -Dh), RP(s * Lh, eaveY, Dh), RP(s * ridgeHalf, ridgeY, 0)], RN(s * 0.55, 0.83, 0), [[-Dh / 1.1, 0], [Dh / 1.1, 0], [0, Lh - ridgeHalf]], rc);
        }
      } else {
        // gable ends in the wall colour (facade material so the window grid continues)
        for (const s of [1, -1]) {
          const x = s * (alongX ? w / 2 : d / 2);
          const dd = alongX ? d / 2 : w / 2;
          c.wall.tri([RP(x, top, -dd), RP(x, top, dd), RP(x, ridgeY - 0.12, 0)], RN(s, 0, 0), [[0, h], [2 * dd, h], [dd, h + 2]], col, [STYLE.plain, fac[1], 99, 0]);
          // barge boards
          c.ext.quad([RP(x + s * over, eaveY, Dh), RP(x + s * over, eaveY - 0.12, Dh), RP(x + s * over, ridgeY - 0.12, 0), RP(x + s * over, ridgeY, 0)], RN(s, 0, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
          c.ext.quad([RP(x + s * over, eaveY - 0.12, -Dh), RP(x + s * over, eaveY, -Dh), RP(x + s * over, ridgeY, 0), RP(x + s * over, ridgeY - 0.12, 0)], RN(s, 0, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
        }
      }
      // ridge cap
      if (ridgeHalf > 0.3) c.ext.box({ p: (lx, y, lz) => RP(lx, y, lz), n: (a, b, c2) => RN(a, b, c2) }, 0, ridgeY - 0.05, 0, ridgeHalf * 2 + 0.1, 0.16, 0.26, ec.copy(rc).multiplyScalar(0.8));
    } else if (shape === 'shed') {
      const rise = Math.min(1.6, Dh * 2 * 0.18);
      const s = r() < 0.5 ? 1 : -1;
      RB.quad([RP(-Lh, eaveY, s * Dh), RP(Lh, eaveY, s * Dh), RP(Lh, eaveY + rise, -s * Dh), RP(-Lh, eaveY + rise, -s * Dh)], RN(0, 1, s * rise / (2 * Dh)), [[-Lh, 0], [Lh, 0], [Lh, 2 * Dh], [-Lh, 2 * Dh]], rc);
      for (const e of [1, -1]) {
        const x = e * (alongX ? w / 2 : d / 2), dd = alongX ? d / 2 : w / 2;
        c.wall.tri([RP(x, top, s * dd), RP(x, top, -s * dd), RP(x, top + rise * 0.95, -s * dd)], RN(e, 0, 0), [[0, h], [1, h], [1, h + 1]], col, [STYLE.plain, fac[1], 99, 0]);
      }
      c.ext.quad([RP(-Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY, s * Dh), RP(-Lh, eaveY, s * Dh)], RN(0, 0, s), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
    } else if (shape === 'saw') {
      const Lx = alongX ? w / 2 : d / 2, Dz = alongX ? d / 2 : w / 2, teeth = Math.max(2, Math.round(Dz * 2 / 7));
      for (let k = 0; k < teeth; k++) {
        const z0 = -Dz + k * 2 * Dz / teeth, z1 = z0 + 2 * Dz / teeth, rise = 1.8;
        RB.quad([RP(-Lx, top, z0), RP(Lx, top, z0), RP(Lx, top + rise, z1), RP(-Lx, top + rise, z1)], RN(0, 1, -rise / (z1 - z0)), [[-Lx, 0], [Lx, 0], [Lx, 2], [-Lx, 2]], rc);
        c.ext.quad([RP(-Lx, top, z1), RP(Lx, top, z1), RP(Lx, top + rise, z1), RP(-Lx, top + rise, z1)], RN(0, 0, 1), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#b9c7d2'));
      }
    } else {
      // flat: slab + parapet + rooftop tanks / units
      const TF = { p: F.p, n: F.n };
      c.met.quad([F.p(-w / 2, top + 0.05, d / 2), F.p(w / 2, top + 0.05, d / 2), F.p(w / 2, top + 0.05, -d / 2), F.p(-w / 2, top + 0.05, -d / 2)], F.n(0, 1, 0), [[0, 0], [w, 0], [w, d], [0, d]], rc);
      const pc = ec.set(wallOf(lot)).multiplyScalar(0.92).clone();
      for (const [cx, cz, bw, bd] of [[0, d / 2 - 0.1, w, 0.2], [0, -d / 2 + 0.1, w, 0.2], [w / 2 - 0.1, 0, 0.2, d], [-w / 2 + 0.1, 0, 0.2, d]]) c.ext.box(TF, cx, top, cz, bw, 0.55, bd, pc);
      const nU = Math.min(4, Math.floor(w * d / 120) + (r() < 0.6 ? 1 : 0));
      for (let k = 0; k < nU; k++) {
        const ux = (r() - 0.5) * (w - 3), uz = (r() - 0.5) * (d - 3);
        if (r() < 0.4 && h > 8) { c.ext.box(TF, ux, top + 0.05, uz, 2.0, 1.6, 2.0, ec.set('#c9cdd0').clone()); c.ext.box(TF, ux, top + 1.65, uz, 2.1, 0.12, 2.1, ec.set('#aeb4ba').clone()); }
        else c.ext.box(TF, ux, top + 0.05, uz, 1.0, 0.7, 0.6, ec.set('#d9dcdc').clone());
      }
    }
    // extras
    if (style === STYLE.shop) {
      ec.set(AWN[lot.seed % AWN.length]);
      const aw = Math.min(w - 0.4, 12), y0 = fy + 2.5;
      c.ext.quad([F.p(-aw / 2, y0 - 0.45, d / 2 + 1.1), F.p(aw / 2, y0 - 0.45, d / 2 + 1.1), F.p(aw / 2, y0, d / 2), F.p(-aw / 2, y0, d / 2)], F.n(0, 0.92, 0.39), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
      c.ext.quad([F.p(-aw / 2, y0 - 0.7, d / 2 + 1.1), F.p(aw / 2, y0 - 0.7, d / 2 + 1.1), F.p(aw / 2, y0 - 0.45, d / 2 + 1.1), F.p(-aw / 2, y0 - 0.45, d / 2 + 1.1)], F.n(0, 0, 1), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
    }
    if (style === STYLE.apartment && h > 5.5 && w > 5) {
      const TF = { p: F.p, n: F.n };
      const floors = Math.floor(h / 2.9);
      ec.set('#e2ddd2');
      for (let fl = 1; fl < floors; fl++) {
        c.ext.box(TF, 0, fy + fl * 2.9 - 0.12, d / 2 + 0.5, w - 0.6, 0.14, 1.0, ec);
        c.ext.box(TF, 0, fy + fl * 2.9 + 0.02, d / 2 + 0.97, w - 0.6, 1.0, 0.06, ec.set(r() < 0.5 ? '#c9ccd1' : '#e8e6e0').clone());
      }
    }
    // AC units / water heaters on house side walls (tiny, read as texture from the air)
    if (style === STYLE.house && r() < 0.5) { const TF = { p: F.p, n: F.n }; c.ext.box(TF, w / 2 - 0.9, fy + 0.1, d / 2 + 0.2, 0.8, 0.6, 0.3, ec.set('#e6e6e2').clone()); }
    n++;
  }
  const group = new THREE.Group(); group.name = 'town-mid';
  for (const c of chunks.values()) {
    for (const [buf, mat] of [[c.wall, facade], [c.kaw, kawara], [c.met, metal], [c.ext, vc]]) {
      const m = buf.mesh(mat); if (!m) continue;
      tris += buf.i.length / 3;
      group.add(m);
    }
  }
  ctx.noBatch(group);
  ctx.addStatic(group);
  return { count: n, tris, meshes: group.children.length, stats };
}
