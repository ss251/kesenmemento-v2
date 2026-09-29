// [v3:harbor] Quays, seawalls with sea-view windows, the waterfront promenade, rock revetments and beaches.
//
//   buildQuay(ctx, a, b, { kind, top, apron, seed, ... })
//
// a, b: [x, z] world points of the WATER EDGE. The water lies on the LEFT of a->b (same convention as
// mooreAlong), i.e. along the normal (uz, -ux). Local frame of a segment: +X toward the water, +Z from a to b,
// origin at the middle of the edge at y = 0 (sea level). Returns { edge, moor, bollards[], perches[], seats[] } in
// world coordinates for boats, cats and gulls.
//
// kinds
//   quay      working fishing quay: concrete apron, crisp edge lip, joints, bollards, fenders, ladders, gear.
//   seawall   quay + the inner-bay seawall (1.3 m) set back from the edge, with small sea-view windows.
//   promenade timber deck walk on the apron, low rail, lamps, benches (the 内湾 waterfront).
//   rocks     armour-stone revetment sloping into the water.
//   beach     sand slope with a pebble line.
import * as THREE from 'three';
import { segFrame, metricPlane, mapMat } from './util.js';
import { nightMat, addGlint, registry } from './lights.js';
import { hmats, HC, bollard, fender, tyreFender, ladder, cleat, boxYard, netPile, float, ropeCoil, lifebuoyStand, tub } from './props.js';

const DEF = {
  quay: { apron: 10, top: 2.2 },
  seawall: { apron: 7, top: 2.2 },
  promenade: { apron: 8, top: 2.2 },
  rocks: { apron: 6, top: 2.0 },
  beach: { apron: 14, top: 1.6 },
};

export function buildQuay(ctx, a, b, opts = {}) {
  const kind = opts.kind || 'quay';
  const D = DEF[kind] || DEF.quay;
  const top = opts.top ?? D.top, apron = opts.apron ?? D.apron, base = opts.base ?? -3;
  const F = segFrame(a, b);
  const r = ctx.rng(opts.seed ?? `quay|${a[0] | 0}|${a[1] | 0}|${kind}`);
  const g = new THREE.Group(); g.name = `quay:${kind}`;
  g.position.set(F.x, 0, F.z); g.rotation.y = F.rotY;
  ctx.addStatic(g); g.updateMatrixWorld(true);
  const k = ctx.kit(g);
  const M = hmats(ctx);
  const L = F.len, hz = L / 2;
  const out = { edge: { a, b, top }, moor: { a, b }, bollards: [], perches: [], seats: [], kind };
  const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);

  if (kind === 'rocks') { rocks(ctx, k, M, r, L, top, apron, out, toW); return out; }
  if (kind === 'beach') { beach(ctx, k, M, r, L, top, apron); return out; }

  // ---------------------------------------------------------------- body: fill + face + lip
  const deck = kind === 'promenade';
  const topM = deck ? M.concreteLight : M.concrete;
  if (!opts.noLand) k.box(apron, top - base, L, M.concreteDark, [-apron / 2, (top + base) / 2, 0]);
  k.box(apron - 0.35, 0.3, L, topM, [-apron / 2 - 0.17, top - 0.15 + 0.004, 0]);
  const mp = metricPlane(apron - 0.4, L, 6, 'up'), sm = slabMat(ctx, deck);
  k.mesh(mp, sm, [-apron / 2 - 0.2, top + 0.008, 0]);
  // face (sea side) with a wet band and a thin algae line at the tide line
  k.box(0.5, top - base, L, M.concreteDark, [-0.25, (top + base) / 2, 0]);
  k.box(0.04, 0.75, L, M.wet, [0.02, -0.05, 0]);
  k.box(0.045, 0.14, L, M.algae, [0.025, 0.36, 0]);
  // [v3:fix] a crisp foam strip where the water meets the face (the water shader drops its shore foam at hard shores)
  k.box(0.45, 0.02, L, ctx.mat.toon('#eef4f1', { paint: 0 }), [0.24, 0.035, 0]);
  // edge lip (lighter, slightly proud)
  k.box(0.42, 0.14, L, M.concreteLight, [-0.21, top + 0.07, 0]);
  // expansion joints every 10 m (top + face) — gives scale rhythm
  const jm = ctx.mat.toon('#85837c', { paint: 0 });
  const mid = opts.lod === 'mid';
  if (!mid) for (let z = -hz + 10; z < hz - 1; z += 10) {
    k.box(apron - 0.4, 0.02, 0.06, jm, [-apron / 2 - 0.2, top + 0.006, z]);
    k.box(0.02, top - 0.2, 0.06, jm, [0.012, top / 2 - 0.1, z]);
  }
  // rust streaks down the face under some bollards
  const streak = ctx.mat.decal('#8d6a58', { transparent: true, opacity: 0.35 });

  // ---------------------------------------------------------------- mooring hardware
  const bSp = opts.bollardSpacing ?? (kind === 'quay' ? 15 : 12);
  // [v3:fix] no bollards on the promenade deck (the rail ran through their caps and cats sat mid-deck); boats there
  // tie to the quay lip (mooringLines), cats use the working quays' bollards
  for (let z = -hz + bSp / 2; z < (kind === 'promenade' ? -hz : hz); z += bSp) {
    const big = kind === 'quay';
    bollard(k, M, -0.75, top, z, { big, capColor: kind !== 'promenade' });
    out.bollards.push(toW(-0.75, top + 0.62 * (big ? 1.35 : 1), z));
    if (!mid && r.chance(0.4)) k.plane(0.2, top - 0.5, streak, [0.03, top / 2, z + 0.25], [0, Math.PI / 2, 0]);
  }
  const fSp = opts.fenderSpacing ?? ((kind === 'quay' ? 8 : 9) * (mid ? 2 : 1));
  for (let z = -hz + 4; z < hz - 1; z += fSp) {
    if (kind === 'quay') fender(k, M, 0, top, z, { h: Math.min(1.8, top - 0.2) });
    else tyreFender(k, M, 0, top, z);
  }
  const lSp = opts.ladderSpacing ?? 36;
  if (!mid) for (let z = -hz + lSp * 0.6; z < hz - 2; z += lSp) ladder(k, M, 0, top, -1.2, z + 2.2);

  // ---------------------------------------------------------------- kind-specific
  if (kind === 'quay') quayGear(ctx, k, M, r, L, top, apron, out, toW, opts);
  if (kind === 'seawall') seawall(ctx, k, M, r, L, top, apron, out, toW, opts);
  if (kind === 'promenade') promenade(ctx, k, M, r, L, top, apron, out, toW, opts);
  
  // physics: walkable apron + edge
  // (chunks of <= 16 m: the physics grid inserts by bounding circle, so one long box would touch thousands of cells)
  if (ctx.physics?.addWalkBox) chunks(L, 16, (zc, len) => { const c = toW(-apron / 2, 0, zc); ctx.physics.addWalkBox(c.x, c.z, apron, len, F.rotY, top); });
  return out;
}

// ------------------------------------------------------------------------------------------------ quay gear
function quayGear(ctx, k, M, r, L, top, apron, out, toW, opts) {
  if (opts.props === false || apron < 7) return;
  const hz = L / 2;
  // painted edge line (white) + yellow hatched loading zones
  const white = ctx.mat.decal('#e9e6dc');
  k.box(0.14, 0.01, L - 1, white, [-1.4, top + 0.01, 0]);
  const yellow = ctx.mat.decal('#e3bf4a');
  for (let z = -hz + 18; z < hz - 8; z += 42) {
    for (let i = 0; i < 6; i++) k.box(0.3, 0.01, 2.6, yellow, [-3 - i * 0.9, top + 0.012, z], [0, 0.6, 0]);
  }
  // gear clusters: fish-box yards, net piles, tubs, rope coils, floats
  for (let z = -hz + 12; z < hz - 6; z += r.range(14, 24)) {
    const pick = r();
    const x = -r.range(3.5, apron - 2.5);
    if (pick < 0.4) boxYard(k, M, x, top, z, { cols: r.int(2, 4), rows: r.int(2, 3), rng: r, rotY: r.range(-0.1, 0.1) });
    else if (pick < 0.6) netPile(k, M, x, top, z, { rng: r, blue: r.chance(0.4), w: r.range(2.2, 3.4) });
    else if (pick < 0.75) { tub(k, M, x, top, z, r.range(-0.2, 0.2)); tub(k, M, x - 1.5, top, z + 0.2, r.range(-0.2, 0.2)); }
    else if (pick < 0.88) { ropeCoil(k, M, x, top, z); for (let i = 0; i < 5; i++) float(k, M, x + r.range(-1, 1), top, z + r.range(0.8, 2), 0.22, r.chance(0.3)); }
    else lifebuoyStand(ctx, k, M, -2.2, top, z, Math.PI / 2);
    out.perches.push(toW(x, top + 1.3, z));
  }
}

// ------------------------------------------------------------------------------------------------ seawall
function seawall(ctx, k, M, r, L, top, apron, out, toW, opts) {
  const hz = L / 2;
  const setback = opts.setback ?? 2.6, h = opts.wallH ?? 1.4, t = 0.55;
  const x = -setback;
  const wallM = ctx.mat.toon('#c9c5ba', { paint: 0.1 });
  const capM = ctx.mat.toon('#d8d4c9', { paint: 0.06 });
  const frameM = ctx.mat.toon('#5d6470', { paint: 0 });
  const glass = ctx.mat.glass ? ctx.mat.glass({ tint: '#9fc3d6', opacity: 0.35, streaks: 1 }) : ctx.mat.toon('#9fc3d6');
  const winW = opts.winW ?? 1.25, winH = opts.winH ?? 0.52, winY = opts.winY ?? 1.0, sp = opts.winSpacing ?? 6;
  // windows at fixed spacing; build wall pieces between them so the windows are real openings
  const wins = []; if (opts.windows !== false) for (let z = -hz + sp / 2; z < hz - winW; z += sp) wins.push(z);
  let z0 = -hz;
  const piece = (za, zb) => { if (zb - za > 0.01) k.box(t, h, zb - za, wallM, [x, top + h / 2, (za + zb) / 2]); };
  for (const zc of wins) {
    piece(z0, zc - winW / 2);
    // below and above the opening
    k.box(t, winY - winH / 2, winW, wallM, [x, top + (winY - winH / 2) / 2, zc]);
    const above = h - (winY + winH / 2); if (above > 0.02) k.box(t, above, winW, wallM, [x, top + winY + winH / 2 + above / 2, zc]);
    // frame + glass
    for (const s of [-1, 1]) k.box(t + 0.06, winH + 0.1, 0.05, frameM, [x, top + winY, zc + s * (winW / 2)]);
    for (const s of [-1, 1]) k.box(t + 0.06, 0.05, winW + 0.05, frameM, [x, top + winY + s * (winH / 2), zc]);
    const gp = k.plane(winW, winH, glass, [x, top + winY, zc], [0, Math.PI / 2, 0]); ctx.noOutline(gp);
    z0 = zc + winW / 2;
  }
  piece(z0, hz);
  // formwork panel joints (every 3 m) and a darker splash base on the street side
  const jm = ctx.mat.toon('#a9a59b', { paint: 0 });
  for (let z = -hz + 1.5; z < hz; z += 3) if (!wins.some((w) => Math.abs(w - z) < winW / 2 + 0.1)) k.box(t + 0.02, h - 0.1, 0.03, jm, [x, top + h / 2, z]);
  k.box(t + 0.03, 0.18, L, ctx.mat.toon('#aaa69c', { paint: 0.08 }), [x, top + 0.09, 0]);
  // cap with a rounded nose, and a painted wave band on the street side
  k.rbox(t + 0.16, 0.14, L, 0.05, capM, [x, top + h + 0.07, 0]);
  const band = ctx.tex.draw(512, 64, (g2, w, hh) => {
    g2.fillStyle = '#c9c5ba'; g2.fillRect(0, 0, w, hh);
    g2.strokeStyle = '#8fb3c4'; g2.lineWidth = 7; g2.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g2.beginPath(); for (let x2 = -20; x2 <= w + 20; x2 += 4) { const y = hh * 0.5 + Math.sin((x2 / w) * Math.PI * 8 + i * 1.3) * 9; x2 < -16 ? g2.moveTo(x2, y) : g2.lineTo(x2, y); } g2.globalAlpha = 0.35 + i * 0.12; g2.stroke(); }
    g2.globalAlpha = 1;
  }, { key: 'harbor-wave-band', repeat: [1, 1] });
  // street-side decorative band under the windows (UVs in 6 m tiles)
  const bm = mapMat(ctx, 'decal', '#ffffff', band);
  const bg = metricPlane(L - 0.2, 0.22, 6, 'side'); { const uv = bg.attributes.uv, ps = bg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, ps.getY(i) > 0 ? 1 : 0); }
  k.mesh(bg, bm, [x - t / 2 - 0.012, top + 0.35, 0], [0, Math.PI, 0]);
  // street-side pavement: warm interlocking tiles along the wall
  k.mesh(metricPlane(3.2, L, 2, 'up'), tileMat(ctx), [x - t / 2 - 1.6, top + 0.014, 0]);
  // perches/seats: cats sit on the wall cap
  for (let z = -hz + 3; z < hz; z += 9) { out.perches.push(toW(x, top + h + 0.14, z)); out.seats.push(toW(x, top + h + 0.14, z)); }
  if (ctx.physics?.addBox) chunks(L, 16, (zc, len) => { const c = toW(x, 0, zc); ctx.physics.addBox(c.x, c.z, t, len, Math.atan2(toW(x, 0, hz).x - toW(x, 0, -hz).x, toW(x, 0, hz).z - toW(x, 0, -hz).z), top, top + h); });
  out.wall = { a: [toW(x, 0, -hz).x, toW(x, 0, -hz).z], b: [toW(x, 0, hz).x, toW(x, 0, hz).z], top: top + h, windows: wins.length };
}

// ------------------------------------------------------------------------------------------------ promenade
function promenade(ctx, k, M, r, L, top, apron, out, toW, opts) {
  const hz = L / 2;
  const deckW = Math.min(apron - 1.5, opts.deckW ?? 5.2);
  // timber deck boards: a textured slab (board lines painted), lifted 5 mm
  const boards = ctx.tex.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#b08a66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const y = i * (h / 8);
      g.fillStyle = ['#b48f69', '#a9835f', '#b99570', '#a57f5c'][i % 4]; g.fillRect(0, y + 1, w, h / 8 - 2);
      g.fillStyle = '#7d5f47'; g.fillRect(0, y, w, 2);
      g.fillStyle = '#8a6a50'; g.fillRect(((i * 97) % w), y, 2, h / 8);
      g.globalAlpha = 0.18; g.fillStyle = '#6d5040';
      for (let j = 0; j < 5; j++) g.fillRect(((i * 53 + j * 71) % w), y + 6 + (j % 3) * 7, 26 + j * 9, 1.5);
      g.globalAlpha = 1;
    }
  }, { key: 'harbor-deck-boards', repeat: [1, 1] });
  const deckM = mapMat(ctx, 'toon', '#ffffff', boards, { paint: 0.05 });
  k.box(deckW, 0.12, L, ctx.mat.toon('#8e6d52', { paint: 0.04 }), [-0.45 - deckW / 2, top + 0.06, 0]);
  k.mesh(metricPlane(deckW, L, 1.6, 'up'), deckM, [-0.45 - deckW / 2, top + 0.125, 0]);
  // edge rail: low steel posts + two bars (Japanese waterfront railing, navy)
  const railM = ctx.mat.toon('#46566e', { paint: 0 });
  const rh = 1.05, xr = -0.32;
  for (let z = -hz + 0.1; z <= hz; z += 2.4) k.box(0.07, rh, 0.07, railM, [xr, top + 0.12 + rh / 2, z]);
  k.rbox(0.1, 0.08, L, 0.03, ctx.mat.toon('#9a7556', { paint: 0.04 }), [xr, top + 0.12 + rh, 0]);
  k.box(0.04, 0.04, L, railM, [xr, top + 0.12 + rh * 0.5, 0]);
  // lamps (tall, warm) every 18 m; benches between
  const lampM = ctx.mat.toon('#4a5566', { paint: 0 });
  const lampHead = nightMat(ctx, '#efe6d2', '#ffdcaa', 2.4);
  for (let z = -hz + 6; z < hz; z += 18) {
    const x = -0.45 - deckW + 0.45;
    k.cyl(0.07, 0.09, 4.2, lampM, [x, top + 0.12 + 2.1, z], null, 8);
    k.box(0.5, 0.08, 0.08, lampM, [x + 0.22, top + 4.28, z]);
    k.rbox(0.36, 0.22, 0.36, 0.06, lampM, [x + 0.45, top + 4.2, z]);
    k.box(0.28, 0.05, 0.28, lampHead, [x + 0.45, top + 4.07, z]);
    const w = toW(x + 0.45, top + 4.0, z);
    (out.lamps ||= []).push(w);
    registry(ctx)?.streetlight({ x: w.x, y: w.y, z: w.z, groundY: top });
    const wg = toW(1.5, 0, z); addGlint(ctx, wg.x, 0, wg.z, '#ffd49a', 0.6, 9, 0.8);
  }
  const benchM = ctx.mat.toon('#a07a58', { paint: 0.05 }), legM = ctx.mat.toon('#5e6470');
  for (let z = -hz + 15; z < hz - 3; z += 18) {
    const x = -0.45 - deckW + 1.0;
    k.rbox(0.45, 0.07, 1.8, 0.03, benchM, [x, top + 0.12 + 0.44, z]);
    k.rbox(0.07, 0.4, 1.8, 0.03, benchM, [x - 0.2, top + 0.12 + 0.72, z], [0, 0, 0.12]);
    for (const s of [-0.7, 0.7]) k.box(0.4, 0.44, 0.06, legM, [x, top + 0.12 + 0.22, z + s]);
    out.seats.push(toW(x, top + 0.12 + 0.47, z));
  }
  // planters with grasses + cosmos accents
  const planterM = ctx.mat.toon('#b9b1a2', { paint: 0.08 }), soil = ctx.mat.toon('#7d8f5a', { paint: 0.08 });
  const cosmos = [ctx.mat.toon('#f0a3c4'), ctx.mat.toon('#f4f0f2'), ctx.mat.toon('#d9608f')];
  for (let z = -hz + 9; z < hz - 3; z += 18) {
    const x = -0.45 - deckW - 0.9;
    k.box(1.3, 0.5, 2.6, planterM, [x, top + 0.25, z]);
    k.rbox(1.1, 0.4, 2.4, 0.18, soil, [x, top + 0.58, z]);
    // [v3:fix] cosmos as flowers on stems (flat 5 cm heads), not floating spheres; susuki tufts at the ends
    const stemM = ctx.mat.toon('#6f8a4c', { paint: 0 });
    const leafM = ctx.mat.toon('#5f7d45', { paint: 0.04 });
    for (let i = 0; i < 7; i++) k.cyl(0.02, 0.17, 0.3, leafM, [x + r.range(-0.4, 0.4), top + 0.9, z + r.range(-1.0, 1.0)], null, 5);   // leafy tufts
    // [v3:fix] low clumped blooms on leafy cushions (the flat heads on thin stems read as parasols on sticks)
    void stemM;
    for (let i = 0; i < 6; i++) {
      const cx = x + r.range(-0.3, 0.3), cz = z - 0.95 + i * 0.38 + r.range(-0.08, 0.08);
      const cush = k.sphere(r.range(0.2, 0.26), leafM, [cx, top + 0.8, cz], 8); cush.scale.y *= 0.55;
      const col = r.pick(cosmos);
      for (let j = 0; j < 9; j++) { const a = r() * Math.PI * 2, rr = r.range(0.02, 0.2); k.sphere(r.range(0.035, 0.055), r() < 0.8 ? col : r.pick(cosmos), [cx + Math.cos(a) * rr, top + 0.86 + (0.2 - rr) * 0.45 + r.range(0, 0.04), cz + Math.sin(a) * rr], 6); }
    }
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) k.cyl(0.004, 0.01, 0.75, ctx.mat.toon('#cbb98a', { paint: 0 }), [x + r.range(-0.3, 0.3), top + 0.78 + 0.35, z + s * 1.0 + r.range(-0.12, 0.12)], [r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)], 3);
  }
  out.perches.push(...out.seats.map((p) => p.clone().setY(p.y + 0.55)));
}

// ------------------------------------------------------------------------------------------------ rocks / beach
function rocks(ctx, k, M, r, L, top, apron, out, toW) {
  const hz = L / 2;
  const stone = [ctx.mat.toon('#9d9a90', { paint: 0.1 }), ctx.mat.toon('#8c8a84', { paint: 0.1 }), ctx.mat.toon('#aba79c', { paint: 0.1 })];
  const geo = new THREE.DodecahedronGeometry(1, 0);
  // slope from the top at x = -apron*0.3 down to y = -1.5 at x = +3
  const n = Math.round(L * 1.6);
  for (let i = 0; i < n; i++) {
    const t = r(), z = -hz + r() * L, x = -apron * 0.3 + t * (apron * 0.3 + 3), y = top - t * (top + 1.5);
    const s = r.range(0.55, 1.1);
    k.mesh(geo, r.pick(stone), [x, y, z], [r() * 3, r() * 3, r() * 3], [s * 1.2, s * 0.8, s]);
  }
  k.box(apron * 0.7, top + 3, L, M.concreteDark, [-apron * 0.3 - apron * 0.35, (top - 3) / 2, 0]);
  k.box(apron * 0.7, 0.2, L, ctx.mat.toon('#b7b3a5', { paint: 0.1 }), [-apron * 0.3 - apron * 0.35, top, 0]);
  for (let z = -hz + 4; z < hz; z += 11) out.perches.push(toW(r.range(0, 1.5), top * 0.5, z));
}

function beach(ctx, k, M, r, L, top, apron) {
  const sand = ctx.mat.toon('#e3d3ad', { paint: 0.08 }), wet = ctx.mat.toon('#b8a98a', { paint: 0.06 });
  const geo = new THREE.PlaneGeometry(apron + 6, L, 4, 1).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); const t = (x + (apron + 6) / 2) / (apron + 6); p.setY(i, top - t * (top + 1.2)); }
  geo.computeVertexNormals();
  k.mesh(geo, sand, [-(apron + 6) / 2 + 6, 0, 0]);
  k.box(1.2, 0.02, L, wet, [0.2, 0.06, 0], [0, 0, -0.12]);
  const peb = ctx.mat.toon('#a29d92', { paint: 0.05 });
  for (let i = 0; i < L * 0.8; i++) k.sphere(r.range(0.08, 0.2), peb, [r.range(-2, 1), 0.3, -L / 2 + r() * L], 6);
}

// ------------------------------------------------------------------------------------------------ surfaces
function slabMat(ctx, light) {
  const tex = ctx.tex.draw(512, 512, (g, w, h) => {
    const rr = ctx.rng('slab');
    g.fillStyle = light ? '#cdcac0' : '#c2bfb5'; g.fillRect(0, 0, w, h);
    // soft wash blotches
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.06; g.fillStyle = rr.pick(['#a9a69c', '#d6d3c9', '#b7b0a2', '#9ea39a']); g.beginPath(); g.ellipse(rr() * w, rr() * h, 20 + rr() * 90, 14 + rr() * 60, rr() * 3, 0, 7); g.fill(); }
    // panel seams (every 3 m of the 6 m tile)
    g.globalAlpha = 0.55; g.fillStyle = '#8f8c84'; g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 2); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h);
    // hairline cracks
    g.globalAlpha = 0.35; g.strokeStyle = '#8a877f'; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { let x = rr() * w, y = rr() * h; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += rr.range(-20, 20); y += rr.range(4, 22); g.lineTo(x, y); } g.stroke(); }
    // oil / water stains
    for (let i = 0; i < 4; i++) { g.globalAlpha = 0.12; g.fillStyle = '#6f7479'; g.beginPath(); g.ellipse(rr() * w, rr() * h, 10 + rr() * 26, 6 + rr() * 14, rr() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }, { key: 'harbor-slab-' + (light ? 'l' : 'd'), repeat: [1, 1] });
  return mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0.04, polygonOffset: -1 });
}

function tileMat(ctx) {
  const tex = ctx.tex.draw(256, 256, (g, w, h) => {
    const rr = ctx.rng('tiles');
    const cols = ['#d6c3a5', '#cdb89a', '#dccbb0', '#c4ad90'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = rr.pick(cols); g.fillRect(x * 64 + (y % 2) * 32, y * 32, 64, 32); g.fillRect(x * 64 + (y % 2) * 32 - 256, y * 32, 64, 32); }
    g.strokeStyle = '#a89479'; g.lineWidth = 2;
    for (let y = 0; y <= 8; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(w, y * 32); g.stroke(); for (let x = 0; x <= 4; x++) { g.beginPath(); g.moveTo(x * 64 + (y % 2) * 32, y * 32); g.lineTo(x * 64 + (y % 2) * 32, y * 32 + 32); g.stroke(); } }
  }, { key: 'harbor-tiles', repeat: [1, 1] });
  return mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0.03, polygonOffset: -1 });
}

/** Split [-L/2, L/2] into pieces of at most `max` metres: fn(centreZ, length). */
function chunks(L, max, fn) { const n = Math.max(1, Math.ceil(L / max)); for (let i = 0; i < n; i++) fn(-L / 2 + (i + 0.5) * L / n, L / n); }
