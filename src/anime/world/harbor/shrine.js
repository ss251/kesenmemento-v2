// [v3:harbor] 神明崎 landmarks and the 安波山 lookout.
//
//   buildUkimido(ctx, pose, { bridgeLen, waterY, shoreY })  浮見堂: small vermilion pavilion standing in the water,
//        reached by a railed vermilion walkway. pose = pavilion centre on the water; the walkway runs toward local -Z
//        (to the shore). Returns { group, perches, walk: [[x,z],...], deckY, lanterns }.
//   buildIsuzuTorii(ctx, pose, { h, span })   明神鳥居 in vermilion with a black kasagi, shimenawa and shide.
//   buildIsuzuShrine(ctx, pose, { steps })    五十鈴神社: a small 神明造 hall (plain wood, copper roof, chigi,
//        katsuogi) on a stone platform, stone lanterns, komainu, offering box, bell, and a stone stair toward +Z.
//   buildAnbaLookout(ctx, pose)               安波山 summit: timber deck, gazebo, rail, benches, signpost.
// pose: { x, y?, z, rotY } — y defaults to layout heightAt(x, z) (0 when absent).
import * as THREE from 'three';
import { poseGroup, vTextTex, textTex, FONT, sagPts, makeLiner, mapMat } from './util.js';
import { nightMat, addGlint, registry } from './lights.js';

const C = {
  shu: '#d8573d', shuDark: '#b5452f', black: '#3b3740', wood: '#b48a62', woodPale: '#cfb08a', woodDark: '#7a5a42',
  stone: '#aaa69b', stoneDark: '#8e8a80', copper: '#5f8f80', copperDark: '#4d766a', tile: '#5a5f6b', white: '#f1ede2',
  rope: '#d9c690', gold: '#d9b44a',
};
function M(ctx) {
  if (ctx.__shrineMats) return ctx.__shrineMats;
  const o = {};
  for (const [k, v] of Object.entries(C)) o[k] = ctx.mat.toon(v, { paint: /wood|stone/.test(k) ? 0.1 : 0.05 });
  ctx.__shrineMats = o;
  return o;
}
function groundY(ctx, pose) { return pose.y ?? (ctx.L?.heightAt ? ctx.L.heightAt(pose.x, pose.z) : 0); }
function place(ctx, pose, name, y) { const g = poseGroup({ ...pose, y }, name); ctx.addStatic(g); g.updateMatrixWorld(true); return g; }
function toWorld(g, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); }

/** Extrude an XY outline to a unit-depth prism centred on z = 0 (scale z to set the depth). */
function extrudeXY(pts) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.5);
  return g;
}

// ------------------------------------------------------------------------------------------------ roofs
/** Hip / pyramid roof with slight upturned eaves: returns a geometry, centred, base at y=0. */
function hipRoof(w, d, h, ridge = 0, curve = 0.25) {
  // 5x5 grid lofted from eave rectangle to ridge line, with a concave (反り) profile
  const g = new THREE.BufferGeometry();
  const rings = 6, P = [], I = [];
  // concave (反り) profile: shallow at the eaves, steep toward the ridge
  const ring = (t) => ({ hw: (w / 2) * (1 - t) + (ridge / 2) * t, hd: (d / 2) * (1 - t), y: h * Math.pow(t, 1 + curve * 2) });
  const pts = [];
  for (let i = 0; i <= rings; i++) { const { hw, hd, y } = ring(i / rings); pts.push([[-hw, y, -hd], [hw, y, -hd], [hw, y, hd], [-hw, y, hd]]); }
  for (let i = 0; i < rings; i++) for (let s = 0; s < 4; s++) {
    const a = pts[i][s], b = pts[i][(s + 1) % 4], c = pts[i + 1][(s + 1) % 4], d2 = pts[i + 1][s];
    const n = P.length / 3; P.push(...a, ...b, ...c, ...d2); I.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  // soffit (underside)
  { const a = pts[0]; const n = P.length / 3; P.push(...a[0], ...a[1], ...a[2], ...a[3]); I.push(n, n + 1, n + 2, n, n + 2, n + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}

/** Gable roof slab pair (for 神明造): ridge along local Z. */
function gableRoof(k, m, w, d, rise, y, thick = 0.22, over = 0.6) {
  const half = w / 2 + over, ang = Math.atan2(rise, w / 2), sl = half / Math.cos(ang);
  for (const s of [-1, 1]) k.box(sl, thick, d + over * 2, m, [s * half / 2, y + rise / 2 - over * Math.tan(ang) / 2 + 0.02, 0], [0, 0, -s * ang]);
  return { ang, half };
}

// ------------------------------------------------------------------------------------------------ 浮見堂
export function buildUkimido(ctx, pose, opts = {}) {
  const wy = opts.waterY ?? (ctx.L?.SEA?.level ?? 0);
  const deckY = wy + (opts.deckH ?? 2.1);
  const g = place(ctx, pose, 'ukimido', 0);
  const k = ctx.kit(g), m = M(ctx);
  const W = makeLiner(ctx, g);
  const size = 4.6, post = 0.2, roofY = deckY + 2.7;
  const Lb = opts.bridgeLen ?? 22, bw = 1.8;
  // stilts (grey concrete piles below, vermilion above deck)
  for (const x of [-size / 2, 0, size / 2]) for (const z of [-size / 2, 0, size / 2]) k.cyl(0.18, 0.2, deckY - wy + 1.5, m.stoneDark, [x, wy + (deckY - wy - 1.5) / 2, z], null, 8);
  // deck
  k.box(size + 0.9, 0.22, size + 0.9, m.wood, [0, deckY, 0]);
  k.box(size + 1.0, 0.1, size + 1.0, m.shuDark, [0, deckY - 0.14, 0]);
  // posts
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.box(post, 2.7, post, m.shu, [x * size / 2, deckY + 1.35, z * size / 2]);
  for (const x of [-1, 1]) k.box(post * 0.8, 2.7, post * 0.8, m.shu, [x * size / 2, deckY + 1.35, 0]);
  // tie beams (貫) + head beam
  for (const s of [-1, 1]) {
    k.box(size + 0.3, 0.22, 0.16, m.shu, [0, roofY - 0.1, s * size / 2]);
    k.box(0.16, 0.22, size + 0.3, m.shu, [s * size / 2, roofY - 0.1, 0]);
  }
  // railings on three sides (open toward the walkway at -Z)
  const railY = deckY + 0.75;
  for (const [ax, az, bx, bz] of [[-1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, -1, 1]]) {
    const len = Math.hypot((bx - ax) * size / 2, (bz - az) * size / 2);
    const cx = (ax + bx) * size / 4, cz = (az + bz) * size / 4, rot = ax === bx ? Math.PI / 2 : 0;
    k.box(len + 0.1, 0.1, 0.1, m.shu, [cx, railY, cz], [0, rot, 0]);
    k.box(len + 0.1, 0.07, 0.07, m.shu, [cx, deckY + 0.35, cz], [0, rot, 0]);
    for (let i = 1; i < 4; i++) { const t = i / 4; k.box(0.07, 0.62, 0.07, m.shu, [(ax + (bx - ax) * t) * size / 2, deckY + 0.42, (az + (bz - az) * t) * size / 2]); }
  }
  // pyramid roof with 反り and a finial
  const roof = hipRoof(size + 2.2, size + 2.2, 2.2, 0, 0.35);
  k.mesh(roof, ctx.mat.toon(C.tile, { paint: 0.06, side: 'double' }), [0, roofY, 0]);
  k.box(size + 2.3, 0.14, size + 2.3, m.shuDark, [0, roofY - 0.02, 0]);
  k.cyl(0.18, 0.28, 0.35, m.tile, [0, roofY + 2.2, 0], null, 10);
  k.sphere(0.2, m.gold, [0, roofY + 2.55, 0], 10);
  // a hanging plaque 浮見堂 under the eave facing the walkway (-Z)
  // [v3:polish] warm gold lettering that glows a little at night (dark-on-dark before)
  const plaque = vTextTex(ctx, '浮見堂', { w: 96, h: 256, color: '#e8d9a8', bg: '#3b3740', font: FONT.brush, border: '#d9b44a' });
  k.plane(0.42, 1.1, mapMat(ctx, 'toon', '#ffffff', plaque, { paint: 0, nightGlow: 0.4 }), [0, roofY - 0.75, -size / 2 - 0.12], [0, Math.PI, 0]);
  // walkway to the shore (-Z): slightly arched deck, rails, piles
  const nSeg = 10, arch = 0.5;
  const zS = -size / 2 - 0.45, zE = zS - Lb;
  const yAt = (t) => deckY + Math.sin(Math.PI * t) * arch * (1 - t * 0.2) - t * (opts.shoreDrop ?? 0);
  const railTop = [[], []], railMid = [[], []];
  for (let i = 0; i < nSeg; i++) {
    const t0 = i / nSeg, t1 = (i + 1) / nSeg, za = zS + (zE - zS) * t0, zb = zS + (zE - zS) * t1, ya = yAt(t0), yb = yAt(t1);
    const len = Math.hypot(zb - za, yb - ya), ang = Math.atan2(yb - ya, za - zb);
    k.box(bw, 0.16, len + 0.02, m.wood, [0, (ya + yb) / 2, (za + zb) / 2], [ang, 0, 0]);
    k.box(bw + 0.14, 0.1, len + 0.02, m.shuDark, [0, (ya + yb) / 2 - 0.12, (za + zb) / 2], [ang, 0, 0]);
    if (i % 2 === 0) for (const s of [-1, 1]) k.cyl(0.13, 0.15, ya - wy + 1.2, m.stoneDark, [s * bw * 0.4, wy + (ya - wy - 1.2) / 2 - 0.1, za], null, 8);
  }
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg, z = zS + (zE - zS) * t, y = yAt(t);
    for (const [j, s] of [[0, -1], [1, 1]]) {
      k.box(0.1, 0.85, 0.1, m.shu, [s * (bw / 2 + 0.02), y + 0.45, z]);
      if (i === 0 || i === nSeg) k.sphere(0.09, m.gold, [s * (bw / 2 + 0.02), y + 0.93, z], 8);   // 擬宝珠
      railTop[j].push([s * (bw / 2 + 0.02), y + 0.86, z]); railMid[j].push([s * (bw / 2 + 0.02), y + 0.45, z]);
    }
  }
  const railM = m.shu;
  for (const pts of [...railTop, ...railMid]) for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]); const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b), ang = Math.atan2(b.y - a.y, a.z - b.z);
    k.box(0.09, pts === railMid[0] || pts === railMid[1] ? 0.06 : 0.1, len + 0.05, railM, [mid.x, mid.y, mid.z], [ang, 0, 0]);
  }
  // two lanterns on the pavilion (lit at night) + reflections
  const lamp = nightMat(ctx, '#f1e6cf', '#ffb870', 2.2);
  const lanterns = [];
  for (const s of [-1, 1]) {
    const p = [s * (size / 2 - 0.1), roofY - 0.55, -size / 2 - 0.05];
    k.cyl(0.18, 0.18, 0.42, lamp, p, null, 10); k.cyl(0.2, 0.2, 0.05, m.black, [p[0], p[1] + 0.23, p[2]], null, 10); k.cyl(0.2, 0.2, 0.05, m.black, [p[0], p[1] - 0.23, p[2]], null, 10);
    const w = toWorld(g, ...p); lanterns.push(w); addGlint(ctx, w.x, wy, w.z, '#ffb070', 0.6, 8, 0.9);
    registry(ctx)?.lantern({ x: w.x, y: w.y, z: w.z, real: true, lightI: 5.5 });   // [v3:integrate] real light: the pavilion interior and plaque read at night
  }
  const perches = [toWorld(g, 0, roofY + 2.7, 0), toWorld(g, size / 2, railY + 0.08, size / 2), toWorld(g, -bw / 2, yAt(1) + 0.92, zE)];
  const walk = [toWorld(g, 0, deckY, 0), toWorld(g, 0, yAt(0.5), (zS + zE) / 2), toWorld(g, 0, yAt(1), zE)].map((v) => [v.x, v.z]);
  if (ctx.physics?.addWalkBox) {
    const c = toWorld(g, 0, 0, 0); ctx.physics.addWalkBox(c.x, c.z, size + 0.9, size + 0.9, pose.rotY || 0, deckY + 0.11);
    const b = toWorld(g, 0, 0, (zS + zE) / 2); ctx.physics.addWalkBox(b.x, b.z, bw, Lb, pose.rotY || 0, deckY + 0.1);
  }
  return { group: g, perches, walk, deckY, lanterns, shore: toWorld(g, 0, yAt(1), zE) };
}

// ------------------------------------------------------------------------------------------------ torii
export function toriiInto(ctx, k, { h = 5.2, span = 3.6, color = 'shu', kasagiBlack = true } = {}) {
  const m = M(ctx);
  const pm = m[color] || m.shu;
  const r = h * 0.055;
  for (const s of [-1, 1]) {
    k.cyl(r * 0.92, r * 1.05, h, pm, [s * span / 2, h / 2, 0], [0, 0, -s * 0.03], 14);
    k.cyl(r * 1.25, r * 1.3, 0.35, m.black, [s * span / 2, 0.17, 0], null, 14);        // 根巻
  }
  // 貫 (tie beam) and 額束 (plaque strut)
  k.box(span + r * 5, r * 1.1, r * 1.0, pm, [0, h * 0.78, 0]);
  // 島木 + 笠木: one continuous beam whose top and bottom curve upward toward the ends (反り)
  const kw = span + r * 11;
  const beam = (w, th, lift, y0) => {
    const N = 16, pts = [];
    for (let i = 0; i <= N; i++) { const x = -w / 2 + w * i / N, u = (2 * x / w) ** 2; pts.push([x, y0 + lift * u * u + th]); }
    for (let i = N; i >= 0; i--) { const x = -w / 2 + w * i / N, u = (2 * x / w) ** 2; pts.push([x, y0 + lift * u * u * 0.7]); }
    return extrudeXY(pts);
  };
  k.mesh(beam(kw * 0.92, r * 0.9, r * 0.5, h - r * 0.35), pm, [0, 0, 0], null, [1, 1, r * 1.5]);
  const km = kasagiBlack ? m.black : pm;
  k.mesh(beam(kw, r * 1.15, r * 1.1, h + r * 0.55), km, [0, 0, 0], null, [1, 1, r * 2.0]);
  k.box(r * 1.2, h * 0.14, r * 0.8, pm, [0, h * 0.89, 0]);
  return { h, span, r };
}

export function buildIsuzuTorii(ctx, pose, opts = {}) {
  const y = groundY(ctx, pose);
  const g = place(ctx, pose, 'isuzuTorii', y);
  const k = ctx.kit(g), m = M(ctx);
  const T = toriiInto(ctx, k, opts);
  // plaque
  const plq = vTextTex(ctx, '五十鈴神社', { w: 96, h: 320, color: '#f1e3b8', bg: '#3b3740', font: FONT.brush, border: '#d9b44a' });
  const pm = mapMat(ctx, 'toon', '#ffffff', plq, { paint: 0 });
  k.plane(0.42, 1.25, pm, [0, T.h * 0.89, T.r * 0.45], null);
  k.plane(0.42, 1.25, pm, [0, T.h * 0.89, -T.r * 0.45], [0, Math.PI, 0]);
  // shimenawa + shide between the pillars under the tie beam
  const W = makeLiner(ctx, g);
  W.line(sagPts([-T.span / 2, T.h * 0.72, 0], [T.span / 2, T.h * 0.72, 0], 0.35, 14), { width: 0.14, color: C.rope });
  const shide = ctx.mat.toon('#fbfaf4', { side: 'double', paint: 0, emissive: '#6b6a64' });
  for (let i = 1; i <= 3; i++) {
    const x = -T.span / 2 + T.span * i / 4, yy = T.h * 0.72 - 0.35 * 4 * (i / 4) * (1 - i / 4) - 0.1;
    for (let j = 0; j < 3; j++) k.plane(0.16, 0.16, shide, [x + (j % 2 ? 0.05 : -0.05), yy - 0.12 - j * 0.16, 0.02], [0, 0, j % 2 ? 0.25 : -0.25]);
  }
  // stone base line
  k.box(T.span + 1.6, 0.12, 1.4, m.stone, [0, 0.03, 0]);
  if (ctx.physics?.addCylinder) for (const s of [-1, 1]) { const w = toWorld(g, s * T.span / 2, 0, 0); ctx.physics.addCylinder(w.x, w.z, T.r * 1.2, y, y + T.h); }
  return { group: g, perches: [toWorld(g, -T.span / 2 - 1.2, T.h + 0.5, 0), toWorld(g, T.span / 2 + 1.2, T.h + 0.5, 0)], h: T.h };
}

// ------------------------------------------------------------------------------------------------ 五十鈴神社 hall
export function buildIsuzuShrine(ctx, pose, opts = {}) {
  const y = groundY(ctx, pose);
  const g = place(ctx, pose, 'isuzuShrine', y);
  const k = ctx.kit(g), m = M(ctx);
  const W = makeLiner(ctx, g);
  // stone platform
  k.box(11, 0.6, 12, m.stone, [0, 0.3, -2]);
  k.box(11.3, 0.1, 12.3, m.stoneDark, [0, 0.62, -2]);
  // raised floor hall (神明造): hall 5.4 wide x 4.2 deep, floor at 1.6
  const fy = 1.7, hw = 5.4, hd = 4.2, wallH = 2.6;
  for (const x of [-hw / 2, 0, hw / 2]) for (const z of [-hd / 2, hd / 2]) k.cyl(0.14, 0.14, fy + wallH - 0.6, m.wood, [x, 0.6 + (fy + wallH - 0.6) / 2, z - 3], null, 10);
  // 棟持柱 (free-standing ridge posts outside both gable ends, ridge runs along X)
  for (const x of [-hw / 2 - 0.9, hw / 2 + 0.9]) k.cyl(0.15, 0.15, fy + wallH + 2.3 - 0.6, m.wood, [x, 0.6 + (fy + wallH + 2.3 - 0.6) / 2, -3], null, 10);
  k.box(hw + 0.8, 0.14, hd + 1.4, m.woodDark, [0, fy, -3]);                                             // floor + veranda
  k.box(hw, wallH, hd, m.woodPale, [0, fy + wallH / 2, -3]);                                            // board walls
  for (let x = -hw / 2 + 0.45; x < hw / 2; x += 0.9) k.box(0.04, wallH, 0.02, m.wood, [x, fy + wallH / 2, -3 + hd / 2 + 0.01]);
  k.box(1.6, 2.0, 0.06, m.woodDark, [0, fy + 1.0, -3 + hd / 2 + 0.03]);                                 // doors
  // veranda rail
  k.box(hw + 0.8, 0.08, 0.08, m.woodDark, [0, fy + 0.7, -3 + hd / 2 + 0.68]);
  // steps up to the veranda
  for (let i = 0; i < 5; i++) k.box(1.8, 0.22, 0.4, m.wood, [0, 0.6 + 0.11 + i * 0.22, -3 + hd / 2 + 0.7 + (4 - i) * 0.4 + 0.2]);
  // copper gable roof (ridge along X: hall faces +Z so the ridge runs left-right)
  const rg = new THREE.Group(); rg.position.set(0, fy + wallH, -3); rg.rotation.y = Math.PI / 2; g.add(rg);
  const rk = ctx.kit(rg);
  const { ang, half } = gableRoof(rk, m.copper, hd, hw + 0.2, 2.4, 0, 0.35, 1.1);
  rk.box(0.4, 0.4, hw + 2.6, m.copperDark, [0, 2.4 + 0.1, 0]);                                           // ridge
  // 鰹木 (katsuogi) logs across the ridge, 千木 (chigi) crossed boards at both gables
  for (let i = 0; i < 6; i++) k.cyl(0.14, 0.14, 1.0, m.gold, [-hw / 2 - 0.6 + (hw + 1.2) * (i + 0.5) / 6, fy + wallH + 2.65, -3], [Math.PI / 2, 0, 0], 8);
  // 千木: the barge boards continue past the ridge and cross (an X seen from the gable end)
  const yr = fy + wallH + 2.45, A = ang;
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const dy = Math.sin(A), dz = -t * Math.cos(A), len = 2.2, c = 0.75;
    k.box(0.16, len, 0.3, m.copperDark, [s * (hw / 2 + 1.25), yr + dy * c, -3 + dz * c], [Math.atan2(-t * Math.cos(A), Math.sin(A)), 0, 0]);
  }
  // 賽銭箱, 鈴 + 鈴緒, shimenawa over the door
  k.box(1.2, 0.7, 0.6, m.woodDark, [0, 0.6 + 0.35, -3 + hd / 2 + 3.1]);
  k.sphere(0.2, m.gold, [0, fy + 2.1, -3 + hd / 2 + 0.6], 10);
  W.line([[0, fy + 1.9, -3 + hd / 2 + 0.6], [0, 1.4, -3 + hd / 2 + 0.75]], { width: 0.1, color: '#d9463b' });
  W.line(sagPts([-hw / 2 + 0.2, fy + 2.3, -3 + hd / 2 + 0.35], [hw / 2 - 0.2, fy + 2.3, -3 + hd / 2 + 0.35], 0.3, 14), { width: 0.13, color: C.rope });
  // stone lanterns + komainu flanking the approach
  for (const s of [-1, 1]) {
    stoneLantern(ctx, k, m, s * 3.8, 0.6, 2.2);
    komainu(ctx, k, m, s * 2.4, 0.6, 2.8, s);
  }
  // 幟 banners
  const nobori = vTextTex(ctx, '奉納 五十鈴神社', { w: 96, h: 512, color: '#f4efe4', bg: '#c9463c', font: FONT.brush });
  const nm = mapMat(ctx, 'toon', '#ffffff', nobori, { side: 'double', paint: 0 });
  for (const s of [-1, 1]) { k.cyl(0.04, 0.04, 5.2, m.woodDark, [s * 5.1, 0.6 + 2.6, 3.4], null, 6); k.plane(0.6, 3.2, nm, [s * 5.1 - s * 0.33, 0.6 + 3.3, 3.42]); }
  // front stone stair down the hill (+Z)
  const steps = opts.steps ?? 12;
  for (let i = 0; i < steps; i++) k.box(3.2, 0.2, 0.36, m.stone, [0, 0.5 - i * 0.2, 4.2 + i * 0.36]);
  const lamps = [];
  for (const s of [-1, 1]) { const w = toWorld(g, s * 3.8, 0.6 + 1.6, 2.2); lamps.push(w); registry(ctx)?.lantern({ x: w.x, y: w.y, z: w.z }); }
  ctx.physics?.addWalkBox?.(toWorld(g, 0, 0, -2).x, toWorld(g, 0, 0, -2).z, 11, 12, pose.rotY || 0, y + 0.6);
  return { group: g, perches: [toWorld(g, 0, fy + wallH + 2.9, -3), toWorld(g, 3.8, 0.6 + 2.0, 2.2)], lamps };
}

function stoneLantern(ctx, k, m, x, y, z) {
  k.box(0.8, 0.25, 0.8, m.stone, [x, y + 0.12, z]);
  k.cyl(0.14, 0.18, 1.0, m.stone, [x, y + 0.75, z], null, 8);
  k.box(0.6, 0.18, 0.6, m.stone, [x, y + 1.33, z]);
  k.box(0.46, 0.45, 0.46, nightMat(ctx, '#bdb8ac', '#ffb26a', 1.8), [x, y + 1.64, z]);
  k.mesh(new THREE.ConeGeometry(0.62, 0.45, 6), m.stone, [x, y + 2.08, z]);
  k.sphere(0.1, m.stone, [x, y + 2.36, z], 8);
}

function komainu(ctx, k, m, x, y, z, s) {
  k.box(0.9, 0.7, 0.9, m.stone, [x, y + 0.35, z]);
  const st = ctx.mat.toon('#b9b5aa', { paint: 0.1 });
  k.rbox(0.5, 0.7, 0.7, 0.2, st, [x, y + 1.05, z - 0.05]);
  k.rbox(0.5, 0.45, 0.45, 0.18, st, [x, y + 1.5, z + 0.15]);
  k.rbox(0.2, 0.18, 0.18, 0.06, st, [x, y + 1.45, z + 0.42]);
  k.sphere(0.12, st, [x - s * 0.18, y + 1.75, z + 0.1], 8);
}

// ------------------------------------------------------------------------------------------------ 安波山 lookout
export function buildAnbaLookout(ctx, pose, opts = {}) {
  const y = groundY(ctx, pose);
  const g = place(ctx, pose, 'anbaLookout', y);
  const k = ctx.kit(g), m = M(ctx);
  const deckM = ctx.mat.toon('#a98464', { paint: 0.1 }), railM = ctx.mat.toon('#6d5242', { paint: 0.06 }), roofM = ctx.mat.toon('#56677a', { paint: 0.05 });
  // gravel summit pad
  k.box(20, 0.4, 16, ctx.mat.toon('#b7ae9c', { paint: 0.1 }), [0, -0.1, -3]);
  // raised timber deck cantilevered toward the view (+Z = the bay)
  const dy = 1.2;
  k.box(12, 0.2, 7, deckM, [0, dy, 3]);
  for (const x of [-5.5, 0, 5.5]) for (const z of [0.2, 3, 6.2]) k.box(0.3, dy + 1.5, 0.3, railM, [x, dy / 2 - 0.75, z]);
  for (let x = -5.8; x <= 5.81; x += 1.2) k.box(0.1, 1.05, 0.1, railM, [x, dy + 0.55, 6.45]);
  for (const z of [0.2, 3, 6.2]) for (const s of [-1, 1]) k.box(0.1, 1.05, 0.1, railM, [s * 5.95, dy + 0.55, z]);
  k.box(12.1, 0.12, 0.14, railM, [0, dy + 1.1, 6.45]);
  for (const s of [-1, 1]) k.box(0.14, 0.12, 6.4, railM, [s * 5.95, dy + 1.1, 3.25]);
  for (let i = 0; i < 4; i++) k.box(3, 0.2, 0.35, deckM, [0, dy - 0.2 - i * 0.28 + 0.1, -0.45 - i * 0.35]);
  // gazebo (東屋) on the pad
  for (const x of [-1.8, 1.8]) for (const z of [-7.8, -4.2]) k.box(0.22, 2.6, 0.22, railM, [x, 1.4, z]);
  k.mesh(hipRoof(5.4, 5.4, 1.6, 0, 0.3), ctx.mat.toon('#56677a', { paint: 0.05, side: 'double' }), [0, 2.7, -6]);
  k.box(3.2, 0.44, 0.45, deckM, [0, 0.52, -7.6]); k.box(0.45, 0.44, 3.2, deckM, [-1.6, 0.52, -6]);
  // benches on the deck facing the bay
  for (const x of [-3.5, 3.5]) { k.rbox(2.2, 0.08, 0.5, 0.03, deckM, [x, dy + 0.46, 4.2]); for (const s of [-0.9, 0.9]) k.box(0.08, 0.44, 0.44, railM, [x + s, dy + 0.22, 4.2]); }
  // signpost 安波山 山頂 239m (faces +Z, readable from the deck side) and a direction board to the view
  const sign = vTextTex(ctx, '安波山山頂', { w: 128, h: 512, color: '#3b3740', bg: '#efe6d2', font: FONT.brush, border: '#6d5242' });
  k.box(0.3, 2.6, 0.3, railM, [-4.5, 1.3, -1.5]);
  k.plane(0.5, 1.9, mapMat(ctx, 'toon', '#ffffff', sign, { paint: 0 }), [-4.5, 1.5, -1.34]);
  const elev = textTex(ctx, '標高 239m', { w: 256, h: 64, color: '#3b3740', bg: '#efe6d2', font: FONT.sans, weight: 700 });
  k.plane(0.9, 0.22, mapMat(ctx, 'toon', '#ffffff', elev, { paint: 0 }), [-4.5, 0.42, -1.34]);
  const view = textTex(ctx, '気仙沼湾・大島 →', { w: 512, h: 96, color: '#f4efe4', bg: '#4f6b5a', font: FONT.sans, weight: 700 });
  k.box(0.1, 1.1, 0.1, railM, [4.6, dy + 0.55, 6.1]);
  k.plane(1.6, 0.3, mapMat(ctx, 'toon', '#ffffff', view, { paint: 0 }), [4.6, dy + 1.25, 6.16]);
  // a few warm lamps along the deck edge
  for (const x of [-5.9, 5.9]) { k.box(0.2, 0.3, 0.2, nightMat(ctx, '#e8e0cc', '#ffd9a0', 2.0), [x, dy + 1.3, 6.45]); const w = toWorld(g, x, y + dy + 1.3, 6.45); registry(ctx)?.lantern({ x: w.x, y: w.y, z: w.z, color: '#ffd9a0' }); }
  ctx.physics?.addWalkBox?.(toWorld(g, 0, 0, 3).x, toWorld(g, 0, 0, 3).z, 12, 7, pose.rotY || 0, y + dy + 0.1);
  return { group: g, eye: toWorld(g, 0, dy + 1.55, 5.5), perches: [toWorld(g, 0, 2.7 + 1.7, -6), toWorld(g, 5.95, dy + 1.2, 3)] };
}
