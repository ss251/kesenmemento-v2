// [v3:town] Utility poles (電柱) on the layout's POLE_RUNS and every street wire (ctx.wires).
// Each concrete pole carries (hero detail): a textured tapered shaft, the overhead ground wire pin, a 6.6 kV crossarm
// with three pin insulators, a low-voltage rack with spool insulators, telecom cables on clamps, a pole transformer
// with cutouts on every third pole, a street-light arm on alternate poles (registered with life's light registry),
// the tiger-striped guard sleeve, step bolts, number plates and a wrap-around ad. Wires: 3 conductors + ground wire,
// 3 low-voltage wires and 2 thick telecom cables per span with realistic sag; zig-zag cross-street spans between runs;
// service drops (引込線) from every pole to the nearby facades. Publishes ctx.services.poles = { poles, spans }.
import { sharedHardShores } from '../layout/hardshore.js';   // [v3:fix]
import * as THREE from 'three';
import { makeAtlases, RA, adRect, plateRect, uvOf } from './sakura/poles_atlas.js';
import { lights } from '../life/lights.js';
import { resample } from './common.js';

const V3 = THREE.Vector3;
const UV = { shaft: uvOf(RA.shaft), sleeve: uvOf(RA.sleeve), cover: uvOf(RA.cover), trans: uvOf(RA.trans) };
const rectXf = (r) => [r[2] - r[0], r[3] - r[1], r[0], r[1]];   // [su, sv, ou, ov] for unit uvs

export function buildPoles(ctx, H, { lotIdx, roadIdx, heroZone, facades, runs: givenRuns = null, lanes = null }) {   // [v4:explore] runs / lanes: explore/stream.js poles its streamed tiles
  const L = ctx.L, M = H.M;
  const plates = [], telPlates = [];
  const lineNames = ['内湾幹', '八日町', '魚町支', '南町支', '港町', '神明崎', '入沢', '柏崎'];
  for (let i = 0; i < 84; i++) plates.push({ line: lineNames[i % lineNames.length], num: 11 + i * 3 });
  for (let i = 0; i < 15; i++) telPlates.push({ line: ['内湾', '八日町', '魚町', '南町', '港町'][i % 5], num: String(101 + i * 7) });
  const atlas = makeAtlases(ctx, { plates, telPlates });
  const matA = ctx.mat.toon('#ffffff', { map: atlas.A, vertexColors: true, paint: 0.03 });
  const matB = ctx.mat.toon('#ffffff', { map: atlas.B, vertexColors: true, alphaTest: 0.5, side: 'double', paint: 0.01 });
  const Lt = lights(ctx);
  const lampHead = Lt.lampMaterial('#e6e2da', '#fff2d6', 1.8);
  const poles = [], spans = [];
  const inHero = (x, z) => Math.hypot(x - heroZone.cx, z - heroZone.cz) < heroZone.r + 30;
  let lamps = 0;

  // ------------------------------------------------------------------ extra runs along the narrow hero lanes (the layout's
  // POLE_RUNS cover the main streets; Japanese lanes carry poles too, and their wires are half the look)
  const HS = sharedHardShores(L);   // [v3:fix]
  const runs = (givenRuns || L.POLE_RUNS).map((r) => ({ roadId: r.roadId, pts: r.pts }));
  {
    const have = []; for (const r of runs) for (const p of r.pts) have.push(p);
    const hg = new Map(), HC = 16; const hk = (x, z) => Math.floor(x / HC) + ',' + Math.floor(z / HC);
    const addH = (p) => { const k = hk(p[0], p[1]); if (!hg.has(k)) hg.set(k, []); hg.get(k).push(p); };
    have.forEach(addH);
    const nearPole = (x, z, d) => { const i0 = Math.floor(x / HC), j0 = Math.floor(z / HC); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const p of hg.get(i + ',' + j) || []) if (Math.hypot(p[0] - x, p[1] - z) < d) return true; return false; };
    for (const r of lanes || L.ROADS) {
      if ((!lanes && r.zone !== 'hero') || r.width < 2.8 || r.kind === 'bridge') continue;
      let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
      if (len < 22) continue;
      const pts = [];
      const hw = r.width / 2 + 0.45;
      const S = resample(r.pts, 1.0);
      const s0 = 5 + ((Math.abs(r.pts[0][0] * 7.3 + r.pts[0][1] * 3.1)) % 10);
      for (let k = 0, next = s0; k < S.length; k++) {
        const q = S[k]; if (q.s < next) continue;
        let placed = false;
        for (const off of [hw, r.width / 2 - 0.22]) {
          for (const side of [1, -1]) {
            const x = q.x - q.tz * off * side, z = q.z + q.tx * off * side;
            if (L.shoreDist(x, z) > -1.5 || lotIdx.at(x, z, 0.3) || roadIdx.covering(x, z, 0.2, r).length || nearPole(x, z, 13)) continue;
            pts.push([x, z]); addH([x, z]); placed = true; break;
          }
          if (placed) break;
        }
        next = q.s + (placed ? 30 : 3);
      }
      if (pts.length >= 1) runs.push({ roadId: r.id, pts, extra: true });
    }
  }

  // ------------------------------------------------------------------ poles
  runs.forEach((run, ri) => {
    const pts = run.pts;
    const list = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (L.isWater(x, z)) continue;
      if (HS.inApron(x, z, 0.6)) continue;   // [v3:fix] never on the promenade deck / quay apron (a pole stood mid-deck)
      const a = pts[Math.min(pts.length - 1, i + 1)], b = pts[Math.max(0, i - 1)];
      const ang = Math.atan2(a[0] - b[0], a[1] - b[1]);        // run direction (rotY of +z along the run)
      const y = L.heightAt(x, z);
      const hero = inHero(x, z);
      const Hh = 11.4 + ((ri * 7 + i * 3) % 4) * 0.25;
      // road side: which side of the run is the road? (the nearest road centre-line)
      const nr = roadIdx.nearest(x, z, 20);
      let side = 1;
      if (nr) { const rx = nr.a[0] + (nr.b[0] - nr.a[0]) * nr.t, rz = nr.a[1] + (nr.b[1] - nr.a[1]) * nr.t; const cx = Math.cos(ang), sx = -Math.sin(ang); side = (rx - x) * cx + (rz - z) * sx >= 0 ? 1 : -1; }
      const p = { id: 'P' + ri + '-' + i, x, z, y, H: Hh, ang, hero, side, run: ri, idx: i, tr: (ri + i) % 3 === 1, lamp: hero && (i % 2 === 0) && !!nr, top: y + Hh };
      list.push(p); poles.push(p);
    }
    run._poles = list;
  });

  for (const p of poles) {
    const F = H.Frame.at(H.gb, p.x, p.y, p.z, p.ang);    // local +z along the run, local +x across (toward p.side*x)
    const full = p.hero;
    const rTop = 0.13, rBot = 0.19;
    const rAt = (h) => rBot + (rTop - rBot) * (h / p.H);
    // shaft (textured), cap, sleeve
    F.cyl(matA, '#ffffff', rBot, p.H + 0.4, 0, (p.H - 0.4) / 2, 0, { rTop, seg: full ? 9 : 6, open: true, uvx: rectXf(UV.shaft) });
    F.cyl(M.plain, '#b3b2ab', rTop + 0.01, 0.08, 0, p.H + 0.04, 0, { seg: full ? 8 : 5 });
    if (full) {
      F.cyl(matA, '#ffffff', rBot + 0.012, 1.8, 0, 0.9, 0, { seg: 10, open: true, uvx: rectXf(UV.sleeve) });
      // step bolts (足場ボルト) on the upper shaft, alternating sides
      for (let h = p.H - 5.2, k = 0; h < p.H - 1.4; h += 0.5, k++) F.box(M.plain, '#8d939b', 0.32, 0.025, 0.025, 0, h, 0, { ry: k % 2 ? 0 : Math.PI / 2, skip: 'dt' });
      // number plate + ad wrap on the sidewalk face
      const pi = (p.run * 5 + p.idx) % plates.length, pr = uvOf(plateRect(pi));
      H.card(F.sub(0, 0, 0, -p.side * Math.PI / 2), matB, pr, 0, 1.75, rAt(1.75) + 0.012, 0.16, 0.64, { noOutline: true });
      if ((p.run + p.idx) % 3 === 0) { const ar = uvOf(adRect((p.run * 3 + p.idx) % 12)); H.card(F.sub(0, 0, 0, Math.PI - p.side * Math.PI / 2), matA, ar, 0, 2.9, rAt(2.9) + 0.015, 0.3, 1.5); }
    }
    // ground wire pin
    F.cyl(M.plain, '#e9e6df', 0.03, 0.22, 0, p.H + 0.18, 0, { seg: full ? 6 : 4 });
    // HV crossarm with three pin insulators (across the run)
    const armY = p.H - 0.55;
    F.box(M.plain, '#8d939b', 1.9, 0.1, 0.09, 0, armY, 0);
    if (full) F.beam(M.plain, '#8d939b', [-0.6, armY - 0.02, 0], [0, armY - 0.55, 0], 0.04, 0.04), F.beam(M.plain, '#8d939b', [0.6, armY - 0.02, 0], [0, armY - 0.55, 0], 0.04, 0.04);
    for (const ox of [-0.8, 0, 0.8]) { F.cyl(M.plain, '#e9e6df', 0.055, 0.16, ox, armY + 0.13, 0, { seg: full ? 6 : 5, rTop: 0.07 }); if (full) F.cyl(M.plain, '#e9e6df', 0.075, 0.035, ox, armY + 0.16, 0, { seg: 6 }); }
    // second (branch) arm on some hero poles
    if (full && (p.idx % 4 === 2)) { F.box(M.plain, '#8d939b', 1.5, 0.09, 0.08, 0, armY - 0.8, 0, { ry: 0.0 }); for (const ox of [-0.6, 0.6]) F.cyl(M.plain, '#cdd1d1', 0.05, 0.2, ox, armY - 0.9, 0, { rz: Math.PI / 2, seg: 8 }); }
    // low-voltage rack: vertical bracket with 3 spools, on the road side
    const lvY = p.H - 2.9, lvX = p.side * 0.26;
    F.box(M.plain, '#8d939b', 0.05, 0.9, 0.05, lvX, lvY - 0.3, 0);
    if (full) for (let k = 0; k < 3; k++) F.cyl(M.plain, '#e9e6df', 0.04, 0.07, lvX + p.side * 0.05, lvY - k * 0.3, 0, { seg: 6, rz: Math.PI / 2 });
    // telecom clamps
    const telY = [p.H - 5.3, p.H - 5.85];
    if (full) for (const ty of telY) F.box(M.plain, '#48454f', 0.3, 0.07, 0.1, -p.side * 0.18, ty, 0);
    // transformer
    if (p.tr) {
      const tx = -p.side * 0.42, ty = p.H - 2.2;
      F.cyl(matA, '#ffffff', 0.28, 0.85, tx, ty, 0, { seg: full ? 10 : 6, uvx: rectXf(UV.trans) });
      if (full) F.cyl(M.plain, '#a7adb1', 0.3, 0.06, tx, ty + 0.46, 0, { seg: 10 });
      F.box(M.plain, '#8d939b', 0.5, 0.06, 0.06, tx * 0.5, ty + 0.2, 0);
      F.box(M.plain, '#8d939b', 0.5, 0.06, 0.06, tx * 0.5, ty - 0.25, 0);
      if (full) for (const oz of [-0.25, 0, 0.25]) { F.box(M.plain, '#dfddd6', 0.08, 0.26, 0.08, tx * 0.3, armY - 0.45, oz); ctx.wires.add([F.w(tx * 0.3, armY - 0.58, oz), F.w(tx, ty + 0.45, oz * 0.4)], { width: 0.012, color: '#3a3346' }); }
    }
    // street light arm + LED head over the road
    if (p.lamp) {
      const ly = 7.2, reach = 1.5;
      F.beam(M.plain, '#c9ccc9', [p.side * 0.15, ly - 0.35, 0], [p.side * 0.8, ly + 0.05, 0], 0.05, 0.05);
      F.beam(M.plain, '#c9ccc9', [p.side * 0.8, ly + 0.05, 0], [p.side * reach, ly + 0.08, 0], 0.05, 0.05);
      F.box(M.plain, '#dcdfdc', 0.5, 0.1, 0.22, p.side * (reach + 0.2), ly + 0.05, 0);
      F.box(lampHead, null, 0.4, 0.02, 0.16, p.side * (reach + 0.2), ly - 0.005, 0, { shadow: false });
      const w = F.w(p.side * (reach + 0.2), ly - 0.05, 0);
      Lt.streetlight({ x: w.x, y: w.y, z: w.z, groundY: L.heightAt(w.x, w.z) });
      lamps++;
    }
    ctx.physics.addCylinder(p.x, p.z, 0.24, p.y - 0.5, p.y + p.H);
    // anchor points for wires (world)
    p.hv = [-0.8, 0, 0.8].map((ox) => F.w(ox, armY + 0.2, 0));
    p.gw = F.w(0, p.H + 0.28, 0);
    p.lv = [0, 1, 2].map((k) => F.w(lvX + p.side * 0.1, lvY - k * 0.3, 0));
    p.tel = telY.map((ty) => F.w(-p.side * 0.3, ty, 0));
    p.F = F;
  }

  // ------------------------------------------------------------------ spans along each run
  const sagOf = (a, b, k) => 0.25 + a.distanceTo(b) * k;
  const addSpan = (pts, width, color, kind) => { ctx.wires.add(pts, { width, color }); spans.push({ points: pts, kind }); };
  for (const run of runs) {
    const list = run._poles || [];
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1], q = list[i];
      const span = Math.hypot(q.x - p.x, q.z - p.z);
      if (span > 50 || span < 4) continue;
      const seg = p.hero ? 16 : 8;
      // conductors cross the run's axis consistently: match by lateral order
      for (let k = 0; k < 3; k++) addSpan(ctx.geo.catenary(p.hv[k], q.hv[k], sagOf(p.hv[k], q.hv[k], 0.009), seg), 0.02, '#3a3346', 'hv');
      addSpan(ctx.geo.catenary(p.gw, q.gw, sagOf(p.gw, q.gw, 0.007), seg), 0.014, '#4a4652', 'gw');
      for (let k = 0; k < 3; k++) addSpan(ctx.geo.catenary(p.lv[k], q.lv[k], sagOf(p.lv[k], q.lv[k], 0.016), seg), 0.022, '#34303a', 'lv');
      addSpan(ctx.geo.catenary(p.tel[0], q.tel[0], 0.5 + span * 0.02, seg), 0.045, '#2f2b35', 'tel');
      addSpan(ctx.geo.catenary(p.tel[1], q.tel[1], 0.65 + span * 0.022, seg), 0.034, '#37333d', 'tel');
      // a closure box on the telecom cable mid-span now and then
      if (p.hero && (p.idx + p.run) % 3 === 0) {
        const c = ctx.geo.catenary(p.tel[0], q.tel[0], 0.5 + span * 0.02, 10)[4];
        H.Frame.at(H.gb, c.x, c.y - 0.05, c.z, p.ang).cyl(M.plain, '#48454f', 0.09, 0.55, 0, 0, 0, { rx: Math.PI / 2, seg: 10 });
      }
    }
  }
  // ------------------------------------------------------------------ extra lane runs: tie both ends into the nearest pole of another run
  const allP = poles;
  for (const run of runs) {
    if (!run.extra || !run._poles?.length) continue;
    const ends = run._poles.length === 1 ? [run._poles[0]] : [run._poles[0], run._poles[run._poles.length - 1]];
    for (const p of ends) {
      let best = null, bd = 36;
      for (const q of allP) {
        if (q.run === p.run) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 6 || d >= bd) continue;
        let blocked = false; for (let t = 0.15; t < 0.9; t += 0.15) if (lotIdx.at(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, -0.3)) { blocked = true; break; }
        if (!blocked) { bd = d; best = q; }
      }
      if (!best) continue;
      for (let k = 0; k < 3; k++) addSpan(ctx.geo.catenary(p.lv[k], best.lv[k], 0.3 + bd * 0.016, 12), 0.022, '#34303a', 'lv');
      addSpan(ctx.geo.catenary(p.tel[0], best.tel[0], 0.5 + bd * 0.02, 12), 0.042, '#2f2b35', 'tel');
      addSpan(ctx.geo.catenary(p.tel[1], best.tel[1], 0.6 + bd * 0.022, 12), 0.032, '#37333d', 'tel');
      if (k2(p, best)) for (let k = 0; k < 3; k++) addSpan(ctx.geo.catenary(p.hv[k], best.hv[k], 0.25 + bd * 0.009, 12), 0.02, '#3a3346', 'hv');
    }
  }
  function k2(p, q) { return (p.idx + q.idx) % 2 === 0; }

  // ------------------------------------------------------------------ cross-street spans (zig-zag between runs)
  const pg = new Map(); const ck = (x, z) => Math.floor(x / 30) + ',' + Math.floor(z / 30);
  for (const p of poles) { const k = ck(p.x, p.z); if (!pg.has(k)) pg.set(k, []); pg.get(k).push(p); }
  const near = (p, r) => { const out = []; const i0 = Math.floor(p.x / 30), j0 = Math.floor(p.z / 30); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const q of pg.get(i + ',' + j) || []) if (q !== p && Math.hypot(q.x - p.x, q.z - p.z) < r) out.push(q); return out; };
  let cross = 0;
  const linked = new Set();
  for (const p of poles) {
    if (!p.hero || p.idx % 2) continue;
    let best = null, bd = 1e9;
    for (const q of near(p, 26)) {
      if (q.run === p.run || linked.has(q.id)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 8) continue;
      // roughly perpendicular to p's run
      const dx = (q.x - p.x) / d, dz = (q.z - p.z) / d, ax = Math.sin(p.ang), az = Math.cos(p.ang);
      if (Math.abs(dx * ax + dz * az) > 0.55) continue;
      // no building in between
      let blocked = false; for (let t = 0.2; t < 0.85; t += 0.15) if (lotIdx.at(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, 0)) { blocked = true; break; }
      if (blocked) continue;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) continue;
    linked.add(p.id); linked.add(best.id);
    addSpan(ctx.geo.catenary(p.lv[0], best.lv[1], 0.5 + bd * 0.02, 12), 0.02, '#34303a', 'lv');
    addSpan(ctx.geo.catenary(p.lv[2], best.lv[2], 0.55 + bd * 0.022, 12), 0.02, '#34303a', 'lv');
    addSpan(ctx.geo.catenary(p.tel[1], best.tel[0], 0.6 + bd * 0.025, 12), 0.03, '#2f2b35', 'tel');
    cross++;
  }
  // ------------------------------------------------------------------ service drops to the facades
  let drops = 0;
  for (const p of poles) {
    if (!p.hero) continue;
    const cands = facades.query(p.x, p.z, 20);
    let n = 0;
    for (const f of cands) {
      if (n >= 3) break;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > 20 || d < 3) continue;
      // the drop lands under the eave of the facade facing the pole
      const tgt = new V3(f.x, f.y, f.z);
      let blocked = false; for (let t = 0.25; t < 0.8; t += 0.2) { const l = lotIdx.at(p.x + (f.x - p.x) * t, p.z + (f.z - p.z) * t, -0.2); if (l && l.id !== f.lotId) { blocked = true; break; } }
      if (blocked) continue;
      const src = p.lv[(n + p.idx) % 3];
      addSpan(ctx.geo.catenary(src, tgt, 0.35 + d * 0.035, 10), 0.016, '#34303a', 'drop');
      addSpan(ctx.geo.catenary(src.clone().add(new V3(0, -0.12, 0)), tgt.clone().add(new V3(0.18, -0.05, 0)), 0.4 + d * 0.035, 10), 0.014, '#3f3a46', 'drop');
      if (n === 0) addSpan(ctx.geo.catenary(p.tel[1], tgt.clone().add(new V3(-0.3, -0.35, 0)), 0.5 + d * 0.04, 10), 0.018, '#2f2b35', 'drop');
      n++; drops++;
    }
  }
  ctx.services.poles = { poles: poles.map((p) => ({ id: p.id, x: p.x, z: p.z, y: p.y, top: p.top })), spans };
  return { poles: poles.length, spans: spans.length, cross, drops, lamps, runs: runs.length, extraRuns: runs.filter((r) => r.extra).length };
}

/** Facade anchor index for service drops: points under the eaves of hero buildings, on the street face. */
export function facadeAnchors(L, lots) {
  const pts = [];
  for (const l of lots) {
    const f = L.lotFrame(l);
    const s = Math.sin(f.rotY), c = Math.cos(f.rotY);
    const y = l.groundY + Math.min(l.height, 2.9 * Math.min(2, l.storeys)) - 0.6;
    for (const u of l.obb.w > 8 ? [-l.obb.w / 4, l.obb.w / 4] : [0]) pts.push({ x: f.x + u * c + s * 0.05, z: f.z - u * s + c * 0.05, y, lotId: l.id });
  }
  const grid = new Map(), C = 20;
  for (const p of pts) { const k = Math.floor(p.x / C) + ',' + Math.floor(p.z / C); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  return {
    query(x, z, r) {
      const out = [];
      for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (const p of grid.get(i + ',' + j) || []) out.push(p);
      out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      return out;
    },
  };
}
