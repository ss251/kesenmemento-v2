// [v3:town] Mid-zone buildings (the fish-market district, 安波山's lower slopes, the ring around the inner bay):
// simplified but charming anime buildings on the real footprints: the OBB body with a procedural facade
// (facade.js: window grids, shopfronts, warehouse ribs + rust), real roof shapes with eaves (gable / hip / shed /
// flat with a parapet / saw-tooth) in the photo-sampled roof colour on kawara or metal textures, and a few cheap
// extras that read from the drone: shop awnings, apartment balcony slabs, rooftop tanks and AC units.
// Merged per 450 m chunk and per material (4 draw calls per chunk), kept out of the core batcher (custom attributes).
import * as THREE from 'three';
import { facadeMaterial, STYLE } from './facade.js';
import { pick, roofShapeAt, shedDirOf } from './common.js';
import { walllessOf, openShedPlan, SHED } from './openshed.js';   // [r2:4]
import { LOT_TOWER, towerLocal } from './signtower.js';   // [r2:12]
import { flatPaint } from './flatroof.js';   // [r2:3]
import { hasPlant, plantBoxes, plantPvRects, rectRing } from './roofplant.js';   // [r2:5]
import { planPv, PV, PVF, isFlushPv, pvRectToRoof, flushPvBlocks } from './pv.js';   // [sys:8] [r3:5]
import { carparkPlan, CARPARK } from './carpark.js';   // [v6:c6r3]
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
  box(Tf, cx, y0, cz, w, h, d, col, uvS = 1, noTop = false) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const P = (x, y, z) => Tf.p(x, y, z), N = (x, y, z) => Tf.n(x, y, z);
    const uvq = (a, b) => [[0, 0], [a / uvS, 0], [a / uvS, b / uvS], [0, b / uvS]];
    this.quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], N(0, 0, 1), uvq(w, h), col);
    this.quad([P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], N(0, 0, -1), uvq(w, h), col);
    this.quad([P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], N(1, 0, 0), uvq(d, h), col);
    this.quad([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], N(-1, 0, 0), uvq(d, h), col);
    if (!noTop) this.quad([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], N(0, 1, 0), uvq(w, d), col);
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

/** [r2:4] a wall-less shed (GSI 3111 / 3112): a thin mono-pitch roof slab on steel posts, no walls (openshed.js plans it). The edges and the underside
 *  go to the vertex-colour buffer, the top face to the roof one. Normals point away from the slab's centre. */
function openShed(c, F, lot, o, fy, g0, rc, ec, h) {
  const sp = openShedPlan(o.w, o.d, h, shedDirOf(lot));
  const P = (a, y, b) => (sp.alongX ? F.p(a, y, b) : F.p(b, y, a));
  const A = sp.L / 2, B = sp.D / 2, sd = sp.sd, yl = fy + sp.yLow, yh = fy + sp.yHigh, t = sp.t;
  const top = [P(-A, yl, sd * B), P(A, yl, sd * B), P(A, yh, -sd * B), P(-A, yh, -sd * B)], bot = top.map((q) => [q[0], q[1] - t, q[2]]);
  const mid = [0, 1, 2].map((k) => (top[0][k] + top[2][k] + bot[0][k] + bot[2][k]) / 4);
  const face = (buf, ps, col, uvs) => {
    const e1 = [ps[1][0] - ps[0][0], ps[1][1] - ps[0][1], ps[1][2] - ps[0][2]], e2 = [ps[2][0] - ps[0][0], ps[2][1] - ps[0][1], ps[2][2] - ps[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
    const q = [0, 1, 2].map((k) => (ps[0][k] + ps[2][k]) / 2);
    if (n[0] * (q[0] - mid[0]) + n[1] * (q[1] - mid[1]) + n[2] * (q[2] - mid[2]) < 0) n = n.map((v) => -v);
    buf.quad(ps, n, uvs, col);
  };
  const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
  face(c.met, top, rc, [[0, 0], [sp.L, 0], [sp.L, sp.D], [0, sp.D]]);
  face(c.ext, [bot[3], bot[2], bot[1], bot[0]], ec.set('#9aa0a6'), U);
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; face(c.ext, [bot[k], bot[k2], top[k2], top[k]], ec.set('#e9e4d8'), U); }
  // posts: square steel, from the lowest terrain of the footprint up to the underside of the slab
  const TF = { p: (lx, y, lz) => F.p(lx, y, lz), n: F.n }, post = ec.set(SHED.post0).clone();
  for (const q of sp.posts) { const [lx, lz] = sp.alongX ? [q.a, q.b] : [q.b, q.a]; c.ext.box(TF, lx, g0, lz, SHED.post, fy + q.y1 - g0, SHED.post, post, 1, true); }
}

/** [v6:c6r3] An open multi-storey car park (carpark.js plans it): a plinth where the hill falls away, a floor slab per deck with a fascia and a parapet
 *  round its edge, columns, and on the top deck the white stall lines and the parked cars. No walls, windows or ribs. Edges, undersides, columns,
 *  stall lines and cars go to the vertex-colour buffer (c.ext), the top deck's floor too, in the lot's roof colour (the metal-sheet material of c.met would rib it). */
function drawCarpark(c, F, lot, fy, g0, rc, ec) {
  const K = CARPARK, P = carparkPlan(lot), ring = P.ring, inner = P.inner, TF = { p: F.p, n: F.n };
  const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const conc = new THREE.Color(lot.wall), concLo = conc.clone().multiplyScalar(0.8), concHi = conc.clone().multiplyScalar(1.06);
  const floor = new THREE.Color(K.floorCol), under = new THREE.Color(K.underCol), lineC = new THREE.Color(K.lineCol), glass = new THREE.Color('#3c4150');
  const earFill = (pts, y, n, buf, col) => {
    const tri = earcut(pts.flat());
    for (let k = 0; k < tri.length; k += 3) { const [A, B, C2] = [pts[tri[k]], pts[tri[k + 1]], pts[tri[k + 2]]]; buf.tri([F.p(A[0], y, A[1]), F.p(B[0], y, B[1]), F.p(C2[0], y, C2[1])], n, [[A[0], A[1]], [B[0], B[1]], [C2[0], C2[1]]], col); }
  };
  const top = fy + P.top;
  // the ground deck: the floor on the plinth
  earFill(ring, fy + 0.02, F.n(0, 1, 0), c.ext, floor);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], ia = inner[i], ib = inner[(i + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1], le = Math.hypot(ex, ez) || 1;
    const n = [ez / le, -ex / le], fn = F.n(n[0], 0, n[1]), fi = F.n(-n[0], 0, -n[1]);
    if (fy - g0 > 0.05) c.ext.quad([F.p(a[0], g0, a[1]), F.p(b[0], g0, b[1]), F.p(b[0], fy + 0.02, b[1]), F.p(a[0], fy + 0.02, a[1])], fn, U, concLo);   // the retaining plinth
    for (const d of P.decks) {
      const y = fy + d.y;
      c.ext.quad([F.p(a[0], y - K.slab, a[1]), F.p(b[0], y - K.slab, b[1]), F.p(b[0], y + K.parapet, b[1]), F.p(a[0], y + K.parapet, a[1])], fn, U, conc);   // fascia + spandrel
      c.ext.quad([F.p(ib[0], y + 0.05, ib[1]), F.p(ia[0], y + 0.05, ia[1]), F.p(ia[0], y + K.parapet, ia[1]), F.p(ib[0], y + K.parapet, ib[1])], fi, U, concLo);   // the parapet's inner face
      c.ext.quad([F.p(a[0], y + K.parapet, a[1]), F.p(b[0], y + K.parapet, b[1]), F.p(ib[0], y + K.parapet, ib[1]), F.p(ia[0], y + K.parapet, ia[1])], F.n(0, 1, 0), U, concHi);   // the cap
    }
  }
  for (const d of P.decks) {
    const y = fy + d.y;
    earFill(ring, y - K.slab, F.n(0, -1, 0), c.ext, under);   // the underside the lower deck looks up at
    if (d.k === P.n) earFill(inner, y + 0.05, F.n(0, 1, 0), c.ext, rc);   // the top deck: the lot's roof colour as paint (flat, no metal-sheet ribs)
    else earFill(inner, y + 0.05, F.n(0, 1, 0), c.ext, floor);
  }
  for (const [x, z] of P.columns) c.ext.box(TF, x, fy, z, K.column, top - K.slab - fy, K.column, conc, 1, true);
  const ly = top + 0.085;
  for (const l of P.lines) c.ext.quad([F.p(l.cx - l.w / 2, ly, l.cz + l.d / 2), F.p(l.cx + l.w / 2, ly, l.cz + l.d / 2), F.p(l.cx + l.w / 2, ly, l.cz - l.d / 2), F.p(l.cx - l.w / 2, ly, l.cz - l.d / 2)], F.n(0, 1, 0), U, lineC);
  for (const car of P.cars) {
    const body = new THREE.Color(car.color), alongZ = car.nose[1] !== 0, y0 = top + 0.2;
    c.ext.box(TF, car.cx, y0, car.cz, car.w, 0.55, car.d, body);
    const cw = alongZ ? car.w * 0.9 : car.w * 0.5, cd = alongZ ? car.d * 0.5 : car.d * 0.9;   // the cabin sits a little behind the middle
    const ox = car.cx - car.nose[0] * 0.3, oz = car.cz - car.nose[1] * 0.3;
    c.ext.box(TF, ox, y0 + 0.55, oz, cw, 0.45, cd, glass, 1, true);
    c.ext.box(TF, ox, y0 + 1.0, oz, cw * 0.96, 0.07, cd * 0.96, body);
  }
}

export function styleOf(lot, main) {
  if (lot.facade && STYLE[lot.facade] != null) return STYLE[lot.facade];   // [v4:overrides] a facade style read from the imagery
  const k = lot.kind;
  if (k === 'carpark') return STYLE.plain;   // [v6:c6r3] an open deck: no ribs or windows (mid draws it in drawCarpark; far shows a plain box)
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
  const kawara = H.M.kawara, metal = H.M.metal, vc = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, noDormant: true });   // [r3:7]
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
    // [sys:6] ground: the floor is lot.groundY (tmax - height + 0.6, within Pmax of the lowest terrain: build-layout.js) and the
    // lot's lowest terrain is lot.baseY: where they differ, a concrete plinth / retaining wall fills baseY - 0.3 .. groundY
    const base0 = Math.min(lot.baseY ?? lot.groundY, lot.groundY);
    const g0 = base0 - 0.3, fy = lot.groundY + 0.1;
    const plinth = fy - g0 > 0.75, gw = plinth ? fy - 0.1 : g0;   // gw: where the facade (windows) starts
    const top = fy + h;
    const c = get(o.cx, o.cz);
    // [v6:c6r3] an open multi-storey car park: decks, parapets, columns, stall lines and cars (OSM building=parking)
    if (lot.kind === 'carpark' && !isAnnex) { drawCarpark(c, F, lot, fy, g0, rc.set(flatPaint(flatRoofOf(lot))), ec); stats.flat++; n++; continue; }
    // [r2:4] a wall-less shed is a roof on posts (the lot polygon does not matter: it is under 100 m2)
    if (walllessOf(lot) && !isAnnex) { openShed(c, F, lot, o, fy, g0, rc.set(pitchedRoofOf(lot)), ec, lot.height || 3.4); stats.shed++; n++; continue; }
    col.set(wallOf(lot));
    const nearSea = isWh && L.shoreDist(o.cx, o.cz) > -90;
    const fac = [style, (lot.seed % 997) / 997, h, nearSea ? 0.4 + r() * 0.6 : 0];
    const u0 = (lot.seed % 13) * 0.37;
    // roof shape (measured shapes are kept, [v4:data])
    // [sys:4] the shape is the lot's own (a derived one was resolved once in build-layout.js); only geometry changes it here
    let shape = roofShapeAt(lot, 'mid', { isWh });
    // [v4:polish1] a big curved or many-sided footprint (too many corners for the rectilinear wings) that fills less than
    // 0.8 of its oriented box is built flat on its true polygon, not as the box (the accuracy audit's t12: curved blocks
    // drawn as boxes)
    const oddBig = !isAnnex && W.simple && W.rect < 0.8 && lot.area >= 250;
    if (oddBig) shape = 'flat';
    const colMeasured = lot.src?.color === 'aerial' || lot.src?.color === 'osm' || lot.src?.color === 'landmark' || lot.src?.color === 'override';   // [v4:overrides]
    let roofCol = shape === 'flat' ? flatPaint(flatRoofOf(lot)) : pitchedRoofOf(lot);   // [r2:3] a flat top renders about 3.5 L* lighter than painted
    if (isWh && shape !== 'flat' && !colMeasured && r() < 0.5) roofCol = pick(r, ['#56677a', '#4a78a0', '#8e4540', '#7b8691', '#6f8f8a']);   // [v4:data] measured colours stay
    rc.set(roofCol);
    // [v4:town-accuracy] 瓦 only where the photo shows a tile colour (grey / charcoal / black / brown); painted metal otherwise
    const useKawara = !isWh && (shape === 'gable' || shape === 'hip') && kawaraColour(roofCol) && r() < 0.8;
    const RB = useKawara ? c.kaw : c.met;
    stats[shape] = (stats[shape] || 0) + 1;
    const over = isWh ? 0.35 : useKawara ? 0.55 : 0.45;
    const plinthCol = new THREE.Color('#b7b4aa');
    const faceQuad = (a, b, y0, y1, n, uStart, fcol = col, ffac = fac) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (plinth && y0 === gw) c.ext.quad([F.p(a[0], g0, a[1]), F.p(b[0], g0, b[1]), F.p(b[0], gw + 0.02, b[1]), F.p(a[0], gw + 0.02, a[1])], F.n(n[0], 0, n[1]), [[0, 0], [1, 0], [1, 1], [0, 1]], plinthCol);
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
        u += faceQuad(a, b, gw, top + 0.55, n, u);
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
      // [sys:8] solar module rows where the imagery shows a PV roof (lot.roof.pv, override data); the random rooftop units otherwise
      const plantOn = hasPlant(lot);   // [r2:5] a measured rooftop plant spec: drawn exactly, the random boxes are skipped
      const pvRows = [...(lot.roof.pv ? planPv(inner.map(([lx, lz]) => { const q = F.p(lx, 0, lz); return [q[0], q[2]]; }), lot.roof.pv) : []),
        ...(plantOn ? plantPvRects(lot.roof.plant).flatMap((rc2) => planPv(rectRing(rc2).map(([lx, lz]) => { const q = F.p(lx, 0, lz); return [q[0], q[2]]; }), { share: 1, side: 'all' }, { margin: 0.3 })) : [])];
      if (plantOn) for (const b of plantBoxes(lot.roof.plant)) c.ext.box(TF, b.x, top + 0.05 + b.y0, b.z, b.w, b.h, b.d, ec.set(b.color).clone());
      if (pvRows.length) {
        const dk = new THREE.Color(PV.dark), fr = new THREE.Color(PV.frame), ny = Math.cos(PV.tilt), nz = Math.sin(PV.tilt), dy = PV.depth * Math.tan(PV.tilt), nn = [0, ny, nz];
        const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]], ins = 0.05;
        for (const rw of pvRows) {
          const ys = top + 0.14, yn = ys + dy;
          c.ext.quad([[rw.x0, ys, rw.z1], [rw.x1, ys, rw.z1], [rw.x1, yn, rw.z0], [rw.x0, yn, rw.z0]], nn, uvq, fr);
          const e = 0.006;
          c.ext.quad([[rw.x0 + ins, ys + ins * Math.tan(PV.tilt) + e, rw.z1 - ins], [rw.x1 - ins, ys + ins * Math.tan(PV.tilt) + e, rw.z1 - ins], [rw.x1 - ins, yn - ins * Math.tan(PV.tilt) + e, rw.z0 + ins], [rw.x0 + ins, yn - ins * Math.tan(PV.tilt) + e, rw.z0 + ins]], nn, uvq, dk);
        }
        stats.pv = (stats.pv || 0) + pvRows.length;
      } else if (!plantOn) {
        const nU = Math.min(4, Math.floor(lot.area / 120) + (r() < 0.6 ? 1 : 0));
        for (let k = 0, tries = 0; k < nU && tries < 20; tries++) {
          const ux = (r() - 0.5) * (o.w - 3), uz = (r() - 0.5) * (o.d - 3);
          if (!inRing(ux, uz, inner) || !inRing(ux + 1.1, uz + 1.1, inner) || !inRing(ux - 1.1, uz - 1.1, inner)) continue;
          k++;
          if (r() < 0.4 && h > 8) { c.ext.box(TF, ux, top + 0.05, uz, 2.0, 1.6, 2.0, ec.set('#c9cdd0').clone()); c.ext.box(TF, ux, top + 1.65, uz, 2.1, 0.12, 2.1, ec.set('#aeb4ba').clone()); }
          else c.ext.box(TF, ux, top + 0.05, uz, 1.0, 0.7, 0.6, ec.set('#d9dcdc').clone());
        }
      }
      mainBody = { cx: 0, cz: 0, w: o.w, d: o.d };
    } else {
      // ---- pitched (or flat annexes): one body + roof per wing; eaves reach the footprint edge, walls stand under them
      const pitch0 = isWh ? 0.14 + r() * 0.06 : useKawara ? 0.42 + r() * 0.1 : 0.3 + r() * 0.1;
      const ridgeMain = lot.roof.ridge ? lot.roof.ridge === 'x' : o.w >= o.d;   // [v4:data] the ridge measured on the aerial photo
      r(); const shedDir = shedDirOf(lot);   // [sys:4] the slope is the lot's own (the draw stays for the rng stream)
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
        if (sides.pz) u += faceQuad([x0, z1], [x1, z1], gw, topW, [0, 1], u);
        if (sides.px) u += faceQuad([x1, z1], [x1, z0], gw, topW, [1, 0], u);
        if (sides.nz) u += faceQuad([x1, z0], [x0, z0], gw, topW, [0, -1], u);
        if (sides.nx) u += faceQuad([x0, z0], [x0, z1], gw, topW, [-1, 0], u);
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
          // [r3:5] solar blocks lying in the roof plane (lot.roof.pv = { flush, rects, ridgeAt }: Earth shows gridded arrays on pitched roofs; the flat-roof rack is not used here)
          if (isFlushPv(lot.roof.pv)) {
            const spec = lot.roof.pv, mine = spec.rects.filter((q) => Math.abs(q.x - rect.cx) <= rect.w / 2 + 0.5 && Math.abs(q.z - rect.cz) <= rect.d / 2 + 0.5);
            const blocks = flushPvBlocks(mine.map((q) => pvRectToRoof(q, { x: rect.cx, z: rect.cz }, alongX, spec.ridgeAt ?? null)), { Lh, Dh, rl: ridgeHalf, pitch });
            const dk = new THREE.Color(PVF.dark), fr2 = new THREE.Color(PVF.frame), uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
            const yAt = (t, dy) => ridgeY - t * pitch + dy;
            for (const bk of blocks) {
              const ns = nrm(bk.s), N = RN(ns[0], ns[1], ns[2]), s = bk.s;
              const Q = (a0, a1, t0, t1, dy) => [RP(a0, yAt(t1, dy), s * t1), RP(a1, yAt(t1, dy), s * t1), RP(a1, yAt(t0, dy), s * t0), RP(a0, yAt(t0, dy), s * t0)];
              c.ext.quad(Q(bk.a0 - PVF.edge, bk.a1 + PVF.edge, bk.t0 - PVF.edge, bk.t1 + PVF.edge, PVF.lift * 0.5), N, uvq, fr2);
              for (const cl of bk.cells) c.ext.quad(Q(cl.a0, cl.a1, cl.t0, cl.t1, PVF.lift), N, uvq, dk);
              stats.pv = (stats.pv || 0) + bk.cells.length;
            }
          }
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
    // [r2:12] the AEON sign tower seen from afar: the beige stair block and the magenta sign box over the roof deck (the logos are hero detail)
    if (LOT_TOWER[lot.id] && shape === 'flat') {
      const tw = LOT_TOWER[lot.id], tf = { p: (lx, y, lz) => F.p(lx, y, lz), n: F.n }, tl = towerLocal(tw, o.cx, o.cz, o.rotY);
      c.ext.box(tf, tl.x, top + 0.55, tl.z, tw.w * 0.92, tw.baseH, tw.d * 0.92, ec.set(tw.body).clone());
      c.ext.box(tf, tl.x, top + 0.55 + tw.baseH, tl.z, tw.w, tw.signH, tw.d, ec.set(tw.color).clone());
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
