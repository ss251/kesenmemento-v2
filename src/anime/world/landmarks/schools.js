// [v4:landmarks-B] Schools of the core (docs/anime/landmarks/schools.md): every GSI footprint inside an OSM school
// ground (sites.js SCHOOLS) is rebuilt as a Japanese school building on its real outline.
//   - Classroom blocks: grey-white RC, continuous balcony slabs at every floor, window bands with steel mullions,
//     rooftop railings (Commons "Kesennuma city Kesennuma elementary school 202509.jpg"); 3 storeys for the big
//     blocks, 2 for mid, 1 for sheds. 気仙沼小 has its grey concrete stair cylinder rising above the roof.
//   - Gymnasiums (square-ish footprints of 550 m² and more): cream walls with a high window band and a barrel roof.
//   - Roof colours are the lot's measured aerial colour (layout lot.roof, enrich/aerial.js).
//   - Outdoor pools (OSM leisure=swimming_pool) with deck, lane ropes and the green mesh fence; the school gate with
//     its name plate at the ground's corner nearest a road; the yard itself is the land-use layer's bare earth (town).
import * as THREE from 'three';
import { SCHOOLS, SCHOOL_INFO, POOLS_HELI } from './sites.js';
import { patchLots } from '../explore/tiles.js';
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, flatRoof, colliders, capGeo, prismWalls, mapMat, nightMat, vsign, offsetRing, centroid, edges, inRing, pitchedRoof } from './kit.js';

const FH = 3.6;

/** [r3:16] The share of the lot's oriented box that its polygon fills (1 for a rectangle or a lot with no polygon). A gym is a solid box; an L, U or diagonal bar fills 0.4 to 0.8 of it. */
export function polyFill(lot) {
  const poly = lot.poly, o = lot.obb;
  if (!poly || poly.length < 5 || !o) return 1;   // a 4-corner layout rectangle (far lots before explore's patchLots) fills its box
  let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2 / Math.max(1, o.w * o.d);
}
export function schoolKind(lot) {
  // [v6:c9r3] [r3:16] an explicit per-lot kind (SCHOOL_INFO.<school>.kindOverride, consulted only for a lot with an id) beats the area / box-ratio rule, which stays as the fallback for unlisted lots
  const forced = lot.id ? SCHOOL_INFO[String(lot.landmark || '').replace(/^school:/, '')]?.kindOverride?.[lot.id] : null;
  if (forced) return forced;
  const w = Math.min(lot.obb.w, lot.obb.d), d = Math.max(lot.obb.w, lot.obb.d);
  if (lot.area >= 550 && d / w <= 1.9 && lot.area <= 2600 && polyFill(lot) >= 0.85) return 'gym';   // [r3:16] fill >= 0.85: a diagonal or U-shaped wing is not a gym
  if (lot.area < 150) return 'shed';
  return 'block';
}
// [v6:jonan-r3] a per-lot storey count (SCHOOL_INFO.<school>.storeysOverride; [r3:16] schKesennumaE /73 = 2) beats the area rule, and topExtra adds metres above that count (a stair tower standing above the roof)
const schoolInfoOf = (lot) => SCHOOL_INFO[String(lot.landmark || '').replace(/^school:/, '')];
export function schoolTopExtra(lot) { return schoolInfoOf(lot)?.topExtra?.[lot.id] || 0; }
export function schoolStoreys(lot, kind = schoolKind(lot)) {
  const forced = schoolInfoOf(lot)?.storeysOverride?.[lot.id];
  if (forced) return forced;
  return kind === 'shed' ? 1 : kind === 'gym' ? 1 : lot.area < 320 ? 2 : 3;
}

export async function buildSchools(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  // [r3:16] The landmarks module builds BEFORE explore (main.js MODULES), and a far lot's layout.json polygon is its 4-corner box: 気仙沼高 /24 and 鹿折中 /196 (fill 0.44 / 0.49, U-shaped round a courtyard)
  // would be solid slabs. patchLots swaps in the true footprint from explore.json (idempotent: explore runs it again and skips what is patched); with no explore.json the box stays.
  try {
    const X = await L.loadData?.('explore.json');
    if (X?.lots) { const mine = {}; for (const lot of L.LOTS) if (String(lot.landmark || '').startsWith('school:') && X.lots[lot.id]) mine[lot.id] = X.lots[lot.id]; patchLots(L, { ...X, lots: mine }); }   // only the school lots: explore patches the rest itself
  } catch (e) { console.warn('[schools] explore footprints unavailable, far lots keep their layout boxes', e); }
  // [sys:32] school roofs keep the aerial colour of each lot (a different colour per building): one material per colour quantised to 8 levels a channel,
  // not one per building (69 school lots would otherwise add 69 materials to the budget)
  const roofMats = new Map();
  const roofMat = (c) => { const q = '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) / 8) * 8).toString(16).padStart(2, '0')).join(''); let m = roofMats.get(q); if (!m) roofMats.set(q, (m = t(q, { paint: 0.04 }))); return m; };
  const { k } = group(ctx, 'lmB-schools');
  // [v6:shishiori-r3] a school lot whose roof an override set to 'gable' or 'hip' (src.roof 'override', data/anime/overrides) is drawn with a pitched metal roof, the ridge along the
  // footprint's long side (kit pitchedRoof, along 'd'): 鹿折小's block and gym (Commons 150521570, 2024-05). tagOfSiteB's flat / the gym's barrel stay the default of every other school.
  const pitchedShape = (lot) => (lot.src?.roof === 'override' && (lot.roof?.shape === 'gable' || lot.roof?.shape === 'hip')) ? lot.roof.shape : null;
  const gableWall = t('#ecebe4', { paint: 0.02 });
  const pitchedSchoolRoof = (lot, poly, y, shape, pitch) => {
    // [v6:schools-r3] SCHOOL_INFO.<ground>.look.roof beats the lot's colour (鹿折小's aerial roof colour is wrong: the 2024-05 photo shows dark slate #4a4d55)
    const o = obbOf(poly), pr = pitchedRoof(o, y, { kind: shape, pitch, over: 0.6 }), m = roofMat(schoolInfoOf(lot)?.look?.roof || lot.roof?.color || '#5c6371');
    k.mesh(pr.roof, m); k.mesh(pr.fascia, m); if (pr.gables) k.mesh(pr.gables, gableWall);
    return pr.rise;
  };
  const blockMat = (key, base, slab) => facadeMat(ctx, key, { draw: (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = slab; g.fillRect(0, 0, W, H * 0.16);             // the balcony slab edge + parapet above the band
    g.fillStyle = '#b7b8b4'; g.fillRect(0, H * 0.16, W, 3);
    const Y0 = H * 0.24, Y1 = H * 0.78;
    const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#5d7489'); gr.addColorStop(1, '#b3c4cf'); g.fillStyle = gr; g.fillRect(0, Y0, W, Y1 - Y0);
    g.fillStyle = '#e4e6e3'; for (let x = 0; x <= W; x += W / 4) g.fillRect(x - 2, Y0, 4, Y1 - Y0); g.fillRect(0, (Y0 + Y1) / 2 - 1.5, W, 3);
    g.fillStyle = 'rgba(240,238,230,0.8)'; g.fillRect(4, Y0 + 3, W * 0.1, (Y1 - Y0) * 0.7);   // a curtain
  }, win: [0, 0.22, 1, 0.76], lit: 0.12 });
  const block = blockMat('school-block', '#cfcfca', '#e9e9e4');
  // [v6:c5] 気仙沼小's blocks are mid-light grey exposed concrete, not near-white (Commons 2025-09-28: walls and slab bands #acaeae to #aeafae)
  const blockConcrete = blockMat('school-block-concrete', '#b4b5b1', '#c4c5c1');
  // [v6:schools-r3] sash-window facades for the three photo-sampled grounds (SCHOOL_INFO.<ground>.look). One texture cell is `cell` m wide and one storey (FH) tall, painted at ~37 px/m; every window is a group of
  // separate sashes (white frame, dark glass, a transom) with plain wall between the groups and a spandrel under them, not a continuous glazed ribbon.
  const sashPx = 37, SASH = { frame: '#eef0ee', glass: ['#3f5163', '#7d93a4'] };
  const sashGroup = (g, mx, my, x0, x1, y0, y1, n) => {
    const X0 = x0 * mx, X1 = x1 * mx, Y0 = y0 * my, Y1 = y1 * my, f = Math.max(1.5, 0.06 * mx), pw = (X1 - X0) / n;
    g.fillStyle = SASH.frame; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, SASH.glass[0]); gr.addColorStop(1, SASH.glass[1]);
    g.fillStyle = gr; for (let i = 0; i < n; i++) g.fillRect(X0 + i * pw + f, Y0 + f, pw - 2 * f, Y1 - Y0 - 2 * f);
    if ((Y1 - Y0) / my > 1.2) { g.fillStyle = SASH.frame; g.fillRect(X0, Y0 + (Y1 - Y0) * 0.36, X1 - X0, f); }   // the transom (not on a small square window)
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(X0, Y1, X1 - X0, Math.max(1.5, 0.08 * my));     // the sill's shadow line
  };
  // o: { cell, wall, slab (colour of the top strip), slabH (m), spandrel (colour under the windows), piers: { color, w } at the cell joints, groups: [[x0, x1, sashes]] (m), wt / wb: window head / sill (m from the cell top),
  //      rail: { color, from, to } a light balcony rail panel over the groups listed in rail.groups }
  const sashMat = (key, o) => facadeMat(ctx, key, { W: Math.round(o.cell * sashPx), H: Math.round(FH * sashPx), draw: (g, W, H) => {
    const mx = W / o.cell, my = H / FH;
    g.fillStyle = o.wall; g.fillRect(0, 0, W, H);
    if (o.spandrel) { g.fillStyle = o.spandrel; g.fillRect(0, o.wb * my, W, H - o.wb * my); }
    if (o.slab) { g.fillStyle = o.slab; g.fillRect(0, 0, W, o.slabH * my); g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, o.slabH * my, W, Math.max(1.5, 0.05 * my)); }
    if (o.piers) { g.fillStyle = o.piers.color; g.fillRect(0, 0, o.piers.w / 2 * mx, H); g.fillRect(W - o.piers.w / 2 * mx, 0, o.piers.w / 2 * mx, H); }
    o.groups.forEach(([x0, x1, n], i) => {
      sashGroup(g, mx, my, x0, x1, o.wt, o.wb, n);
      if (o.rail?.groups.includes(i)) {
        g.globalAlpha = o.rail.alpha ?? 1; g.fillStyle = o.rail.color; g.fillRect(x0 * mx, o.rail.from * my, (x1 - x0) * mx, (o.rail.to - o.rail.from) * my); g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 * mx, o.rail.from * my, (x1 - x0) * mx, Math.max(1.5, 0.05 * my));
        g.fillStyle = 'rgba(255,255,255,0.45)'; for (let q = x0 + 0.45; q < x1 - 0.2; q += 0.45) g.fillRect(q * mx, (o.rail.from + 0.08) * my, Math.max(1, 0.03 * mx), (o.rail.to - o.rail.from - 0.1) * my);
      }
    });
  }, win: [o.groups[0][0] / o.cell, 1 - o.wb / FH, o.groups[o.groups.length - 1][1] / o.cell, 1 - o.wt / FH], lit: 0.12 });
  // the per-ground facade of a classroom block: { mat, tu (the cell's width, m), band (parapet material of a roof-edge band, or null), tower (the stair tower's material) }
  const groundFacade = (id) => {
    const lk = SCHOOL_INFO[id]?.look; if (!lk) return null;
    if (lk.style === 'jonan') {
      // Commons 153670155, measured against the 3.6 m storey pitch: window groups on a 3.9 m pitch, 3.25 m wide with 4 sashes and a transom, 1.85 m tall with the head 0.25 m under the slab line; the tower's windows are two
      // 0.85 m square sashes (1.7 x 0.85 m) at the stair landings, 1.85 m under the cell top
      const cell = 3.9, wall = lk.wall;
      const mat = sashMat('school-jonan', { cell, wall, wt: 0.25, wb: 2.1, groups: [[0.325, 3.575, 4]] });
      const tower = sashMat('school-jonan-tower', { cell: 3.6, wall, wt: 1.85, wb: 2.7, groups: [[0.95, 2.65, 2]] });
      return { mat, tu: cell, tower, band: t(lk.band, { paint: 0.03 }), parapet: t('#dedacb', { paint: 0.02 }) };
    }
    if (lk.style === 'shishioriJ') {
      const cell = 3.6;
      return { mat: sashMat('school-shishiorij', { cell, wall: lk.wall, slab: lk.slab, slabH: 0.5, wt: 0.6, wb: 2.2, groups: [[0.35, 3.25, 3]],
        rail: { color: '#aab2ab', alpha: 0.6, from: 1.75, to: 2.8, groups: [0] } }), tu: cell, parapet: t(lk.slab, { paint: 0.03 }) };
    }
    if (lk.style === 'shishioriE') {
      const cell = 7.2;
      return { mat: sashMat('school-shishiorie', { cell, wall: lk.wall, spandrel: '#dedfdc', slab: '#f1efe9', slabH: 0.22, piers: { color: lk.pier, w: lk.pierW }, wt: 0.5, wb: 2.1,
        groups: [[0.8, 3.8, 3], [4.2, 6.4, 2]], rail: { color: lk.rail, from: 2.4, to: 3.45, groups: [1] } }), tu: cell, parapet: t(lk.wall, { paint: 0.02 }) };
    }
    return null;
  };
  const gymWall = facadeMat(ctx, 'school-gym', { W: 128, H: 256, draw: (g, W, H) => {
    g.fillStyle = '#ecebe4'; g.fillRect(0, 0, W, H);
    const Y0 = H * 0.08, Y1 = H * 0.22;
    g.fillStyle = '#dcdcd6'; g.fillRect(0, Y1 + 4, W, 3);
    const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#6a8196'); gr.addColorStop(1, '#b5c5d0'); g.fillStyle = gr; g.fillRect(W * 0.12, Y0, W * 0.76, Y1 - Y0);
    g.fillStyle = '#c9c9c2'; g.fillRect(0, H * 0.9, W, H * 0.1);
  }, win: [0.12, 0.78, 0.88, 0.92], lit: 0.1 });
  const plinth = t('#a8a59d', { paint: 0.06 }), parapet = t('#e2e2dd', { paint: 0.02 }), rail = t('#7d838b', { paint: 0 });
  const out = { schools: {}, lots: 0 };
  const byGround = new Map();
  for (const lot of L.LOTS) { const s = lot.landmark; if (!s || !String(s).startsWith('school:')) continue; const id = s.slice(7); if (!byGround.has(id)) byGround.set(id, []); byGround.get(id).push(lot); }
  for (const [id, lots] of byGround) {
    const info = SCHOOL_INFO[id] || {};
    let maxTop = 0;
    const concrete = id === 'schKesennumaE', gf = groundFacade(id), blockM = concrete ? blockConcrete : (gf?.mat || block);
    // the central block is the largest classroom block: it carries the projecting vertical concrete fins
    const central = concrete ? lots.filter((l) => schoolKind(l) === 'block').sort((u, v) => v.area - u.area)[0] : null;
    for (const lot of lots) {
      const kind = schoolKind(lot), st = schoolStoreys(lot, kind), poly = lot.poly, gs = groundSpan(L, poly), y0 = gs.lo + 0.3;
      const roofCol = lot.roof?.color || '#c9ccc9';
      k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), plinth);
      if (kind === 'gym') {
        const eave = y0 + 8.0, o = obbOf(poly);
        k.mesh(wallGeo(poly, y0, eave, { tu: 3.0, tv: 8.0, yRef: y0 }), gymWall);
        const gShape = pitchedShape(lot);
        if (gShape) {
          // 鹿折小's gym: a pitched gable roof and thin teal stripes round the wall (Commons 150521570)
          const rise = pitchedSchoolRoof(lot, poly, eave, gShape, 0.2);
          // [v6:schools-r3] two teal stripes (SCHOOL_INFO.schShishioriE.look.teal #3f9a8a, Commons 150521570 and the 浦島小 photo): one at the eave line, one under the window band (about 3.6 m lower)
          const teal = t(info.look?.teal || '#3f9a8a', { paint: 0.02 });
          for (const dy of [0.3, 3.9]) k.mesh(prismWalls(offsetRing(poly, 0.05), eave - dy, eave - dy + 0.3, { tile: 3 }), teal);
          maxTop = Math.max(maxTop, eave + rise);
          colliders(ctx, poly, gs.lo - 2, eave + rise);
          out.lots++;
          continue;
        }
        // barrel roof along the long side: a flattened half cylinder over the OBB, closed by the flat cap under it
        const v = new THREE.CylinderGeometry(1, 1, o.d + 0.4, 20, 1, false, Math.PI / 2, Math.PI);
        v.rotateX(Math.PI / 2); v.scale(o.w / 2 + 0.2, Math.min(4.2, o.w * 0.14), 1);
        const m = new THREE.Mesh(v, roofMat(roofCol)); m.position.set(o.cx, eave, o.cz); m.rotation.y = o.rotY; m.castShadow = m.receiveShadow = true; k.parent.add(m);
        k.mesh(capGeo(poly, eave, { tile: 3 }), roofMat(roofCol));
        for (const s of [-1, 1]) { const e = obbPt(o, 0, s * (o.d / 2 + 0.2)); const gg = new THREE.CircleGeometry(1, 20, 0, Math.PI); gg.scale(o.w / 2 + 0.2, Math.min(4.2, o.w * 0.14), 1); const gm = new THREE.Mesh(gg, t('#ecebe4', { paint: 0.02, side: 'double' })); gm.position.set(e[0], eave, e[1]); gm.rotation.y = o.rotY; k.parent.add(gm); }
        maxTop = Math.max(maxTop, eave);
        colliders(ctx, poly, gs.lo - 2, eave + 2);
      } else {
        const top = y0 + st * FH + schoolTopExtra(lot);
        const isTower = !!gf?.tower && info.look.tower?.includes(lot.id), tu = kind === 'shed' ? 3.6 : isTower ? 3.6 : gf?.tu || 3.6;
        k.mesh(wallGeo(poly, y0, top, { tu, tv: FH, yRef: y0 }), kind === 'shed' ? gymWall : isTower ? gf.tower : blockM);
        const bShape = pitchedShape(lot);
        if (bShape) {
          const rise = pitchedSchoolRoof(lot, poly, top, bShape, 0.22);   // no parapet and no rooftop railing under a pitched roof
          maxTop = Math.max(maxTop, top + rise);
          colliders(ctx, poly, gs.lo - 2, top + 1);
          out.lots++;
          continue;
        }
        // [v6:schools-r3] 条南中: a 0.9 m yellow roof-edge band (the parapet) on the main bar and the low wing, and no rooftop railings (none show in Commons 153670155)
        const banded = !!gf?.band && info.look.bandLots?.includes(lot.id);
        flatRoof(k, poly, top, roofMat(roofCol), banded ? gf.band : (gf?.parapet || parapet), kind === 'shed' ? 0.4 : 0.9);
        if (kind === 'block' && info.look?.style !== 'jonan') for (const e of edges(poly)) if (e.len > 6) for (let s = 0.5; s < e.len; s += 2.4) k.box(0.05, 1.1, 0.05, rail, [e.a[0] + e.ux * s - e.n[0] * 0.3, top + 1.45, e.a[1] + e.uz * s - e.n[1] * 0.3]);
        if (lot === central) {
          // [v6:c5] 0.4 x 0.6 m vertical concrete fins between the bays, every 3.6 m (one per facade cell) on the long faces
          const finM = t('#b0b1ad', { paint: 0.04 });
          for (const e of edges(poly)) {
            if (e.len < 15) continue;
            const ang = Math.atan2(e.n[0], e.n[1]);
            for (let q = (3.6 - (e.len % 3.6) / 2) % 3.6; q < e.len - 0.3; q += 3.6) {
              if (q < 0.3) continue;
              k.box(0.4, top - y0, 0.6, finM, [e.a[0] + e.ux * q + e.n[0] * 0.3, (y0 + top) / 2, e.a[1] + e.uz * q + e.n[1] * 0.3], [0, ang, 0]);
            }
          }
        }
        maxTop = Math.max(maxTop, top);
        colliders(ctx, poly, gs.lo - 2, top + 1);
      }
      out.lots++;
    }
    // 気仙沼小: the concrete stair cylinder with its vertical glazing slit, rising above the 3-storey roof
    if (info.stairTower) {
      const [x, z] = info.stairTower, y = L.heightAt(x, z) + 0.3;
      const R = info.stairR || 3, SH = 3 * FH + 5;   // [v6:c5] rises about 1.5 storeys above the roof (Commons 2025-09-28), clock near the top
      k.cyl(R, R, SH, t('#b4b5b1', { paint: 0.04 }), [x, y + SH / 2, z], null, 20);
      k.box(1.2, 3 * FH + 3.0, 0.2, nightMat(ctx, '#6d8397', '#ffe0b0', 1.1), [x + R * 0.66, y + (3 * FH + 3.0) / 2 + 0.6, z + R * 0.78], [0, 0.7, 0]);
      k.cyl(R + 0.1, R + 0.1, 0.4, t('#c4c5c1', { paint: 0 }), [x, y + SH + 0.2, z], null, 20);
      const cy = y + 3 * FH + 4.2, G = k.group([x + Math.sin(0.7) * (R + 0.02), cy, z + Math.cos(0.7) * (R + 0.02)], 0.7), kc = ctx.kit(G);
      kc.cyl(0.68, 0.68, 0.1, t('#4a4d55', { paint: 0 }), [0, 0, 0], [Math.PI / 2, 0, 0], 20);
      kc.cyl(0.6, 0.6, 0.12, t('#f4f4f0', { paint: 0 }), [0, 0, 0.02], [Math.PI / 2, 0, 0], 20);
      kc.box(0.05, 0.42, 0.04, t('#2b2a33', { paint: 0 }), [0, 0.18, 0.1]);
      kc.box(0.34, 0.05, 0.04, t('#2b2a33', { paint: 0 }), [0.14, 0, 0.1]);
    }
    // the gate: two concrete posts with the vertical name plate at the ground vertex nearest a road
    const ring = SCHOOLS[id].poly, c = centroid(ring);
    let best = null;
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [x, z] of ring) { bx0 = Math.min(bx0, x); bz0 = Math.min(bz0, z); bx1 = Math.max(bx1, x); bz1 = Math.max(bz1, z); }
    for (const r of L.ROADS) { if (r.kind === 'alley') continue; for (const p of r.pts) { if (p[0] < bx0 - 25 || p[0] > bx1 + 25 || p[1] < bz0 - 25 || p[1] > bz1 + 25) continue; for (const q of ring) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 25 && (!best || d < best.d)) best = { d, q }; } } }
    if (best && info.sign) {
      const [gx, gz] = best.q, dir = Math.atan2(c[0] - gx, c[1] - gz), gy = L.heightAt(gx, gz);
      const ux = Math.sin(dir), uz = Math.cos(dir), px = [gx + ux * 2 - uz * 3, gz + uz * 2 + ux * 3], py = [gx + ux * 2 + uz * 3, gz + uz * 2 - ux * 3];
      for (const p of [px, py]) k.box(0.6, 1.8, 0.6, t('#bdbab2', { paint: 0.05 }), [p[0], gy + 0.9, p[1]]);
      vsign(ctx, k, info.sign, 0.42, 2.6, px[0] - ux * 0.31, gy + 1.5, px[1] - uz * 0.31, dir + Math.PI, { bg: '#f2efe6' });
      out.schools[id] = { gate: [gx, gz], lots: lots.length, top: maxTop };
    } else out.schools[id] = { gate: null, lots: lots.length, top: maxTop };
  }
  // pools
  const water = t('#3d8fc9', { paint: 0.02 }), deckM = t('#c9c7bf', { paint: 0.05 }), fence = t('#5d9a6a', { paint: 0, transparent: true, opacity: 0.55, side: 'double' }), lane = t('#e8e6de', { paint: 0 });
  out.pools = 0;
  for (const [id, p] of Object.entries(POOLS_HELI)) {
    if (!id.startsWith('pool')) continue;
    const gs = groundSpan(L, p.poly), y = gs.hi + 0.3, o = obbOf(p.poly);
    const deck = offsetRing(p.poly, 2.5);
    k.mesh(prismWalls(deck, gs.lo - 0.5, y, { tile: 2 }), deckM);
    k.mesh(capGeo(deck, y, { tile: 2, holes: [p.poly] }), deckM);
    k.mesh(capGeo(p.poly, y - 0.3, { tile: 2 }), water);
    const P = k.group([o.cx, y - 0.28, o.cz], o.rotY), kp = ctx.kit(P);
    for (let i = 1; i < 6; i++) kp.box(0.08, 0.04, o.d - 0.5, lane, [-o.w / 2 + i * o.w / 6, 0, 0]);
    k.mesh(prismWalls(offsetRing(p.poly, 3.4), y, y + 1.5, { tile: 2 }), fence);   // a 1.5 m mesh fence (the audit counts > 2.2 m as building)
    out.pools++;
  }
  return out;
}
