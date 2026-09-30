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
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, flatRoof, colliders, capGeo, prismWalls, mapMat, nightMat, vsign, offsetRing, centroid, edges, inRing } from './kit.js';

const FH = 3.6;

export function schoolKind(lot) {
  const w = Math.min(lot.obb.w, lot.obb.d), d = Math.max(lot.obb.w, lot.obb.d);
  if (lot.area >= 550 && d / w <= 1.9 && lot.area <= 2600) return 'gym';
  if (lot.area < 150) return 'shed';
  return 'block';
}
export function schoolStoreys(lot, kind = schoolKind(lot)) { return kind === 'shed' ? 1 : kind === 'gym' ? 1 : lot.area < 320 ? 2 : 3; }

export function buildSchools(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  const { k } = group(ctx, 'lmB-schools');
  const block = facadeMat(ctx, 'school-block', { draw: (g, W, H) => {
    g.fillStyle = '#cfcfca'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e9e9e4'; g.fillRect(0, 0, W, H * 0.16);             // the balcony slab edge + parapet above the band
    g.fillStyle = '#b7b8b4'; g.fillRect(0, H * 0.16, W, 3);
    const Y0 = H * 0.24, Y1 = H * 0.78;
    const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#5d7489'); gr.addColorStop(1, '#b3c4cf'); g.fillStyle = gr; g.fillRect(0, Y0, W, Y1 - Y0);
    g.fillStyle = '#e4e6e3'; for (let x = 0; x <= W; x += W / 4) g.fillRect(x - 2, Y0, 4, Y1 - Y0); g.fillRect(0, (Y0 + Y1) / 2 - 1.5, W, 3);
    g.fillStyle = 'rgba(240,238,230,0.8)'; g.fillRect(4, Y0 + 3, W * 0.1, (Y1 - Y0) * 0.7);   // a curtain
  }, win: [0, 0.22, 1, 0.76], lit: 0.12 });
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
    for (const lot of lots) {
      const kind = schoolKind(lot), st = schoolStoreys(lot, kind), poly = lot.poly, gs = groundSpan(L, poly), y0 = gs.lo + 0.3;
      const roofCol = lot.roof?.color || '#c9ccc9';
      k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), plinth);
      if (kind === 'gym') {
        const eave = y0 + 8.0, o = obbOf(poly);
        k.mesh(wallGeo(poly, y0, eave, { tu: 3.0, tv: 8.0, yRef: y0 }), gymWall);
        // barrel roof along the long side: a flattened half cylinder over the OBB, closed by the flat cap under it
        const v = new THREE.CylinderGeometry(1, 1, o.d + 0.4, 20, 1, false, Math.PI / 2, Math.PI);
        v.rotateX(Math.PI / 2); v.scale(o.w / 2 + 0.2, Math.min(4.2, o.w * 0.14), 1);
        const m = new THREE.Mesh(v, t(roofCol, { paint: 0.04 })); m.position.set(o.cx, eave, o.cz); m.rotation.y = o.rotY; m.castShadow = m.receiveShadow = true; k.parent.add(m);
        k.mesh(capGeo(poly, eave, { tile: 3 }), t(roofCol, { paint: 0.04 }));
        for (const s of [-1, 1]) { const e = obbPt(o, 0, s * (o.d / 2 + 0.2)); const gg = new THREE.CircleGeometry(1, 20, 0, Math.PI); gg.scale(o.w / 2 + 0.2, Math.min(4.2, o.w * 0.14), 1); const gm = new THREE.Mesh(gg, t('#ecebe4', { paint: 0.02, side: 'double' })); gm.position.set(e[0], eave, e[1]); gm.rotation.y = o.rotY; k.parent.add(gm); }
        maxTop = Math.max(maxTop, eave);
        colliders(ctx, poly, gs.lo - 2, eave + 2);
      } else {
        const top = y0 + st * FH;
        k.mesh(wallGeo(poly, y0, top, { tu: 3.6, tv: FH, yRef: y0 }), kind === 'shed' ? gymWall : block);
        flatRoof(k, poly, top, t(roofCol, { paint: 0.04 }), parapet, kind === 'shed' ? 0.4 : 0.9);
        if (kind === 'block') for (const e of edges(poly)) if (e.len > 6) for (let s = 0.5; s < e.len; s += 2.4) k.box(0.05, 1.1, 0.05, rail, [e.a[0] + e.ux * s - e.n[0] * 0.3, top + 1.45, e.a[1] + e.uz * s - e.n[1] * 0.3]);
        maxTop = Math.max(maxTop, top);
        colliders(ctx, poly, gs.lo - 2, top + 1);
      }
      out.lots++;
    }
    // 気仙沼小: the concrete stair cylinder with its vertical glazing slit, rising above the 3-storey roof
    if (info.stairTower) {
      const [x, z] = info.stairTower, y = L.heightAt(x, z) + 0.3;
      const R = info.stairR || 3; k.cyl(R, R, 3 * FH + 3.4, t('#c4c4bf', { paint: 0.04 }), [x, y + (3 * FH + 3.4) / 2, z], null, 20);
      k.box(1.2, 3 * FH + 1.4, 0.2, nightMat(ctx, '#6d8397', '#ffe0b0', 1.1), [x + R * 0.66, y + (3 * FH + 1.4) / 2 + 0.6, z + R * 0.78], [0, 0.7, 0]);
      k.cyl(R + 0.1, R + 0.1, 0.4, t('#e6e6e1', { paint: 0 }), [x, y + 3 * FH + 3.6, z], null, 20);
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
