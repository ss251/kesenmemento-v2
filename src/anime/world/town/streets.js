// [v3:town] Streets from the real GSI road centre-lines (layout ROADS, hero + mid):
//   * asphalt ribbons draped on the terrain (Sakura's hand-painted asphalt, per-section tone, wheel tracks, grimy
//     edges) + junction fillets at every node, cut where a road runs over the sea;
//   * hero: raised paver sidewalks with granite curbs on the wide streets (cut at junctions, building fronts and the
//     sea), yellow tactile paving at crossings; concrete gutter covers (側溝) and white edge lines on the narrow ones;
//   * markings: centre lines (white dashed / yellow solid), edge lines, zebra crossings with stop lines, 止まれ
//     glyphs + stop lines on minor approaches, manholes and repair patches;
//   * furniture (Sakura's street kit): 止まれ / 30 / 駐車禁止 / crossing signs, blue guide signs, convex mirrors at
//     narrow T-junctions, guardrails where the road edge drops away.
// Publishes ctx.services.street = { edges, gutters, walkPaths, crosswalks, junctions }.
import { sharedHardShores } from '../layout/hardshore.js';   // [v3:fix]
import * as THREE from 'three';
import { MeshBuilder } from './sakura/street_mesh.js';
import { makeStreetTextures, GLYPH, UTIL, SIGN, uvOf } from './sakura/street_textures.js';
import { buildFurniture } from './sakura/street_furniture.js';
import { resample, polyLength, clamp } from './common.js';

const ATILE = 4.0;
const CURB = 0.15;
const UP = [0, 1, 0];

export function buildStreets(ctx, { lotIdx, roadIdx, roads, heroZone }) {
  const { L, mat, physics } = ctx;
  const root = new THREE.Group(); root.name = 'town-streets';
  const T = makeStreetTextures(ctx);
  const M = {
    asphalt: mat.toon('#ffffff', { map: T.asphalt, vertexColors: true, paint: 0.03, polygonOffset: -1 }),
    pavers: mat.toon('#dcd8d2', { map: T.pavers, paint: 0.035 }),
    curb: mat.toon('#ffffff', { map: T.curb, paint: 0.03 }),
    lgutter: mat.toon('#ffffff', { map: T.lid, paint: 0.03, polygonOffset: -2 }),
    dots: mat.toon('#ffffff', { map: T.dots, paint: 0.02, polygonOffset: -2 }),
    bars: mat.toon('#ffffff', { map: T.bars, paint: 0.02, polygonOffset: -2 }),
    line: mat.decal('#ffffff', { map: T.line, vertexColors: true }),
    glyph: mat.decal('#ffffff', { map: T.glyphs, vertexColors: true }),
    util: mat.decal('#ffffff', { map: T.util }),
  };
  const F = buildFurniture(ctx, root, T, { baseLift: () => 0 });
  const out = { edges: [], gutters: [], walkPaths: [], walkKinds: [], crosswalks: [], junctions: [], stops: [], signs: 0, mirrors: 0, guardrails: 0 };
  const hr = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const inHero = (x, z) => Math.hypot(x - heroZone.cx, z - heroZone.cz) < heroZone.r + 40;
  const water = (x, z) => L.shoreDist(x, z) > 0.8;
  const LIFT = (x, z) => (inHero(x, z) ? 0.05 : 0.14);
  const roadY = (x, z) => L.heightAt(x, z) + LIFT(x, z);

  // ------------------------------------------------------------------ graph (nodes at shared endpoints)
  const nk = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  const nodes = new Map();
  for (const r of roads) for (const [p, end] of [[r.pts[0], 0], [r.pts[r.pts.length - 1], 1]]) {
    const k = nk(p); let n = nodes.get(k);
    if (!n) nodes.set(k, (n = { x: p[0], z: p[1], roads: [], maxW: 0 }));
    n.roads.push({ r, end }); n.maxW = Math.max(n.maxW, r.width);
  }
  for (const n of nodes.values()) {
    n.deg = n.roads.length;
    n.R = n.deg >= 3 ? n.maxW / 2 * 1.1 + 0.4 : n.maxW / 2;
  }
  const nodeAt = (r, end) => nodes.get(nk(end ? r.pts[r.pts.length - 1] : r.pts[0]));
  const sidewalkOf = (r) => (r.zone !== 'hero' || r.kind === 'alley' || r.kind === 'bridge' || r.width < 7.5) ? 0 : r.width >= 11 ? 2.5 : r.width >= 9 ? 2.0 : 1.5;

  // ------------------------------------------------------------------ builders
  const roadB = new MeshBuilder(true), paverB = new MeshBuilder(), curbB = new MeshBuilder(), gutB = new MeshBuilder();
  const lineB = new MeshBuilder(true), glyphB = new MeshBuilder(true), utilB = new MeshBuilder(), dotsB = new MeshBuilder(), barsB = new MeshBuilder();
  const WHITE = [0.93, 0.93, 0.9], YEL = [0.92, 0.74, 0.28];

  /** flat strip along samples between lateral offsets o0..o1 (world y from fn), into builder B with uv mode */
  function strip(B, S, o0, o1, yfn, uvfn, colfn, want = UP) {
    let prev = null;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s) { prev = null; continue; }
      const nx = -s.tz, nz = s.tx;
      const a = [s.x + nx * o0, s.z + nz * o0], b = [s.x + nx * o1, s.z + nz * o1];
      const ia = B.vert(a[0], yfn(a[0], a[1], o0, s), a[1], ...uvfn(a, o0, s), UP, colfn ? colfn(o0, s) : null);
      const ib = B.vert(b[0], yfn(b[0], b[1], o1, s), b[1], ...uvfn(b, o1, s), UP, colfn ? colfn(o1, s) : null);
      if (prev) B.quad(prev[0], prev[1], ib, ia, want);
      prev = [ia, ib];
    }
  }
  /** split samples into runs where keep(s, i) holds (null breaks) */
  const runs = (S, keep) => S.map((s, i) => (keep(s, i) ? s : null));

  let asphaltLen = 0;
  for (const r of roads) {
    const hero = r.zone === 'hero';
    const step = hero ? 2.0 : 4.0;
    const S = resample(r.pts, step);
    if (S.length < 2) continue;
    const hw = r.width / 2, sw = sidewalkOf(r), cw = hw - sw;
    const len = S[S.length - 1].s;
    asphaltLen += len;
    const seed = hr(r.width, S[0].x * 0.01 + S[0].z * 0.013) * 100;
    // ---- carriageway (lateral samples so the ribbon drapes on the terrain)
    const lats = cw > 3.2 ? [-cw, -cw * 0.55, -cw * 0.25, 0, cw * 0.25, cw * 0.55, cw] : [-cw, 0, cw];
    const tone = (o, s) => {
      const sec = 0.95 + 0.1 * hr(seed, Math.floor(s.s / 32));
      const a = Math.abs(o) / Math.max(0.5, cw);
      const track = 1 - 0.045 * Math.max(0, 1 - Math.abs(a - 0.5) / 0.18);
      const edge = 1 - 0.08 * clamp((a - 0.82) / 0.18, 0, 1);
      const m = sec * track * edge * (r.kind === 'alley' ? 1.04 : 1) * (hero ? 1 : 0.84);
      return [m, m * 0.998, m * 1.01];
    };
    const Sw = runs(S, (s) => !water(s.x, s.z));
    for (let j = 0; j < lats.length - 1; j++) strip(roadB, Sw, lats[j], lats[j + 1], (x, z) => roadY(x, z), (p) => [p[0] / ATILE, -p[1] / ATILE], tone);

    if (!hero) {
      // mid: cheap markings only on the wider roads
      if (r.width >= 7) markCentre(r, S, cw, hw, false);
      continue;
    }
    // ---- sidewalks + curbs
    const startN = nodeAt(r, 0), endN = nodeAt(r, 1);
    const nearJunction = (s) => (startN && startN.deg >= 3 && s.s < startN.R + 0.8) || (endN && endN.deg >= 3 && len - s.s < endN.R + 0.8);
    const nearJunctionEnd = (s) => (startN && startN.deg >= 3 && s.s < startN.R + 3.5) || (endN && endN.deg >= 3 && len - s.s < endN.R + 3.5);
    if (sw > 0) {
      for (const side of [-1, 1]) {
        const keep = (s) => {
          if (nearJunction(s)) return false;
          const nx = -s.tz * side, nz = s.tx * side;
          const px = s.x + nx * (cw + sw / 2), pz = s.z + nz * (cw + sw / 2);
          if (water(px, pz) || water(s.x + nx * hw, s.z + nz * hw)) return false;
          if (roadIdx.covering(px, pz, -0.4, r).some((o) => o.kind !== 'alley' || o.width > 3.5)) return false;
          if (lotIdx.at(px, pz, -0.2)) return false;
          return true;
        };
        const K = runs(S, keep);
        // drop runs shorter than 3 samples
        for (let i = 0; i < K.length; i++) if (K[i] && (!K[i - 1] && (!K[i + 1] || !K[i + 2]))) K[i] = null;
        const o0 = side * cw, o1 = side * hw;
        const lo = Math.min(o0, o1), hi = Math.max(o0, o1);
        const top = (x, z) => roadY(x, z) + CURB;
        // paver top (u across, v along; 1.6 m tile)
        strip(paverB, K, lo + (side < 0 ? 0 : 0.18), hi - (side < 0 ? 0.18 : 0), top, (p, o, s) => [o / 1.6, s.s / 1.6]);
        // curb top (0.18 wide) and curb face (vertical, facing the road)
        const co0 = side < 0 ? o0 - 0.18 : o0, co1 = side < 0 ? o0 : o0 + 0.18;
        strip(curbB, K, co0, co1, (x, z) => top(x, z) + 0.01, (p, o, s) => [s.s / 1.2, 0.56 + 0.4 * (o === co0 ? 0 : 1)]);
        // curb face quads + outer skirt + walk boxes, per run
        let run = [];
        const flush = () => {
          if (run.length < 2) { run = []; return; }
          const pl = [];
          for (let i = 0; i < run.length; i++) {
            const s = run[i], nx = -s.tz * side, nz = s.tx * side;
            const ex = s.x + nx * cw, ez = s.z + nz * cw;
            const yb = roadY(ex, ez) - 0.02, yt = top(ex, ez) + 0.01;
            s._c = [curbB.vert(ex, yb, ez, s.s / 1.2, 0, [-nx, 0, -nz]), curbB.vert(ex, yt, ez, s.s / 1.2, 0.45, [-nx, 0, -nz])];
            const ox = s.x + nx * hw, oz = s.z + nz * hw;
            s._o = [curbB.vert(ox, L.heightAt(ox, oz) - 0.3, oz, s.s / 1.2, 0.6, [nx, 0, nz]), curbB.vert(ox, top(ox, oz), oz, s.s / 1.2, 0.9, [nx, 0, nz])];
            if (i) {
              const p = run[i - 1];
              curbB.quad(p._c[0], s._c[0], s._c[1], p._c[1], [-nx, 0, -nz]);
              curbB.quad(p._o[0], s._o[0], s._o[1], p._o[1], [nx, 0, nz]);
            }
            pl.push([s.x + nx * (cw + sw / 2), s.z + nz * (cw + sw / 2)]);
          }
          // end caps
          for (const s of [run[0], run[run.length - 1]]) {
            const nx = -s.tz * side, nz = s.tx * side;
            const a = [s.x + nx * cw, s.z + nz * cw], b = [s.x + nx * hw, s.z + nz * hw];
            const dirn = s === run[0] ? [-s.tx, 0, -s.tz] : [s.tx, 0, s.tz];
            const i0 = curbB.vert(a[0], roadY(...a) - 0.02, a[1], 0, 0, dirn), i1 = curbB.vert(b[0], roadY(...b) - 0.02, b[1], 0.5, 0, dirn);
            const i2 = curbB.vert(b[0], top(...b), b[1], 0.5, 0.45, dirn), i3 = curbB.vert(a[0], top(...a), a[1], 0, 0.45, dirn);
            curbB.quad(i0, i1, i2, i3, dirn);
            // tactile warning blocks at crossings
            if (nearJunctionEnd(s)) {
              const k = s === run[0] ? 1 : -1;
              const w0 = sw - 0.35;
              const c0 = [a[0] + nx * 0.2, a[1] + nz * 0.2], c1 = [a[0] + nx * (0.2 + w0), a[1] + nz * (0.2 + w0)];
              const d0 = [c0[0] + s.tx * 0.6 * k, c0[1] + s.tz * 0.6 * k], d1 = [c1[0] + s.tx * 0.6 * k, c1[1] + s.tz * 0.6 * k];
              const P = [c0, c1, d1, d0].map((p) => dotsB.vert(p[0], top(...p) + 0.012, p[1], 0, 0));
              dotsB.uv.splice(dotsB.uv.length - 8, 8, 0, 0, w0 / 0.3, 0, w0 / 0.3, 2, 0, 2);
              dotsB.quad(P[0], P[1], P[2], P[3]);
            }
          }
          // guide bars along wide sidewalks
          if (sw >= 2.4 && run.length > 4) {
            const bo = side * (cw + sw - 0.75);
            strip(barsB, run.map((s) => s), bo - 0.15, bo + 0.15, (x, z) => top(x, z) + 0.012, (p, o, s) => [(o - bo + 0.15) / 0.3, s.s / 0.3]);
          }
          // physics: walkable tops in ~6 m pieces
          for (let i = 0; i < run.length - 1; i += 3) {
            const a = run[i], b = run[Math.min(run.length - 1, i + 3)];
            const nx = -a.tz * side, nz = a.tx * side;
            const cx = (a.x + b.x) / 2 + nx * (cw + sw / 2), cz = (a.z + b.z) / 2 + nz * (cw + sw / 2);
            const l = Math.hypot(b.x - a.x, b.z - a.z) + 0.3;
            physics.addWalkBox(cx, cz, sw, l, Math.atan2(a.tx, a.tz), top(cx, cz) - 0.0, top(cx, cz) - 0.6);
          }
          out.walkPaths.push(pl); out.walkKinds.push(sw >= 2 ? 'sidewalk' : 'narrowSidewalk');
          out.edges.push({ a: pl[0], b: pl[pl.length - 1], kind: 'curb' });
          run = [];
        };
        for (const s of K) { if (s) run.push(s); else flush(); }
        flush();
      }
    } else {
      // ---- narrow streets: concrete gutter covers along both edges (側溝の蓋) + white edge lines
      for (const side of [-1, 1]) {
        const keep = (s) => {
          if (nearJunction(s)) return false;
          const nx = -s.tz * side, nz = s.tx * side, px = s.x + nx * (hw - 0.2), pz = s.z + nz * (hw - 0.2);
          if (water(px, pz)) return false;
          if (roadIdx.covering(px, pz, -0.3, r).length) return false;
          return true;
        };
        const K = runs(S, keep);
        if (r.width >= 3.2) strip(gutB, K, side < 0 ? -hw : hw - 0.42, side < 0 ? -hw + 0.42 : hw, (x, z) => roadY(x, z) + 0.012, (p, o, s) => [s.s / 1.0, (o - (side < 0 ? -hw : hw - 0.42)) / 0.42 * 0.8 + 0.1]);
        if (r.width >= 4.2) { const e = side * (hw - 0.65); strip(lineB, K, e - 0.07, e + 0.07, (x, z) => roadY(x, z) + 0.02, (p, o, s) => [s.s / 0.8, (o - e) / 0.8], () => WHITE); }
        // walk path 1 m in from the edge
        let pl = [];
        for (const s of K) { if (s) { const nx = -s.tz * side, nz = s.tx * side; pl.push([s.x + nx * (hw - 0.9), s.z + nz * (hw - 0.9)]); } else { if (pl.length > 3) { out.walkPaths.push(pl); out.walkKinds.push('edge'); } pl = []; } }
        if (pl.length > 3) { out.walkPaths.push(pl); out.walkKinds.push('edge'); }
        out.gutters.push({ roadId: r.id, side, w: 0.42 });
      }
    }
    // ---- markings on the carriageway
    if (cw * 2 >= 5.4) markCentre(r, S, cw, hw, true);
    if (sw > 0) for (const side of [-1, 1]) {
      const e = side * (cw - 0.3);
      const K = runs(S, (s) => !nearJunction(s) && !roadIdx.covering(s.x - s.tz * e, s.z + s.tx * e, -0.3, r).length && !water(s.x, s.z));
      strip(lineB, K, e - 0.075, e + 0.075, (x, z) => roadY(x, z) + 0.02, (p, o, s) => [s.s / 0.8, (o - e) / 0.8], () => WHITE);
    }
    // manholes + repair patches
    for (let s = 12 + hr(seed, 3) * 20; s < len - 8; s += 34 + hr(seed, s) * 18) {
      const p = pointAtS(S, s); if (!p || water(p.x, p.z)) continue;
      const lat = r.width > 5 ? (hr(seed, s * 3) - 0.5) * cw : 0;
      const cx = p.x - p.tz * lat, cz = p.z + p.tx * lat;
      const cell = [UTIL.manholeA, UTIL.manholeB, UTIL.manholeC][Math.floor(hr(seed, s) * 3)];
      decalQuad(utilB, cx, cz, p.tx, p.tz, 0.62, 0.62, cell, roadY(cx, cz) + 0.025);
      if (hr(seed, s + 7) < 0.3) { const px = p.x + p.tz * cw * 0.4, pz = p.z - p.tx * cw * 0.4; decalQuad(utilB, px, pz, p.tx, p.tz, 1.6 + hr(seed, s) * 1.5, 1.2, [UTIL.patchA, UTIL.patchB, UTIL.patchC][Math.floor(hr(seed, s + 2) * 3)], roadY(px, pz) + 0.022); }
    }
  }


  // ------------------------------------------------------------------ centre lines
  function markCentre(r, S, cw, hw, hero) {
    const startN = nodeAt(r, 0), endN = nodeAt(r, 1), len = S[S.length - 1].s;
    const solid = hero && cw * 2 >= 8.5;
    const K = runs(S, (s) => !((startN && startN.deg >= 3 && s.s < startN.R + 3) || (endN && endN.deg >= 3 && len - s.s < endN.R + 3)) && !water(s.x, s.z) && !roadIdx.covering(s.x, s.z, -0.5, r).length);
    if (solid) { strip(lineB, K, -0.08, 0.08, (x, z) => roadY(x, z) + 0.02, (p, o, s) => [s.s / 0.8, o / 0.8], () => YEL); return; }
    // dashed: 5 m on, 5 m off
    const D = K.map((s) => (s && (Math.floor(s.s / 5) % 2 === 0) ? s : null));
    strip(lineB, D, -0.075, 0.075, (x, z) => roadY(x, z) + 0.02, (p, o, s) => [s.s / 0.8, o / 0.8], () => WHITE);
  }

  function pointAtS(S, s) { for (let i = 1; i < S.length; i++) if (S[i].s >= s) { const a = S[i - 1], b = S[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz }; } return null; }
  /** textured quad on the ground: along = (tx,tz), w across, l along, atlas cell */
  function decalQuad(B, cx, cz, tx, tz, w, l, cell, y, col = null, rot = 0) {
    const nx = -tz, nz = tx;
    const ax = Math.cos(rot) * tx - Math.sin(rot) * nx, az = Math.cos(rot) * tz - Math.sin(rot) * nz, bx = -az, bz = ax;
    const P = [[-w / 2, -l / 2, 0, 0], [w / 2, -l / 2, 1, 0], [w / 2, l / 2, 1, 1], [-w / 2, l / 2, 0, 1]].map(([u, v, cu, cv]) => {
      const x = cx + bx * u + ax * v, z = cz + bz * u + az * v;
      const uv = uvOf(cell, cu, cv);
      return B.vert(x, y ?? roadY(x, z) + 0.025, z, uv[0], uv[1], UP, col);
    });
    B.quad(P[0], P[1], P[2], P[3]);
  }

  // ------------------------------------------------------------------ junctions: fillets, crossings, stop lines
  for (const n of nodes.values()) {
    const hero = inHero(n.x, n.z);
    if (water(n.x, n.z)) continue;
    if (n.deg >= 2 || n.maxW > 5) {
      // fan disc (draped)
      const seg = n.R > 5 ? 18 : 10, R = n.R + 0.1;
      const dk = hero ? 1 : 0.84;
      const c = roadB.vert(n.x, roadY(n.x, n.z), n.z, n.x / ATILE, -n.z / ATILE, UP, [0.97 * dk, 0.97 * dk, 0.98 * dk]);
      const ring = [];
      for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2, x = n.x + Math.cos(a) * R, z = n.z + Math.sin(a) * R; ring.push(roadB.vert(x, roadY(x, z) - 0.004, z, x / ATILE, -z / ATILE, UP, [0.96 * dk, 0.96 * dk, 0.97 * dk])); }
      for (let i = 0; i < seg; i++) roadB.tri(c, ring[i], ring[(i + 1) % seg]);
    }
    if (!hero || n.deg < 3) continue;
    out.junctions.push({ x: n.x, z: n.z, R: n.R, deg: n.deg });
    const widest = Math.max(...n.roads.map((q) => q.r.width));
    for (const { r, end } of n.roads) {
      const pts = end ? r.pts.slice().reverse() : r.pts;
      const S = resample(pts, 1.0); if (S.length < 3) continue;
      const len = S[S.length - 1].s;
      const hw = r.width / 2, sw = sidewalkOf(r), cw = hw - sw;
      if (r.width >= 7 && widest >= 7 && len > n.R + 8) {
        // zebra crossing 4 m wide, starting 1.5 m past the fillet; stop line 2 m further back
        const s0 = n.R + 1.2, s1 = s0 + 4.0;
        const p = pointAtS(S, (s0 + s1) / 2); if (!p || water(p.x, p.z)) continue;
        const tx = p.tx, tz = p.tz, nx = -tz, nz = tx;
        for (let o = -cw + 0.45; o <= cw - 0.45; o += 0.9) {
          const cx = p.x + nx * o, cz = p.z + nz * o;
          const P = [[-0.225, -2], [0.225, -2], [0.225, 2], [-0.225, 2]].map(([u, v]) => { const x = cx + nx * u + tx * v, z = cz + nz * u + tz * v; return lineB.vert(x, roadY(x, z) + 0.021, z, (u + 0.225) / 0.8, v / 0.8, UP, WHITE); });
          lineB.quad(P[0], P[1], P[2], P[3]);
        }
        const q = pointAtS(S, s1 + 2.0);
        if (q) { const P = [[0, -0.225], [cw, -0.225], [cw, 0.225], [0, 0.225]].map(([u, v]) => { const x = q.x - q.tz * u + q.tx * v, z = q.z + q.tx * u + q.tz * v; return lineB.vert(x, roadY(x, z) + 0.021, z, u / 0.8, v / 0.8, UP, WHITE); }); lineB.quad(P[0], P[1], P[2], P[3]); }
        out.crosswalks.push({ x: p.x, z: p.z, tx, tz, w: cw * 2 });
        // pedestrian crossing sign at the kerb (one side)
        if (sw > 0 && hr(p.x, p.z) < 0.7) {
          const sx = p.x + nx * (hw - 0.35), sz = p.z + nz * (hw - 0.35);
          if (!lotIdx.at(sx, sz, 0) && !water(sx, sz)) { F.signPost(sx, sz, roadY(sx, sz) + CURB, 2.9, Math.atan2(-tx, -tz), [{ kind: 'rect', cell: SIGN.cross, size: [0.6, 0.6], y: 2.55, double: true }]); out.signs++; }
        }
      } else if (r.width < 7 && widest >= 7 && len > n.R + 6 && r.width >= 3) {
        // minor road entering a main road: stop line + 止まれ
        const s0 = n.R + 1.0;
        const p = pointAtS(S, s0); if (!p || water(p.x, p.z)) continue;
        const nx = -p.tz, nz = p.tx, halfC = Math.max(1.2, cw - 0.3);
        const P = [[-halfC, -0.2], [halfC, -0.2], [halfC, 0.2], [-halfC, 0.2]].map(([u, v]) => { const x = p.x + nx * u + p.tx * v, z = p.z + nz * u + p.tz * v; return lineB.vert(x, roadY(x, z) + 0.021, z, u / 0.8, v / 0.8, UP, WHITE); });
        lineB.quad(P[0], P[1], P[2], P[3]);
        // glyph: canvas top = far end for the approaching driver (who drives toward the node, i.e. along -t)
        const g = pointAtS(S, s0 + 3.2);
        if (g && r.width >= 3.4) {
          const gw = Math.min(1.8, cw * 1.4), gl = gw * 3;
          const cell = GLYPH.tomare;
          const vx = -g.tx, vz = -g.tz, ux = -vz, uz = vx;   // v toward the junction (far end for the driver)
          const Q = [[-gw / 2, -gl / 2, 0, 0], [gw / 2, -gl / 2, 1, 0], [gw / 2, gl / 2, 1, 1], [-gw / 2, gl / 2, 0, 1]].map(([u, v, cu, cv]) => {
            const x = g.x + ux * u + vx * v, z = g.z + uz * u + vz * v; const uv = uvOf(cell, cu, cv);
            return glyphB.vert(x, roadY(x, z) + 0.022, z, uv[0], uv[1], UP, WHITE);
          });
          glyphB.quad(Q[0], Q[1], Q[2], Q[3]);
          out.stops.push({ x: g.x, z: g.z, tx: vx, tz: vz });
        }
        // triangular 止まれ sign at the corner, facing the approaching driver
        const side = hr(n.x, p.z) < 0.5 ? 1 : -1;
        const sx = p.x + nx * side * (hw + 0.35) - p.tx * 0.5, sz = p.z + nz * side * (hw + 0.35) - p.tz * 0.5;
        if (!lotIdx.at(sx, sz, 0.1) && !water(sx, sz) && !roadIdx.covering(sx, sz, 0, null).some((o) => o !== r && o.width > 4)) {
          F.signPost(sx, sz, L.heightAt(sx, sz), 2.6, Math.atan2(p.tx, p.tz), [{ kind: 'tri', cell: SIGN.stop, size: [0.8], y: 2.3 }, { kind: 'rect', cell: SIGN.pStop, size: [0.45, 0.22], y: 1.72 }]);
          out.signs++;
        }
        // convex mirror across the junction mouth for narrow approaches
        if (widest < 11 && hr(p.x, n.z) < 0.6) {
          const mx = n.x - p.tx * (n.R + 0.9) - nx * side * 0.8, mz = n.z - p.tz * (n.R + 0.9) - nz * side * 0.8;
          if (!lotIdx.at(mx, mz, 0.1) && !water(mx, mz) && !roadIdx.covering(mx, mz, 0.2, null).length) { F.curveMirror(mx, mz, Math.atan2(p.tx, p.tz), [{ yaw: -0.5 * side }, { yaw: 0.5 * side, dx: 0 }].slice(0, 1)); out.mirrors++; }
        }
      }
    }
  }

  // ------------------------------------------------------------------ other signs along hero roads
  for (const r of roads) {
    if (r.zone !== 'hero' || r.width < 4) continue;
    const S = resample(r.pts, 3); const len = S[S.length - 1].s; if (len < 40) continue;
    const hw = r.width / 2, seed = hr(r.width * 3.1, S[0].x * 0.07);
    if (seed < 0.35) {
      const p = pointAtS(S, len * (0.3 + seed)); if (!p) continue;
      const side = seed < 0.17 ? 1 : -1, nx = -p.tz * side, nz = p.tx * side;
      const x = p.x + nx * (hw + 0.3), z = p.z + nz * (hw + 0.3);
      if (lotIdx.at(x, z, 0.2) || water(x, z) || roadIdx.covering(x, z, 0.3, null).length) continue;
      const kind = r.width >= 7 ? (seed < 0.1 ? SIGN.noPark : SIGN.n30) : SIGN.n30;
      F.signPost(x, z, L.heightAt(x, z) + (sidewalkOf(r) ? CURB : 0), 2.8, Math.atan2(p.tx, p.tz) + (side > 0 ? 0 : Math.PI), [{ kind: 'circle', cell: kind, size: [0.6], y: 2.45 }]);
      out.signs++;
    }
  }
  // blue guide signs on the main prefectural roads (big board on a tall post)
  {
    const mains = roads.filter((r) => r.zone === 'hero' && r.kind === 'prefectural' && polyLength(r.pts) > 60);
    for (let i = 0; i < mains.length; i += Math.max(1, Math.floor(mains.length / 4))) {
      const r = mains[i], S = resample(r.pts, 3), p = pointAtS(S, S[S.length - 1].s * 0.5); if (!p) continue;
      const hw = r.width / 2, nx = -p.tz, nz = p.tx;
      const x = p.x + nx * (hw + 0.5), z = p.z + nz * (hw + 0.5);
      if (lotIdx.at(x, z, 0.3) || water(x, z)) continue;
      F.signPost(x, z, L.heightAt(x, z), 4.3, Math.atan2(-p.tx, -p.tz), [{ kind: 'rect', cell: SIGN.guide, size: [2.0, 1.5], y: 3.55, clamps: [-0.5, 0.5] }], { r: 0.07 });
      out.signs++;
    }
  }

  // ------------------------------------------------------------------ guardrails where the road edge drops away (hero)
  const HS = sharedHardShores(L);   // [v3:fix]
  for (const r of roads) {
    if (r.zone !== 'hero' || r.width < 3.5) continue;
    const S = resample(r.pts, 2); const hw = r.width / 2;
    for (const side of [-1, 1]) {
      let run = [];
      const flushG = () => {
        if (run.length >= 4) {
          const a = run[0], b = run[run.length - 1];
          const nx = -a.tz * side, nz = a.tx * side;
          F.guardrail([a.x + nx * (hw + 0.25), a.z + nz * (hw + 0.25)], [b.x + nx * (hw + 0.25), b.z + nz * (hw + 0.25)], -side);
          out.guardrails++;
        }
        run = [];
      };
      for (const s of S) {
        const nx = -s.tz * side, nz = s.tx * side;
        const ex = s.x + nx * (hw + 0.25), ez = s.z + nz * (hw + 0.25), ox = s.x + nx * (hw + 3), oz = s.z + nz * (hw + 3);
        const drop = L.heightAt(ex, ez) - L.heightAt(ox, oz) > 1.8;
        const ok = drop && !water(ex, ez) && !lotIdx.at(ox, oz, 0.5) && !roadIdx.covering(ox, oz, 0.5, r).length && !HS.inApron(ex, ez, 1.0);   // [v3:fix] not on the harbor's promenade deck / quay apron (rails poked through the deck)
        if (ok) run.push(s); else flushG();
      }
      flushG();
    }
  }

  // ------------------------------------------------------------------ emit
  const add = (B, material, o = {}) => { if (B.empty) return null; const m = B.mesh(material, o); root.add(m); if (o.noOutline) ctx.noOutline(m); return m; };
  add(roadB, M.asphalt, { name: 'town-asphalt' });
  add(paverB, M.pavers, { name: 'town-sidewalk' });
  add(curbB, M.curb, { cast: true, name: 'town-curbs' });
  add(gutB, M.lgutter, { name: 'town-gutters', noOutline: true });
  add(dotsB, M.dots, { name: 'town-tactile', noOutline: true });
  add(barsB, M.bars, { name: 'town-tactile-bars', noOutline: true });
  add(lineB, M.line, { name: 'town-lines', renderOrder: -2, noOutline: true });
  add(glyphB, M.glyph, { name: 'town-glyphs', renderOrder: -1, noOutline: true });
  add(utilB, M.util, { name: 'town-util', renderOrder: -3, noOutline: true });
  ctx.addStatic(root);
  out.km = +(asphaltLen / 1000).toFixed(1);
  out.tex = T;
  out.nodes = nodes.size;
  return out;
}
