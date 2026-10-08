// [v3:town] Shop ground floors (店先) for hero shop lots. The house kit builds the building with its ground floor set
// back by S.shop.depth (kit/house.js [v3:town] hook); this fills the recess with a real little shop you can glimpse:
// tiled / wooden floor, a painted back wall of shelves, a counter, warm ceiling lights, and a front in one of the
// styles from names.js (modern glass front + fascia board + awning, wa lattice + noren + lanterns, open display
// front with fish trays / crates, cafe, or a closed shutter). Plus a projecting vertical sign and street-side extras.
// All geometry goes through the house kit's GeoBatch (one draw call per material for the whole town).
import { SHOPS } from './names.js';
import { pick } from './common.js';

export function shopMaterials(ctx, signs) {
  const m = ctx.mat;
  const atlas = (tex, o = {}) => m.toon('#ffffff', { map: tex, paint: 0.015, ...o });
  return {
    atlas,
    board: (i) => atlas(signs.boardOf(i).tex, { nightGlow: 0.4 }),   // [v3:polish] fascia boards read at night
    tall: (i) => atlas(signs.tallOf(i).tex, { nightGlow: 0.45 }),
    noren: atlas(signs.norenTex, { side: 'double', paint: 0.02 }),
    inter: m.toon('#ffffff', { map: signs.inter, paint: 0.0 }),
    tops: atlas(signs.tops),
    lattice: m.toon('#ffffff', { map: signs.tops, alphaTest: 0.5, side: 'double', paint: 0.02 }),
    glass: m.glass({ tint: '#a9bfd0', opacity: 0.16 }),
    light: m.emissive('#ffd9a0', 1.25),
    bulb: m.emissive('#fff0cf', 1.5),
    vc: m.toon('#ffffff', { vertexColors: true, paint: 0.04 }),
    awning: (tex) => m.toon('#ffffff', { map: tex, side: 'double', paint: 0.03 }),
  };
}

/** Awning atlas: one 256×64 cell per shop (stripes or solid + scalloped valance), 4 × 16 cells. */
export function makeAwnings(ctx) {
  const T = ctx.tex;
  const tex = T.draw(512, 512, (g) => {
    SHOPS.forEach((s, k) => {
      const x = (k % 4) * 128, y = Math.floor(k / 4) * 32;
      const [a, b] = s.awning || s.board;
      const striped = s.style === 'cafe' || s.style === 'open' || k % 3 === 0;
      g.fillStyle = a; g.fillRect(x, y, 128, 32);
      if (striped) { g.fillStyle = b; for (let i = 0; i < 8; i++) g.fillRect(x + i * 16 + 8, y, 8, 32); }
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, 128, 3);
      g.fillStyle = 'rgba(40,30,40,0.12)'; g.fillRect(x, y + 29, 128, 3);
    });
  }, { key: 'town-awnings', anisotropy: 4 });
  const rect = (k) => { const x = (k % 4) * 128, y = Math.floor(k / 4) * 32; return [x / 512, 1 - (y + 32) / 512, (x + 128) / 512, 1 - y / 512]; };
  return { tex, rect };
}

/**
 * Build the shop front + room. HF: building frame (origin at footprint centre on y = frame base, +Z = street).
 * S: house spec (w, d, floorY, fh, shop.depth, wall). shopIdx: index into SHOPS. Returns info for services.
 */
export function buildShop(H, HF, S, shopIdx, SM, signs, awn, r, out) {
  const s = SHOPS[shopIdx % SHOPS.length];
  const { M } = H;
  const w = S.w, d = S.d, fy = S.floorY, FH = S.fh, sd = S.shop.depth;
  const zF = d / 2, zB = d / 2 - sd;
  const style = S.shop.style || s.style;
  const top = fy + FH;
  const inner = w - 0.24;
  const card = (mat, rect, x, y, z, cw, ch, o) => H.card(HF, mat, rect, x, y, z, cw, ch, o);
  const wallCol = S.wall.color;

  // ---------------------------------------------------------------- room
  // side walls (flush with the building sides), floor, ceiling, back wall
  for (const sx of [-1, 1]) HF.boxB(M.plaster, wallCol, 0.12, FH + 0.02, sd, sx * (w / 2 - 0.06), fy - 0.02, (zF + zB) / 2, { uv: { world: 3 } });
  const floorRect = signs.topOf(style === 'wa' || s.interior === 'sushi' ? 'woodFloor' : 'tileFloor').rect;
  H.quads(HF, SM.tops, '#ffffff', [{ p: [[-inner / 2, fy + 0.012, zF], [inner / 2, fy + 0.012, zF], [inner / 2, fy + 0.012, zB], [-inner / 2, fy + 0.012, zB]], n: [0, 1, 0], uv: [[floorRect[0], floorRect[1]], [floorRect[2], floorRect[1]], [floorRect[2], floorRect[3]], [floorRect[0], floorRect[3]]] }], { shadow: false });
  const ceilRect = signs.topOf('ceiling').rect;
  H.quads(HF, SM.tops, '#f4efe4', [{ p: [[-inner / 2, top - 0.03, zB], [inner / 2, top - 0.03, zB], [inner / 2, top - 0.03, zF], [-inner / 2, top - 0.03, zF]], n: [0, -1, 0], uv: [[ceilRect[0], ceilRect[1]], [ceilRect[2], ceilRect[1]], [ceilRect[2], ceilRect[3]], [ceilRect[0], ceilRect[3]]] }], { shadow: false });
  const ir = signs.interiorOf(s.interior).rect;
  card(SM.inter, ir, 0, fy + FH / 2 - 0.02, zB + 0.03, inner, FH - 0.06);
  // ceiling light strips (warm; life switches them per room at night)
  for (const lx of inner > 3.4 ? [-inner / 4, inner / 4] : [0]) HF.box(SM.light, null, Math.min(1.6, inner * 0.35), 0.04, 0.22, lx, top - 0.06, zB + sd * 0.5, {});
  // counter / display case inside
  const cw = Math.min(inner - 1.2, 2.6);
  if (s.interior !== 'barber') HF.boxB(M.plain, s.interior === 'sushi' || style === 'wa' ? '#b48a62' : '#d8d2c4', cw, 0.95, 0.55, (r() - 0.5) * (inner - cw) * 0.6, fy, zB + Math.min(1.1, sd * 0.4));
  if (s.interior === 'sushi' || s.interior === 'diner') for (let i = 0; i < Math.floor(cw / 0.6); i++) HF.cyl(M.plain, '#6b4a36', 0.17, 0.6, -cw / 2 + 0.3 + i * 0.6, fy + 0.3, zB + Math.min(1.1, sd * 0.4) + 0.62, { seg: 10 });

  // ---------------------------------------------------------------- front
  const fasciaY0 = fy + 2.28, fasciaH = Math.max(0.55, top + 0.3 - fasciaY0);
  const board = signs.boardOf(shopIdx % SHOPS.length);
  // [v4:town-accuracy] a shop OpenStreetMap names carries its real name (S.real from realnames.js) on every board
  const real = S.real || null;
  const boardCard = (x, y, z, cw, ch, o) => (real ? card(real.mat, real.rect, x, y, z, Math.min(cw, ch * real.aspect), Math.min(ch, cw / real.aspect), o) : card(SM.board(shopIdx), board.rect, x, y, z, cw, ch, o));
  const frameCol = style === 'wa' ? '#4a3528' : '#aeb4ba';
  if (style === 'modern' || style === 'cafe' || style === 'shutter') {
    // aluminium frame + glass, automatic door in the middle bay
    const bays = Math.max(2, Math.round(inner / 1.7));
    const zg = zF - 0.18;
    for (let i = 0; i <= bays; i++) HF.boxB(M.plain, frameCol, 0.07, fasciaY0 - fy, 0.1, -inner / 2 + inner * i / bays, fy, zg);
    HF.box(M.plain, frameCol, inner, 0.08, 0.1, 0, fasciaY0 - 0.02, zg);
    HF.box(M.plain, frameCol, inner, 0.05, 0.1, 0, fy + 0.025, zg);
    if (style === 'shutter') {
      const sr = signs.topOf('shutterArt').rect;
      card(SM.tops, sr, 0, (fy + fasciaY0) / 2, zF - 0.05, inner, fasciaY0 - fy);
      HF.box(M.plain, '#9aa1a8', inner + 0.1, 0.32, 0.36, 0, fasciaY0 + 0.1, zF - 0.02);
    } else {
      HF.box(SM.glass, null, inner - 0.02, fasciaY0 - fy - 0.1, 0.02, 0, (fy + fasciaY0) / 2, zg, { shadow: false, noOutline: true });
      // a low sill wall under the side bays (tiles) for cafes
      if (style === 'cafe') for (const sx of [-1, 1]) HF.boxB(M.tile, '#b9543e', inner / 2 - 0.9, 0.5, 0.2, sx * (inner / 4 + 0.45), fy, zg + 0.05, { uv: { world: 0.96 } });
      // door mat + door handle bars
      HF.boxB(M.plain, '#4a4f58', 1.1, 0.02, 0.6, 0, fy, zF - 0.1);
      for (const sx of [-0.08, 0.08]) HF.box(M.plain, '#d4d7db', 0.02, 0.5, 0.03, sx, fy + 1.1, zg + 0.04);
      // hours plate / posters on the glass
      card(SM.tops, signs.topOf('posters').rect, -inner / 2 + 0.55, fy + 1.45, zg + 0.03, 0.5, 0.5);
    }
    // fascia board
    HF.box(M.plain, real?.charcoal ? '#2f3133' : s.board[0], w + 0.02, fasciaH, 0.14, 0, fasciaY0 + fasciaH / 2, zF + 0.05);
    boardCard(0, fasciaY0 + fasciaH / 2, zF + 0.125, Math.min(w - 0.2, fasciaH * 4.2), Math.min(fasciaH - 0.08, (w - 0.2) / 4));
    if (s.awning && style !== 'shutter') awning(H, HF, SM, awn, shopIdx, inner, fasciaY0 - 0.02, zF + 0.1, style === 'cafe' ? 1.4 : 1.1);
  } else if (style === 'wa') {
    const zg = zF - 0.35;
    // dark timber posts and sill, sliding glass doors behind a lattice
    for (const sx of [-1, 1]) HF.boxB(M.wood, '#4a3528', 0.16, top - fy, 0.16, sx * (inner / 2 - 0.02), fy, zF - 0.12, { uv: { world: 1.2 } });
    HF.box(M.wood, '#4a3528', inner, 0.16, 0.16, 0, fasciaY0 - 0.08, zF - 0.12, { uv: { world: 1.2 } });
    HF.box(SM.glass, null, inner - 0.2, fasciaY0 - fy - 0.2, 0.02, 0, (fy + fasciaY0) / 2, zg, { shadow: false, noOutline: true });
    for (let i = 0; i <= 4; i++) HF.boxB(M.wood, '#5a3f2e', 0.05, fasciaY0 - fy - 0.1, 0.05, -inner / 2 + 0.1 + (inner - 0.2) * i / 4, fy, zg + 0.02);
    // lattice panels either side of the doorway (格子)
    const lat = signs.topOf('lattice').rect;
    const lw = Math.max(0.6, inner / 2 - 0.95);
    for (const sx of [-1, 1]) card(SM.lattice, lat, sx * (inner / 2 - lw / 2 - 0.1), fy + 0.95, zF - 0.2, lw, 1.8, { noOutline: true });
    // noren in the doorway, hanging from a rod
    const nr = signs.norenOf(shopIdx % SHOPS.length);
    if (nr) {
      HF.box(M.plain, '#6b5242', 1.9, 0.04, 0.04, 0, fasciaY0 - 0.12, zF + 0.02);
      const panel = 1.8 / 3;
      for (let p = 0; p < 3; p++) {
        const u0 = nr.rect[0] + (nr.rect[2] - nr.rect[0]) * p / 3, u1 = nr.rect[0] + (nr.rect[2] - nr.rect[0]) * (p + 1) / 3;
        const x = -0.9 + panel * (p + 0.5), sway = (r() - 0.5) * 0.06;
        H.quads(HF, SM.noren, '#ffffff', [{ p: [[x - panel / 2 + 0.01, fasciaY0 - 0.95, zF + 0.03 + sway], [x + panel / 2 - 0.01, fasciaY0 - 0.95, zF + 0.03 + sway], [x + panel / 2 - 0.01, fasciaY0 - 0.12, zF + 0.02], [x - panel / 2 + 0.01, fasciaY0 - 0.12, zF + 0.02]], n: [0, 0, 1], uv: [[u0, nr.rect[1]], [u1, nr.rect[1]], [u1, nr.rect[3]], [u0, nr.rect[3]]] }], { shadow: true, noOutline: true });
      }
    }
    // pent roof (庇) with the sign board on it, or a big board on the fascia
    HF.box(M.plain, '#4a3528', w + 0.02, fasciaH, 0.12, 0, fasciaY0 + fasciaH / 2, zF + 0.04);
    const kawara = S.roof.mat === 'kawara' ? M.kawara : M.metal;
    const pd = 0.95, y0 = fasciaY0 + 0.35;
    const sl = H.slab([[-w / 2 - 0.1, y0 - pd * 0.35, zF + pd], [w / 2 + 0.1, y0 - pd * 0.35, zF + pd], [w / 2 + 0.1, y0, zF + 0.1], [-w / 2 - 0.1, y0, zF + 0.1]], 0.08, (q) => [q[0] / 1.08, q[2] / 1.02]);
    H.gb.mesh(kawara, S.roof.color, sl.p, sl.n, sl.u, sl.i, HF.M(0, 0, 0));
    boardCard(0, y0 + 0.5, zF + 0.16, Math.min(w - 0.4, 3.4), Math.min(0.85, (w - 0.4) / 4), { ry: 0 });
    HF.box(M.wood, '#3f2e24', Math.min(w - 0.3, 3.5), Math.min(0.9, (w - 0.3) / 4 + 0.05), 0.06, 0, y0 + 0.5, zF + 0.12, { uv: { world: 1.2 } });
    if (s.lanterns) for (const sx of [-1, 1]) lantern(H, HF, sx * (inner / 2 - 0.35), fasciaY0 - 0.3, zF + 0.28, out);
    if (s.sugidama) { HF.cyl(M.plain, '#4b4d52', 0.01, 0.5, inner / 2 - 0.4, y0 - 0.1, zF + 0.5, { seg: 4 }); H.gb.raw(M.foliage || M.plain, '#556b3a', ...rawSphere(0.38), HF.M(inner / 2 - 0.4, y0 - 0.6, zF + 0.5)); }
  } else {
    // 'open': rolled-up shutter box, no glass, display tables stepping out onto the pavement
    HF.box(M.plain, '#9aa1a8', inner + 0.1, 0.34, 0.4, 0, fasciaY0 + 0.1, zF - 0.02);
    HF.box(M.plain, real?.charcoal ? '#2f3133' : s.board[0], w + 0.02, fasciaH, 0.14, 0, fasciaY0 + fasciaH / 2 + 0.1, zF + 0.05);
    boardCard(0, fasciaY0 + fasciaH / 2 + 0.1, zF + 0.125, Math.min(w - 0.2, fasciaH * 4.2), Math.min(fasciaH - 0.08, (w - 0.2) / 4));
    if (s.awning) awning(H, HF, SM, awn, shopIdx, inner, fasciaY0, zF + 0.1, 1.6);
    const topKind = s.interior === 'fish' ? pick(r, ['fishTray', 'fishTray2']) : s.interior === 'veg' ? 'vegCrate' : s.interior === 'dry' ? 'dryBags' : s.interior === 'flower' ? 'flowers' : 'boxes';
    const tw = Math.min(inner - 0.6, 3.2), tr = signs.topOf(topKind).rect;
    for (const tz of [zF - 0.4, zF + 0.55]) {
      const ty = fy + (tz > zF ? 0.72 : 0.85);
      HF.boxB(M.plain, '#8a8f96', tw, ty - fy - 0.06, 0.7, 0, fy + (tz > zF ? H.gy(HF, 0, tz) - fy : 0), tz, { uv: null });
      H.quads(HF, SM.tops, '#ffffff', [{ p: [[-tw / 2, ty, tz + 0.36], [tw / 2, ty, tz + 0.36], [tw / 2, ty + 0.34, tz - 0.36], [-tw / 2, ty + 0.34, tz - 0.36]], n: [0, 0.9, 0.43], uv: [[tr[0], tr[1]], [tr[2], tr[1]], [tr[2], tr[3]], [tr[0], tr[3]]] }], { shadow: false });
    }
    // bare bulbs under the awning
    for (let i = 0; i < 3; i++) { const bx = -tw / 2 + tw * (i + 0.5) / 3; HF.cyl(M.plain, '#3a3346', 0.006, 0.45, bx, fasciaY0 - 0.2, zF + 0.6, { seg: 4 }); H.gb.raw(SM.bulb, null, ...rawSphere(0.06), HF.M(bx, fasciaY0 - 0.45, zF + 0.6)); }
    // price cards on sticks
    card(SM.tops, signs.topOf('price').rect, tw / 2 - 0.2, fy + 1.15, zF + 0.9, 0.3, 0.3);
  }
  // projecting vertical sign at the first-floor corner (both faces readable)
  if (S.floors >= 2 && w > 3.2 && r() < 0.75 && !real) {
    const t = signs.tallOf(shopIdx % SHOPS.length), sx = r() < 0.5 ? -1 : 1;
    const x = sx * (w / 2 - 0.25), y = top + 1.1, z = zF + 0.55;
    HF.box(M.plain, '#f2efe8', 0.1, 1.9, 0.5, x, y, z);
    card(SM.tall(shopIdx % SHOPS.length), t.rect, x + 0.052, y, z, 0.46, 1.84, { ry: Math.PI / 2 });
    card(SM.tall(shopIdx % SHOPS.length), t.rect, x - 0.052, y, z, 0.46, 1.84, { ry: -Math.PI / 2 });
    HF.box(M.plain, '#8e949b', 0.05, 0.05, 0.6, x, y + 0.9, zF + 0.3);
    HF.box(M.plain, '#8e949b', 0.05, 0.05, 0.6, x, y - 0.9, zF + 0.3);
  }
  // street extras: chalk menu stand for food shops, potted plants, a bench
  if (['cafe', 'diner', 'bakery', 'sushi'].includes(s.interior)) {
    const mx = (r() < 0.5 ? -1 : 1) * (inner / 2 - 0.4), mz = zF + 0.7, gy = H.gy(HF, mx, mz);
    const F2 = HF.sub(mx, gy, mz, (r() - 0.5) * 0.4);
    F2.beam(M.wood, '#6b4a36', [-0.28, 0, 0.18], [-0.24, 0.95, 0.02], 0.04, 0.04); F2.beam(M.wood, '#6b4a36', [0.28, 0, 0.18], [0.24, 0.95, 0.02], 0.04, 0.04);
    H.card(F2, SM.tops, signs.topOf('menuBoard').rect, 0, 0.55, 0.12, 0.5, 0.62, { shadow: true });
  }
  if (r() < 0.7) { const px = (r() < 0.5 ? -1 : 1) * (inner / 2 - 0.25), pz = zF + 0.35; H.props.pot(HF, px, H.gy(HF, px, pz), pz, r, 1.2); }
  if (s.pole) barberPole(H, HF, inner / 2 - 0.15, fy + 1.3, zF + 0.2);
  out.shops.push({ name: real ? real.name : s.name, type: s.type, style, real: !!real });
  return real ? { ...s, name: real.name } : s;
}

function awning(H, HF, SM, awn, k, width, y0, z0, depth) {
  const rc = awn.rect(k);
  const y1 = y0 - depth * 0.42, z1 = z0 + depth;
  const uv = [[rc[0], rc[1] + (rc[3] - rc[1]) * 0.2], [rc[2], rc[1] + (rc[3] - rc[1]) * 0.2], [rc[2], rc[3]], [rc[0], rc[3]]];
  const mat = SM.awning(awn.tex);
  H.quads(HF, mat, '#ffffff', [{ p: [[-width / 2, y1, z1], [width / 2, y1, z1], [width / 2, y0, z0], [-width / 2, y0, z0]], n: [0, 0.92, 0.39], uv }], { shadow: true });
  // valance (front drop)
  const uv2 = [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[1] + (rc[3] - rc[1]) * 0.25], [rc[0], rc[1] + (rc[3] - rc[1]) * 0.25]];
  H.quads(HF, mat, '#ffffff', [{ p: [[-width / 2, y1 - 0.26, z1], [width / 2, y1 - 0.26, z1], [width / 2, y1, z1], [-width / 2, y1, z1]], n: [0, 0, 1], uv: uv2 }], { shadow: true });
  // side cheeks + arms
  for (const sx of [-1, 1]) {
    H.quads(HF, mat, '#e6e0d4', [{ p: [[sx * width / 2, y1 - 0.26, z1], [sx * width / 2, y1, z1], [sx * width / 2, y0, z0], [sx * width / 2, y0 - 0.1, z0]], n: [sx, 0, 0], uv: [[rc[0], rc[1]], [rc[0], rc[1]], [rc[0], rc[1]], [rc[0], rc[1]]] }], { shadow: false });
    HF.beam(H.M.plain, '#8e949b', [sx * (width / 2 - 0.05), y0 - 0.55, z0], [sx * (width / 2 - 0.05), y1 + 0.02, z1 - 0.05], 0.03, 0.03);
  }
}

function lantern(H, HF, x, y, z, out) {
  const { M } = H;
  HF.cyl(M.plain, '#d24a36', 0.2, 0.55, x, y, z, { seg: 12 });
  HF.cyl(M.plain, '#2f2a30', 0.16, 0.06, x, y + 0.3, z, { seg: 10 });
  HF.cyl(M.plain, '#2f2a30', 0.16, 0.06, x, y - 0.3, z, { seg: 10 });
  const p = HF.w(x, y, z);
  out.lanterns.push({ x: p.x, y: p.y, z: p.z });
}

function barberPole(H, HF, x, y, z) {
  const { M } = H;
  HF.cyl(M.plain, '#e8e6e0', 0.09, 0.9, x, y, z, { seg: 10 });
  for (let i = 0; i < 4; i++) HF.box(M.plain, i % 2 ? '#2c4f8a' : '#c63d34', 0.19, 0.05, 0.02, x, y - 0.35 + i * 0.22, z + 0.09, { rz: 0.5 });
  HF.cyl(M.plain, '#aeb4ba', 0.1, 0.08, x, y + 0.49, z, { seg: 10 });
  HF.cyl(M.plain, '#aeb4ba', 0.1, 0.08, x, y - 0.49, z, { seg: 10 });
}

// small cached sphere raw arrays
const _sph = new Map();
function rawSphere(r) {
  if (_sph.has(r)) return _sph.get(r);
  const P = [], N = [], U = [], I = [];
  const seg = 8, rings = 6;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
    const th = j / rings * Math.PI, ph = i / seg * Math.PI * 2;
    const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
    P.push(nx * r, ny * r, nz * r); N.push(nx, ny, nz); U.push(i / seg, j / rings);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
  const out = [P, N, U, I]; _sph.set(r, out); return out;
}
export { rawSphere };
