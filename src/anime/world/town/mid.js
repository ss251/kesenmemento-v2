// [v3:town] Mid-zone buildings (the fish-market district, 安波山's lower slopes, the ring around the inner bay):
// simplified but charming anime buildings on the real footprints: the OBB body with a procedural facade
// (facade.js: window grids, shopfronts, warehouse ribs + rust), real roof shapes with eaves (gable / hip / shed /
// flat with a parapet / saw-tooth) in the photo-sampled roof colour on kawara or metal textures, and a few cheap
// extras that read from the drone: shop awnings, apartment balcony slabs, rooftop tanks and AC units.
// Merged per 450 m chunk and per material (4 draw calls per chunk), kept out of the core batcher (custom attributes).
import * as THREE from 'three';
import { facadeMaterial, STYLE } from './facade.js';
import { pick } from './common.js';
import { wallOf, pitchedRoofOf, flatRoofOf, kawaraColour } from './palette.js';
import earcut from 'earcut';
import { wings, outerSides, bodyOf, localPoly, simplifyRing, insetRing, ccw, inRing } from './wings.js';   // [v4:town-accuracy]

/** Extend a body on the sides it shares with `main` by `by` m (annex wings reach under the main house's eaves). */
function grow(body, rect, sides, main, by) {
  const x0 = body.cx - body.w / 2, x1 = body.cx + body.w / 2, z0 = body.cz - body.d / 2, z1 = body.cz + body.d / 2;
  const mx0 = main.cx - main.w / 2, mx1 = main.cx + main.w / 2, mz0 = main.cz - main.d / 2, mz1 = main.cz + main.d / 2;
  const nx0 = !sides.nx && Math.abs(rect.cx - rect.w / 2 - mx1) < 0.05 ? x0 - by : x0, nx1 = !sides.px && Math.abs(rect.cx + rect.w / 2 - mx0) < 0.05 ? x1 + by : x1;
  const nz0 = !sides.nz && Math.abs(rect.cz - rect.d / 2 - mz1) < 0.05 ? z0 - by : z0, nz1 = !sides.pz && Math.abs(rect.cz + rect.d / 2 - mz0) < 0.05 ? z1 + by : z1;
  body.cx = (nx0 + nx1) / 2; body.cz = (nz0 + nz1) / 2; body.w = nx1 - nx0; body.d = nz1 - nz0;
}

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
  if (lot.facade && STYLE[lot.facade] != null) return STYLE[lot.facade];   // [v4:overrides] a facade style read from the imagery
  const k = lot.kind;
  if (k === 'warehouse' || k === 'factory') return STYLE.warehouse;
  if (k === 'apartment') return STYLE.apartment;
  if (k === 'office' || k === 'hotel') return STYLE.office;   // [v4:polish1] hotel: a block of room windows
  if (k === 'public' || k === 'school') return STYLE.public;
  if (k === 'shop' || (main && k === 'house' && lot.area < 260 && (lot.seed % 3 === 0))) return STYLE.shop;
  return STYLE.house;
}

export function buildMid(ctx, lots, { H, roadIdx, chunk = 1800, exclude = new Set(), annex = null, names = null } = {}) {
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
    if (exclude.has(lot.id) || lot.landmark || lot.kind === 'shrine' || lot.kind === 'temple') continue;   // [v4:polish3] temples: landmarks/temples.js
    if (L.shoreDist(lot.obb.cx, lot.obb.cz) > 0.5) continue;   // footprints on pontoons / piers belong to the harbour
    const o = lot.obb;
    if (o.w < 2 || o.d < 2) continue;
    const r = ctx.rng('mid-' + lot.id);
    const road = lot.front?.roadId ? L.roadById(lot.front.roadId) : null;
    const main = !!road && road.width >= 7.5;
    const style = styleOf(lot, main);
    const isWh = style === STYLE.warehouse;
    const h = Math.max(2.8, Math.min(60, lot.height || 3));   // [v4:town-accuracy] real heights up to 60 m (was 40)
    const F = frameOf(o);
    // [v4:town-accuracy] the real footprint: wings (rectilinear pieces) for pitched roofs, the polygon itself for flat ones
    const ax = annex?.get(lot.id), isAnnex = !!ax;   // hero lots: the kit house stands on wing 0, the other wings come here
    const W = isAnnex ? { rects: ax.rects, simple: false } : wings(lot);
    if (!W.rects.length || (isAnnex && ax.rects.length < 2)) continue;
    // ground: the lowest corner so nothing floats; the body sinks into the slope
    let gmin = 1e9; for (const [lx, lz] of [[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [-o.w / 2, o.d / 2], [o.w / 2, o.d / 2], [0, 0]]) { const p = F.p(lx, 0, lz); gmin = Math.min(gmin, L.heightAt(p[0], p[2])); }
    const g0 = Math.max(gmin, lot.groundY - 1.5) - 0.4, fy = Math.max(lot.groundY, gmin) + 0.1;
    const top = fy + h;
    const c = get(o.cx, o.cz);
    col.set(wallOf(lot));
    const nearSea = isWh && L.shoreDist(o.cx, o.cz) > -90;
    const fac = [style, (lot.seed % 997) / 997, h, nearSea ? 0.4 + r() * 0.6 : 0];
    const u0 = (lot.seed % 13) * 0.37;
    // roof shape (measured shapes are kept, [v4:data])
    let shape = lot.roof.shape;
    const measured = lot.src?.roof === 'aerial' || lot.src?.roof === 'osm' || lot.src?.roof === 'landmark' || lot.src?.roof === 'override';   // [v4:overrides]
    if (!measured && shape === 'shed' && !isWh && r() < 0.55) shape = r() < 0.5 ? 'gable' : 'hip';
    if (!measured && shape === 'flat' && h < 7.5 && !isWh && lot.area < 220 && r() < 0.6) shape = 'gable';
    if (isWh && shape === 'hip') shape = 'gable';
    // [v4:polish1] a big curved or many-sided footprint (too many corners for the rectilinear wings) that fills less than
    // 0.8 of its oriented box is built flat on its true polygon, not as the box (the accuracy audit's t12: curved blocks
    // drawn as boxes)
    const oddBig = !isAnnex && W.simple && W.rect < 0.8 && lot.area >= 250;
    if (oddBig) shape = 'flat';
    const colMeasured = lot.src?.color === 'aerial' || lot.src?.color === 'osm' || lot.src?.color === 'landmark' || lot.src?.color === 'override';   // [v4:overrides]
    let roofCol = shape === 'flat' ? flatRoofOf(lot) : pitchedRoofOf(lot);
    if (isWh && shape !== 'flat' && !colMeasured && r() < 0.5) roofCol = pick(r, ['#56677a', '#4a78a0', '#8e4540', '#7b8691', '#6f8f8a']);   // [v4:data] measured colours stay
    rc.set(roofCol);
    // [v4:town-accuracy] 瓦 only where the photo shows a tile colour (grey / charcoal / black / brown); painted metal otherwise
    const useKawara = !isWh && (shape === 'gable' || shape === 'hip') && kawaraColour(roofCol) && r() < 0.8;
    const RB = useKawara ? c.kaw : c.met;
    stats[shape] = (stats[shape] || 0) + 1;
    const over = isWh ? 0.35 : useKawara ? 0.55 : 0.45;
    const faceQuad = (a, b, y0, y1, n, uStart, fcol = col, ffac = fac) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      c.wall.quad([F.p(a[0], y0, a[1]), F.p(b[0], y0, b[1]), F.p(b[0], y1, b[1]), F.p(a[0], y1, a[1])], F.n(n[0], 0, n[1]), [[uStart, y0 - fy], [uStart + len, y0 - fy], [uStart + len, y1 - fy], [uStart, y1 - fy]], fcol, ffac);
      return len;
    };
    let mainBody = null;
    if (shape === 'flat' && !isAnnex) {
      // ---- flat roof on the true polygon: walls along every edge, a parapet, the slab, rooftop plant
      const ring = ccw(W.simple && !oddBig ? [[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [o.w / 2, o.d / 2], [-o.w / 2, o.d / 2]] : simplifyRing(localPoly(lot), 0.2));
      const inner = insetRing(ring, 0.25);
      let u = u0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1], le = Math.hypot(ex, ez) || 1;
        // outward normal of a counter-clockwise ring in (x, z) (signed area > 0 in this module's convention)
        const n = [ez / le, -ex / le];
        u += faceQuad(a, b, g0, top + 0.55, n, u);
        const ia = inner[i], ib = inner[(i + 1) % ring.length];
        const pc = ec.set(wallOf(lot)).multiplyScalar(0.92);
        c.ext.quad([F.p(ib[0], top + 0.05, ib[1]), F.p(ia[0], top + 0.05, ia[1]), F.p(ia[0], top + 0.55, ia[1]), F.p(ib[0], top + 0.55, ib[1])], F.n(-n[0], 0, -n[1]), [[0, 0], [1, 0], [1, 1], [0, 1]], pc);
        c.ext.quad([F.p(a[0], top + 0.55, a[1]), F.p(b[0], top + 0.55, b[1]), F.p(ib[0], top + 0.55, ib[1]), F.p(ia[0], top + 0.55, ia[1])], F.n(0, 1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], pc);
      }
      const flat = []; for (const p of inner) flat.push(p[0], p[1]);
      const tri = earcut(flat);
      for (let k = 0; k < tri.length; k += 3) {
        const [A, B, C] = [inner[tri[k]], inner[tri[k + 1]], inner[tri[k + 2]]];
        c.met.tri([F.p(A[0], top + 0.05, A[1]), F.p(B[0], top + 0.05, B[1]), F.p(C[0], top + 0.05, C[1])], F.n(0, 1, 0), [[A[0], A[1]], [B[0], B[1]], [C[0], C[1]]], rc);
      }
      const TF = { p: F.p, n: F.n };
      const nU = Math.min(4, Math.floor(lot.area / 120) + (r() < 0.6 ? 1 : 0));
      for (let k = 0, tries = 0; k < nU && tries < 20; tries++) {
        const ux = (r() - 0.5) * (o.w - 3), uz = (r() - 0.5) * (o.d - 3);
        if (!inRing(ux, uz, inner) || !inRing(ux + 1.1, uz + 1.1, inner) || !inRing(ux - 1.1, uz - 1.1, inner)) continue;
        k++;
        if (r() < 0.4 && h > 8) { c.ext.box(TF, ux, top + 0.05, uz, 2.0, 1.6, 2.0, ec.set('#c9cdd0').clone()); c.ext.box(TF, ux, top + 1.65, uz, 2.1, 0.12, 2.1, ec.set('#aeb4ba').clone()); }
        else c.ext.box(TF, ux, top + 0.05, uz, 1.0, 0.7, 0.6, ec.set('#d9dcdc').clone());
      }
      mainBody = { cx: 0, cz: 0, w: o.w, d: o.d };
    } else {
      // ---- pitched (or flat annexes): one body + roof per wing; eaves reach the footprint edge, walls stand under them
      const pitch0 = isWh ? 0.14 + r() * 0.06 : useKawara ? 0.42 + r() * 0.1 : 0.3 + r() * 0.1;
      const ridgeMain = lot.roof.ridge ? lot.roof.ridge === 'x' : o.w >= o.d;   // [v4:data] the ridge measured on the aerial photo
      const shedDir = r() < 0.5 ? 1 : -1;
      W.rects.forEach((rect, wi) => {
        if (isAnnex && wi === 0) return;
        const sides = outerSides(rect, W.rects);
        const flatW = shape === 'flat';
        const body = bodyOf(rect, sides, flatW ? 0 : over);
        if (isAnnex) grow(body, rect, sides, W.rects[0], 0.6);   // tuck the annex under the kit house's eave (no slot between)
        if (wi === 0) mainBody = body;
        const topW = flatW ? top : top;
        const x0 = body.cx - body.w / 2, x1 = body.cx + body.w / 2, z0 = body.cz - body.d / 2, z1 = body.cz + body.d / 2;
        // walls on the outside sides only (shared sides are inside the building)
        let u = u0 + wi * 3.1;
        if (sides.pz) u += faceQuad([x0, z1], [x1, z1], g0, topW, [0, 1], u);
        if (sides.px) u += faceQuad([x1, z1], [x1, z0], g0, topW, [1, 0], u);
        if (sides.nz) u += faceQuad([x1, z0], [x0, z0], g0, topW, [0, -1], u);
        if (sides.nx) u += faceQuad([x0, z0], [x0, z1], g0, topW, [-1, 0], u);
        if (flatW) {
          c.met.quad([F.p(x0, topW + 0.05, z1), F.p(x1, topW + 0.05, z1), F.p(x1, topW + 0.05, z0), F.p(x0, topW + 0.05, z0)], F.n(0, 1, 0), [[0, 0], [body.w, 0], [body.w, body.d], [0, body.d]], rc);
          return;
        }
        // roof frame: a along the ridge, b across; the rect is the eave outline
        const alongX = wi === 0 && !isAnnex ? ridgeMain : rect.w >= rect.d;
        const Lh = (alongX ? rect.w : rect.d) / 2, Dh = (alongX ? rect.d : rect.w) / 2;
        const RP = (a, y, b) => (alongX ? F.p(rect.cx + a, y, rect.cz + b) : F.p(rect.cx + b, y, rect.cz - a));
        const RN = (a, y, b) => (alongX ? F.n(a, y, b) : F.n(b, y, -a));
        // body extents in the roof frame
        const A0 = alongX ? x0 - rect.cx : rect.cz - z1, A1 = alongX ? x1 - rect.cx : rect.cz - z0;
        const B0 = alongX ? z0 - rect.cz : x0 - rect.cx, B1 = alongX ? z1 - rect.cz : x1 - rect.cx;
        const wShape = wi === 0 || shape === 'shed' || shape === 'saw' ? shape : shape === 'hip' ? 'hip' : 'gable';
        const pitch = pitch0;
        const eaveY = top - Math.min(over, Dh) * pitch;   // the roof meets the wall top under the eave
        if (wShape === 'gable' || wShape === 'hip' || wShape === 'saw' && !isWh) {
          const ridgeY = eaveY + Dh * pitch;
          const ridgeHalf = wShape === 'hip' ? Math.max(0.2, Lh - Dh) : Lh;
          const nrm = (s) => [0, 1 / Math.hypot(1, pitch), s * pitch / Math.hypot(1, pitch)];
          for (const s of [1, -1]) {
            const ns = nrm(s);
            RB.quad([RP(-Lh, eaveY, s * Dh), RP(Lh, eaveY, s * Dh), RP(ridgeHalf, ridgeY, 0), RP(-ridgeHalf, ridgeY, 0)], RN(ns[0], ns[1], ns[2]),
              [[-Lh / 1.1, 0], [Lh / 1.1, 0], [ridgeHalf / 1.1, Dh], [-ridgeHalf / 1.1, Dh]], rc);
            c.ext.quad([RP(-Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY, s * Dh), RP(-Lh, eaveY, s * Dh)], RN(0, 0, s), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
          }
          if (wShape === 'hip') {
            for (const s of [1, -1]) RB.tri([RP(s * Lh, eaveY, -Dh), RP(s * Lh, eaveY, Dh), RP(s * ridgeHalf, ridgeY, 0)], RN(s * 0.55, 0.83, 0), [[-Dh / 1.1, 0], [Dh / 1.1, 0], [0, Lh - ridgeHalf]], rc);
          } else {
            // gable ends in the wall colour (facade material so the window grid continues) + barge boards
            for (const [s, aW] of [[1, A1], [-1, A0]]) {
              const yb0 = eaveY + (Dh - Math.abs(B0)) * pitch, yb1 = eaveY + (Dh - Math.abs(B1)) * pitch;
              c.wall.quad([RP(aW, top, B0), RP(aW, top, B1), RP(aW, Math.max(top, yb1 - 0.12), B1), RP(aW, ridgeY - 0.12, 0)], RN(s, 0, 0), [[0, h], [B1 - B0, h], [B1 - B0, h + 0.2], [(B1 - B0) / 2, h + 2]], col, [STYLE.plain, fac[1], 99, 0]);
              c.wall.tri([RP(aW, top, B0), RP(aW, ridgeY - 0.12, 0), RP(aW, Math.max(top, yb0 - 0.12), B0)], RN(s, 0, 0), [[0, h], [(B1 - B0) / 2, h + 2], [0, h + 0.2]], col, [STYLE.plain, fac[1], 99, 0]);
              const xe = s * Lh;
              c.ext.quad([RP(xe, eaveY, Dh), RP(xe, eaveY - 0.12, Dh), RP(xe, ridgeY - 0.12, 0), RP(xe, ridgeY, 0)], RN(s, 0, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
              c.ext.quad([RP(xe, eaveY - 0.12, -Dh), RP(xe, eaveY, -Dh), RP(xe, ridgeY, 0), RP(xe, ridgeY - 0.12, 0)], RN(s, 0, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
            }
          }
          if (ridgeHalf > 0.3) c.ext.box({ p: (lx, y, lz) => RP(lx, y, lz), n: (a, b, c2) => RN(a, b, c2) }, 0, ridgeY - 0.05, 0, ridgeHalf * 2 + 0.1, 0.16, 0.26, ec.copy(rc).multiplyScalar(0.8));
        } else if (wShape === 'shed') {
          const rise = Math.min(1.6, Dh * 2 * 0.18), s = shedDir;
          RB.quad([RP(-Lh, eaveY, s * Dh), RP(Lh, eaveY, s * Dh), RP(Lh, eaveY + rise, -s * Dh), RP(-Lh, eaveY + rise, -s * Dh)], RN(0, 1, s * rise / (2 * Dh)), [[-Lh, 0], [Lh, 0], [Lh, 2 * Dh], [-Lh, 2 * Dh]], rc);
          // end walls: from the low eave (b = s Dh) up to the high one, following the roof underside
          const bLow = s > 0 ? B1 : B0, bHigh = s > 0 ? B0 : B1, yAt = (b) => eaveY + rise * (Dh - s * b) / (2 * Dh);
          for (const [e, aW] of [[1, A1], [-1, A0]]) c.wall.tri([RP(aW, top, bLow), RP(aW, top, bHigh), RP(aW, Math.max(top, yAt(bHigh) - 0.08), bHigh)], RN(e, 0, 0), [[0, h], [1, h], [1, h + 1]], col, [STYLE.plain, fac[1], 99, 0]);
          c.ext.quad([RP(-Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY - 0.14, s * Dh), RP(Lh, eaveY, s * Dh), RP(-Lh, eaveY, s * Dh)], RN(0, 0, s), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#e9e4d8'));
        } else if (wShape === 'saw') {
          const teeth = Math.max(2, Math.round(Dh * 2 / 7));
          for (let k = 0; k < teeth; k++) {
            const zA = -Dh + k * 2 * Dh / teeth, zB = zA + 2 * Dh / teeth, rise = 1.8;
            RB.quad([RP(-Lh, top, zA), RP(Lh, top, zA), RP(Lh, top + rise, zB), RP(-Lh, top + rise, zB)], RN(0, 1, -rise / (zB - zA)), [[-Lh, 0], [Lh, 0], [Lh, 2], [-Lh, 2]], rc);
            c.ext.quad([RP(-Lh, top, zB), RP(Lh, top, zB), RP(Lh, top + rise, zB), RP(-Lh, top + rise, zB)], RN(0, 0, 1), [[0, 0], [1, 0], [1, 1], [0, 1]], ec.set('#b9c7d2'));
          }
        }
      });
    }
    if (isAnnex) { n++; continue; }
    // extras, on the main wing's body
    const B = mainBody || { cx: 0, cz: 0, w: o.w, d: o.d };
    const TF = { p: (lx, y, lz) => F.p(B.cx + lx, y, B.cz + lz), n: F.n };
    const w = B.w, d = B.d;
    if (style === STYLE.shop) {
      ec.set(AWN[lot.seed % AWN.length]);
      const aw = Math.min(w - 0.4, 12), y0 = fy + 2.5;
      c.ext.quad([TF.p(-aw / 2, y0 - 0.45, d / 2 + 1.1), TF.p(aw / 2, y0 - 0.45, d / 2 + 1.1), TF.p(aw / 2, y0, d / 2), TF.p(-aw / 2, y0, d / 2)], F.n(0, 0.92, 0.39), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
      c.ext.quad([TF.p(-aw / 2, y0 - 0.7, d / 2 + 1.1), TF.p(aw / 2, y0 - 0.7, d / 2 + 1.1), TF.p(aw / 2, y0 - 0.45, d / 2 + 1.1), TF.p(-aw / 2, y0 - 0.45, d / 2 + 1.1)], F.n(0, 0, 1), [[0, 0], [1, 0], [1, 1], [0, 1]], ec);
    }
    if (style === STYLE.apartment && h > 5.5 && w > 5) {
      const floors = Math.floor(h / 2.9);
      ec.set('#e2ddd2');
      for (let fl = 1; fl < floors; fl++) {
        c.ext.box(TF, 0, fy + fl * 2.9 - 0.12, d / 2 + 0.5, w - 0.6, 0.14, 1.0, ec);
        c.ext.box(TF, 0, fy + fl * 2.9 + 0.02, d / 2 + 0.97, w - 0.6, 1.0, 0.06, ec.set(r() < 0.5 ? '#c9ccd1' : '#e8e6e0').clone());
      }
    }
    // AC units / water heaters on house side walls (tiny, read as texture from the air)
    if (style === STYLE.house && r() < 0.5) c.ext.box(TF, w / 2 - 0.9, fy + 0.1, d / 2 + 0.2, 0.8, 0.6, 0.3, ec.set('#e6e6e2').clone());
    // [v4:town-accuracy] the real name of a public building or a named shop on a board over its door
    if (names && lot.name) names.push({ lot, F: TF, w, d, fy, h, style });
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
