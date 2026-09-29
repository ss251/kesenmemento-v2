// [v3:harbor] The two big bridges, parametric so they sit between real endpoints.
//
//   buildBridgeKanae(ctx, a, b, opts)   気仙沼湾横断橋 (かなえ大橋, 2021): steel-concrete cable-stayed bridge, main span
//        360 m, two inverted-Y (逆Y字) pylons ~100 m, fan cables in two planes, box-girder deck, long approach
//        viaducts on paired columns. Total ~1344 m in reality; any a-b length works (spans scale down if short).
//   buildBridgeOshima(ctx, a, b, opts)  気仙沼大島大橋 (鶴亀大橋, 2019): white steel half-through (中路式) arch, arch span
//        297 m, total 356 m; the deck passes through the ribs, hung by hangers in the middle, on posts near the ends.
//
// a, b: deck-end points [x, z] or [x, y, z] (y = deck height at that abutment; default: terrain + 1 m, min 12).
// opts: { deckY (crest height), mainSpan, pylonH, width, seed, lights: true }
// Returns { group, deck: [[x,y,z],...] (centreline samples), towers: [[x,y,z] tops], perches, lamps }.
import * as THREE from 'three';
import { nightMat, addGlint, registry, lightupMat } from './lights.js';

const COL = { white: '#e9ebe6', whiteShade: '#d7dbd7', grey: '#bfc3c1', concrete: '#c8c5bb', asphalt: '#6c6e73', line: '#eeece6', rail: '#9aa2aa', cable: '#f1f2ee' };

function endY(ctx, p) {
  if (p.length >= 3) return p[1];
  const h = ctx.L?.heightAt ? ctx.L.heightAt(p[0], p[1]) : 0;
  return Math.max(12, h + 1);
}
const XZ = (p) => (p.length >= 3 ? [p[0], p[2]] : [p[0], p[1]]);

function frame(ctx, a, b, name) {
  const A = XZ(a), B = XZ(b);
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz);
  const g = new THREE.Group(); g.name = name;
  g.position.set(A[0], 0, A[1]); g.rotation.y = Math.atan2(dx, dz);   // local +Z runs a -> b, +X to the right-hand side
  ctx.addStatic(g); g.updateMatrixWorld(true);
  return { g, L, A, B, yA: endY(ctx, a), yB: endY(ctx, b), toW: (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld) };
}

/** A rectangular tube (w across X, h tall) swept along a polyline in the local YZ plane: pts [[y, z], ...]. */
function sweepYZ(pts, w, h, x = 0) {
  const P = [], I = [];
  const n = pts.length;
  const tang = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const dy = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dy, dz) || 1; return [dy / l, dz / l]; };
  const ring = [];
  for (let i = 0; i < n; i++) {
    const [ty, tz] = tang(i); const ny = tz, nz = -ty;   // up-normal of the curve in YZ
    const [y, z] = pts[i];
    const up = [ny * h / 2, nz * h / 2];
    ring.push([[x - w / 2, y + up[0], z + up[1]], [x + w / 2, y + up[0], z + up[1]], [x + w / 2, y - up[0], z - up[1]], [x - w / 2, y - up[0], z - up[1]]]);
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < 4; s++) {
    const a = ring[i][s], b = ring[i][(s + 1) % 4], c = ring[i + 1][(s + 1) % 4], d = ring[i + 1][s];
    const o = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  for (const [i, flip] of [[0, true], [n - 1, false]]) { const r = ring[i]; const o = P.length / 3; P.push(...r[0], ...r[1], ...r[2], ...r[3]); if (flip) I.push(o, o + 1, o + 2, o, o + 2, o + 3); else I.push(o, o + 2, o + 1, o, o + 3, o + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}

function mats(ctx) {
  if (ctx.__bridgeMats) return ctx.__bridgeMats;
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = {
    white: t(COL.white, { paint: 0.04, side: 'double' }), shade: t(COL.whiteShade, { paint: 0.05 }), grey: t(COL.grey, { paint: 0.06 }),
    concrete: t(COL.concrete, { paint: 0.08 }), asphalt: t(COL.asphalt, { paint: 0.03 }), line: ctx.mat.decal(COL.line), rail: t(COL.rail, { paint: 0 }),
    lamp: nightMat(ctx, '#dedfd8', '#ffe6bd', 2.2), red: nightMat(ctx, '#b8403a', '#ff3a2a', 2.6, { always: 0.35 }),
    up: nightMat(ctx, '#e9ebe6', '#e9f0ff', 1.05),
  };
  ctx.__bridgeMats = m;
  return m;
}

/** Deck: girder + asphalt + edge barriers + lines + lamps, following yAt(z). Returns sampled centreline. */
function deck(ctx, F, k, m, yAt, { width = 13, girderH = 2.6, lampSp = 36, z0 = 0, z1 = F.L, lights = true, chain = 0, chainColor = '#fff1d6' } = {}) {
  const n = Math.max(8, Math.ceil((z1 - z0) / 12));
  const pts = []; for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; pts.push([yAt(z), z]); }
  k.mesh(sweepYZ(pts.map(([y, z]) => [y - girderH / 2 - 0.25, z]), width - 1.2, girderH), m.shade);          // box girder
  k.mesh(sweepYZ(pts.map(([y, z]) => [y - 0.2, z]), width, 0.5), m.white);                                     // slab with overhangs
  k.mesh(sweepYZ(pts.map(([y, z]) => [y + 0.07, z]), width - 1.6, 0.06), m.asphalt);                           // road
  for (const s of [-1, 1]) {
    k.mesh(sweepYZ(pts.map(([y, z]) => [y + 0.5, z]), 0.35, 0.9, s * (width / 2 - 0.25)), m.white);           // concrete barriers
    k.mesh(sweepYZ(pts.map(([y, z]) => [y + 1.2, z]), 0.12, 0.1, s * (width / 2 - 0.25)), m.rail);            // top rail
    k.mesh(sweepYZ(pts.map(([y, z]) => [y + 0.115, z]), 0.15, 0.02, s * (width / 2 - 1.4)), m.line);         // edge lines
  }
  // dashed centre line
  for (let z = z0 + 4; z < z1 - 4; z += 12) { const y = yAt(z); k.box(0.15, 0.02, 6, m.line, [0, y + 0.12, z + 3]); }
  // lamp posts (single-arm, alternating) + night glow registration
  const lamps = [];
  for (let z = z0 + lampSp / 2, i = 0; z < z1; z += lampSp, i++) {
    const s = i % 2 ? 1 : -1, y = yAt(z);
    k.box(0.2, 9, 0.2, m.rail, [s * (width / 2 - 0.3), y + 1.0 + 4.5, z]);
    k.box(1.8, 0.14, 0.14, m.rail, [s * (width / 2 - 1.1), y + 10.0, z]);
    k.box(0.7, 0.14, 0.34, m.lamp, [s * (width / 2 - 1.8), y + 9.9, z]);
    const w = F.toW(s * (width / 2 - 1.8), y + 9.8, z); lamps.push([w.x, w.y, w.z]);
  }
  if (lights && registry(ctx)) for (const p of lamps) registry(ctx).point({ x: p[0], y: p[1], z: p[2], color: '#ffe6bd', size: 0.9, intensity: 2.0, mode: 'lamps' });
  // [v3:fix] a chain of small deck-edge lights along both barriers (the bridge reads as a necklace across the bay at night)
  if (chain > 0 && lights && registry(ctx)) {
    for (let z = z0 + chain / 2, i = 0; z < z1; z += chain, i++) for (const s of [-1, 1]) {
      const w = F.toW(s * (width / 2 + 0.05), yAt(z) + 1.28, z);
      registry(ctx).point({ x: w.x, y: w.y, z: w.z, color: chainColor, size: 0.4, intensity: 1.7, mode: 'lamps' });
    }
  }
  return { pts: pts.map(([y, z]) => { const w = F.toW(0, y, z); return [w.x, w.y, w.z]; }), lamps };
}

function pier(ctx, k, m, F, z, yTop, { width = 11, twin = true, r = 1.3 } = {}) {
  const w = F.toW(0, 0, z);
  const g0 = ctx.L?.heightAt ? ctx.L.heightAt(w.x, w.z) : -6;
  const wet = ctx.L?.isWater ? ctx.L.isWater(w.x, w.z) : g0 < 0;
  const yb = Math.min(g0, wet ? -3 : g0) - 1;
  const h = yTop - yb; if (h < 1) return;
  if (twin) for (const s of [-1, 1]) k.rbox(r * 2, h, r * 2, 0.4, m.concrete, [s * width * 0.3, yb + h / 2, z]);
  else k.rbox(width * 0.55, h, r * 2, 0.5, m.concrete, [0, yb + h / 2, z]);
  k.rbox(width - 0.4, 1.6, r * 2 + 0.6, 0.3, m.concrete, [0, yTop - 0.8, z]);                                   // cap beam
  if (wet) k.rbox(width * 0.9, 1.2, r * 2 + 3, 0.5, m.grey, [0, 0.35, z]);                                       // footing at the waterline
}

/** Abutments: a concrete block from the ground up under each deck end that does not meet the terrain. */
function abutments(ctx, k, m, F, yAt, width) {
  for (const z of [0, F.L]) {
    const w = F.toW(0, 0, z), g0 = ctx.L?.heightAt ? ctx.L.heightAt(w.x, w.z) : 0, y = yAt(z) - 0.5;
    if (y - g0 < 1.2) continue;
    const zc = z === 0 ? 3 : F.L - 3;
    k.box(width + 1.5, y - g0 + 2, 6, m.concrete, [0, (y + g0 - 2) / 2, zc]);
    k.box(width + 2.2, 0.8, 6.6, m.grey, [0, y - 0.3, zc]);
  }
}

// ------------------------------------------------------------------------------------------------ Kanae
export function buildBridgeKanae(ctx, a, b, opts = {}) {
  const F = frame(ctx, a, b, 'bridge:kanae');
  const k = ctx.kit(F.g), m = mats(ctx);
  const L = F.L, zc = opts.centerAt ?? L / 2;
  const main = Math.min(opts.mainSpan ?? 360, L * 0.55);
  const zT = [zc - main / 2, zc + main / 2];
  const sideA = Math.max(20, Math.min(160, zT[0] * 0.9)), sideB = Math.max(20, Math.min(160, (L - zT[1]) * 0.9)), side = Math.max(sideA, sideB);
  const crest = opts.deckY ?? 34, pylonH = opts.pylonH ?? 100, width = opts.width ?? 13;
  // deck profile: ends at the abutments, rising on the approaches to a gentle vertical curve over the channel
  const yAt = (z) => {
    const t = z / L, base = F.yA + (F.yB - F.yA) * t;
    const u = Math.min(1, z < zc ? z / Math.max(1, zT[0]) : (L - z) / Math.max(1, L - zT[1]));
    const s = u * u * (3 - 2 * u);
    const hump = 1.8 * (1 - ((z - zc) / (main / 2 + (z < zc ? sideA : sideB))) ** 2);
    // ramp over each approach (the two sides may differ in length when the centre is off-middle)
    return base + (crest - base) * s + Math.max(0, hump) * s;
  };
  const D = deck(ctx, F, k, m, yAt, { width, lights: opts.lights !== false, chain: 9 });   // [v3:fix] deck-light chain
  abutments(ctx, k, m, F, yAt, width);
  // approach piers every ~50 m outside the cable-stayed part, plus the end piers of the side spans
  const piers = [];
  for (let z = 40; z < zT[0] - sideA + 5; z += 50) piers.push(z);
  for (let z = L - 40; z > zT[1] + sideB - 5; z -= 50) piers.push(z);
  piers.push(zT[0] - sideA, zT[1] + sideB);
  for (const z of piers) if (z > 5 && z < L - 5) pier(ctx, k, m, F, z, yAt(z) - 3.0, { width });
  // pylons: inverted Y — two legs from the footing, passing outside the deck, meeting ~18 m above it
  const towers = [];
  for (const z of zT) {
    const w = F.toW(0, 0, z);
    const g0 = ctx.L?.heightAt ? Math.min(ctx.L.heightAt(w.x, w.z), 0) : 0;
    const yb = g0 - 2, yd = yAt(z), yJ = yd + 20, yTop = Math.max(yd + 45, pylonH);
    const legX = width / 2 + 5.5;
    for (const s of [-1, 1]) {
      const pts = [[yb, 0], [yd - 4, 0], [yJ, 0]];
      const geoLeg = new THREE.CylinderGeometry(1, 1, 1, 6);
      // legs as tapered boxes from (s*legX, yb) to (s*1.6, yJ)
      const x0 = s * legX, x1 = s * 1.6, h = Math.hypot(x1 - x0, yJ - yb), ang = Math.atan2(x1 - x0, yJ - yb);
      k.mesh(new THREE.BoxGeometry(3.4, h, 4.2), m.white, [(x0 + x1) / 2, (yb + yJ) / 2, z], [0, 0, -ang]);
      if (opts.lightup !== false) ctx.noOutline(k.mesh(new THREE.BoxGeometry(3.55, h, 4.35), lightupMat(ctx, '#dfe9ff', 0.55, 0, 90), [(x0 + x1) / 2, (yb + yJ) / 2, z], [0, 0, -ang]));
      void pts; void geoLeg;
    }
    // strut under the deck + mast above the joint (tapering), crown
    k.box(legX * 2 - 1, 2.4, 4.0, m.shade, [0, yd - 4.5, z]);
    const mastH = yTop - yJ;
    k.mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), m.white, [0, yJ - 1, z], null, [3.8, mastH + 1, 4.6]);
    k.box(4.4, 1.2, 5.2, m.shade, [0, yTop, z]);
    if (opts.lightup !== false) ctx.noOutline(k.mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lightupMat(ctx, '#dfe9ff', 0.55, 0, 90), [0, yJ - 1, z], null, [4.0, mastH + 1, 4.8]));
    // footing island
    if (g0 <= 0) { k.rbox(legX * 2 + 8, 3, 12, 0.8, m.grey, [0, 0.6, z]); }
    // aviation light + a soft uplight on the mast face at night
    k.box(0.8, 0.8, 0.8, m.red, [0, yTop + 1.0, z]);
    const tw = F.toW(0, yTop + 1.2, z); towers.push([tw.x, tw.y, tw.z]);
    registry(ctx)?.aviation({ x: tw.x, y: tw.y, z: tw.z });
    // cables: two planes, fan from the upper mast to the deck edges, both sides of the tower
    const nC = opts.cables ?? 13;
    for (const dir of [-1, 1]) {
      const reach = dir < 0 ? (z === zT[0] ? sideA : main / 2) : (z === zT[0] ? main / 2 : sideB);
      for (let i = 0; i < nC; i++) {
        const t = (i + 1) / nC;
        const zz = z + dir * (8 + (reach - 12) * t);
        const ya = yJ + 6 + (mastH - 9) * (0.15 + 0.85 * t);
        for (const s of [-1, 1]) {
          const p0 = F.toW(s * 1.2, ya, z + dir * 1.2), p1 = F.toW(s * (width / 2 - 0.1), yAt(zz) + 0.6, zz);
          ctx.wires.add([p0, p1], { width: 0.12, color: COL.cable });
        }
      }
    }
    // uplight glints on the water under the towers (night)
    const ww = F.toW(0, 0, z + 6); addGlint(ctx, ww.x, 0, ww.z, '#e9f0ff', 2.0, 40, 0.35);
  }
  // deck lamp reflections on the water across the channel
  for (const p of D.lamps) { const z = F.g.worldToLocal(new THREE.Vector3(...p)).z; if (z > zT[0] - 20 && z < zT[1] + 20) addGlint(ctx, p[0], 0, p[2], '#ffe0b0', 0.9, 30, 0.5); }
  return { group: F.g, deck: D.pts, towers, lamps: D.lamps, perches: towers.map((t) => [t[0], t[1] + 0.8, t[2]]), spans: { main, side } };
}

// ------------------------------------------------------------------------------------------------ Oshima
export function buildBridgeOshima(ctx, a, b, opts = {}) {
  const F = frame(ctx, a, b, 'bridge:oshima');
  const k = ctx.kit(F.g), m = mats(ctx);
  const L = F.L, zc = opts.centerAt ?? L / 2;
  const span = Math.min(opts.archSpan ?? 297, L * 0.86);
  const spring = opts.springY ?? 6, rise = opts.rise ?? span * 0.2, width = opts.width ?? 11;
  const crest = opts.deckY ?? 32;
  const yAt = (z) => {
    const t = z / L, base = F.yA + (F.yB - F.yA) * t;
    const u = Math.min(1, z < zc ? z / Math.max(1, zc - span / 2 + 30) : (L - z) / Math.max(1, L - zc - span / 2 + 30)); const s = u * u * (3 - 2 * u);
    return base + (crest - base) * s + Math.max(0, 1.2 * (1 - ((z - zc) / (L / 2)) ** 2));
  };
  const D = deck(ctx, F, k, m, yAt, { width, lampSp: 30, lights: opts.lights !== false });
  abutments(ctx, k, m, F, yAt, width);
  // two arch ribs (parabola), rib spacing wider than the deck; tilted slightly inward (basket-handle feel)
  const ribX = width / 2 + 2.2, nS = 48;
  const archY = (z) => spring + rise * (1 - ((z - zc) / (span / 2)) ** 2);
  const ribPts = []; for (let i = 0; i <= nS; i++) { const z = zc - span / 2 + span * i / nS; ribPts.push([archY(z), z]); }
  for (const s of [-1, 1]) {
    k.mesh(sweepYZ(ribPts, 2.6, 3.4, s * ribX), m.white);
    if (opts.lightup !== false) ctx.noOutline(k.mesh(sweepYZ(ribPts, 2.8, 3.6, s * ribX), lightupMat(ctx, '#f4f7ff', 0.5, spring, 60)));
  }
  // springing blocks on the shore rock
  for (const z of [zc - span / 2, zc + span / 2]) k.rbox(ribX * 2 + 6, 8, 10, 0.8, m.concrete, [0, spring - 3, z]);
  // lateral bracing above the deck where there is headroom (K-braces between the ribs)
  for (let z = zc - span / 2 + 10; z <= zc + span / 2 - 10; z += 12) {
    const y = archY(z); if (y < yAt(z) + 7.5) continue;
    k.box(ribX * 2, 1.2, 1.4, m.white, [0, y, z]);
    if (Math.round((z - zc) / 12) % 2 === 0) for (const s of [-1, 1]) {
      const len = Math.hypot(ribX, 12), ang = Math.atan2(12, ribX);
      k.box(len, 0.8, 0.8, m.shade, [s * ribX / 2, y - 0.2, z + 6], [0, s * ang, 0]);
    }
  }
  // hangers (arch above deck) / posts (arch below deck); deck cross-beams at each station
  for (let z = zc - span / 2 + 8; z <= zc + span / 2 - 8; z += 8) {
    const ya = archY(z), yd = yAt(z);
    for (const s of [-1, 1]) {
      if (ya > yd + 1.5) { const p0 = F.toW(s * ribX, ya - 1.6, z), p1 = F.toW(s * ribX, yd - 0.2, z); ctx.wires.add([p0, p1], { width: 0.14, color: COL.cable }); }
      else if (ya < yd - 2.5) k.box(0.9, yd - ya - 1.4, 0.9, m.white, [s * ribX, (ya + yd) / 2 - 0.7, z]);
    }
    k.box(ribX * 2 + 1.2, 0.9, 0.8, m.shade, [0, yd - 1.0, z]);
  }
  // approach piers outside the arch
  for (let z = 18; z < zc - span / 2 - 4; z += 30) pier(ctx, k, m, F, z, yAt(z) - 3, { width, twin: false, r: 1.2 });
  for (let z = L - 18; z > zc + span / 2 + 4; z -= 30) pier(ctx, k, m, F, z, yAt(z) - 3, { width, twin: false, r: 1.2 });
  // arch crown lights (the bridge is lit at night) and lamps
  const crown = F.toW(0, archY(zc) + 2, zc);
  for (const s of [-1, 1]) for (let i = -4; i <= 4; i++) {
    const z = zc + i * span / 10, w = F.toW(s * ribX, archY(z) + 1.9, z);
    registry(ctx)?.point({ x: w.x, y: w.y, z: w.z, color: '#e9f0ff', size: 0.9, intensity: 1.6, mode: 'lamps' });
    k.box(0.5, 0.25, 0.5, m.lamp, [s * ribX, archY(z) + 1.85, z]);
  }
  for (const p of D.lamps) addGlint(ctx, p[0], 0, p[2], '#ffe0b0', 0.9, 26, 0.45);
  return { group: F.g, deck: D.pts, towers: [[crown.x, crown.y, crown.z]], lamps: D.lamps, perches: [[crown.x, crown.y + 1.8, crown.z]], span };
}
