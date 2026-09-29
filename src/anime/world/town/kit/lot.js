// [v3:town] copied from src/anime/world/_houses/lot.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Lot planner + yard builder: house placement, boundary walls / fences / hedges, gates with pillars,
// approach paving, parking pads, gardens, doorstep & yard props, colliders, and service spots.
import { buildHouse, WALLS } from './house.js';
import { SURNAMES } from './tex.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const wpick = (r, items) => { let s = 0; for (const [, w] of items) s += w; let x = r() * s; for (const [v, w] of items) { x -= w; if (x <= 0) return v; } return items[items.length - 1][0]; };

export const PAL = {
  plaster: ['#e8dcc6', '#e3d4b8', '#efe4cf', '#ddd0b8', '#e9dfd0', '#eadbc4', '#ecdcc8'],
  paint: ['#efe9dc', '#ece8e0', '#f0ebe1', '#e7e3da', '#eee6d8'],
  siding: ['#b7cddb', '#c2d3de', '#aec6d6', '#bccfdc', '#d8d4c8', '#c9c3b3', '#b9c4b4', '#e6dfcf', '#d3c6b4', '#c8d6cf'],
  tile: ['#cdd0cd', '#d3d2cc', '#c7c9c6', '#d6cfc4', '#bfc2c1', '#d9d2c6'],
  wood: ['#6b4f3c', '#5f4636', '#7a5a43'],
  kawara: ['#4a4f58', '#555a63', '#4f545c', '#56677a', '#5d6f82', '#4d6457', '#4a5f55', '#50565f'],
  metal: ['#7b8691', '#5c6b78', '#6a5448', '#4f5e57', '#8a8f94', '#6d7680'],
  frame: ['#4b4d52', '#4b4d52', '#5e4636', '#5e4636', '#8e949b'],
  gutter: ['#e4dfd2', '#6b5242', '#8e949b', '#4b4d52', '#d8d2c4'],
  shutter: ['#b9bcbf', '#8e8a82', '#d8d2c4', '#6b5a4c', '#a9aeb3'],
};

/** Random house spec for a footprint. */
export function makeSpec(r, o) {
  const kind = o.wallKind || wpick(r, [['plaster', 30], ['paint', 14], ['siding', 32], ['tile', 12], ['wood', o.traditional ? 30 : 6]]);
  const wall = { kind, color: pick(r, PAL[kind]) };
  let wall2 = null;
  if (o.floors >= 2 && r() < 0.22 && kind !== 'wood') {
    const k2 = kind === 'tile' ? 'siding' : kind === 'siding' ? 'tile' : 'siding';
    wall2 = kind === 'tile' ? { kind: 'siding', color: pick(r, PAL.siding) } : { kind: k2, color: pick(r, PAL[k2]) };
    // 1F tile / 2F siding reads best (heavier base)
    if (k2 === 'tile') { wall2 = { ...wall }; wall.kind = 'tile'; wall.color = pick(r, PAL.tile); }
  }
  const trad = !!o.traditional;
  const roofType = o.roofType || (trad ? pick(r, ['hip', 'hip', 'gable']) : wpick(r, [['hip', 42], ['gable', 36], ['shed', 14], ['flat', o.allowFlat ? 5 : 0]]));
  const roofMat = roofType === 'shed' || roofType === 'flat' ? 'metal' : (trad ? 'kawara' : (r() < 0.66 ? 'kawara' : 'metal'));
  const roof = { type: roofType, mat: roofMat, color: pick(r, PAL[roofMat]), pitch: roofMat === 'kawara' ? 0.42 + r() * 0.12 : (roofType === 'shed' ? 0.2 + r() * 0.1 : 0.3 + r() * 0.12), over: roofMat === 'kawara' ? 0.55 + r() * 0.12 : 0.42 + r() * 0.15, axis: r() < 0.5 ? 'x' : 'z', reverse: r() < 0.3 };
  const light = kind !== 'wood';
  const trim = kind === 'wood' ? '#3f3a3c' : (kind === 'siding' || r() < 0.5 ? '#ece8df' : '#6b5242');
  const frame = trad ? '#5e4636' : pick(r, PAL.frame);
  return {
    rng: r, wall, wall2, roof, trim, traditional: trad,
    frameColor: frame, sillColor: frame, grilleColor: pick(r, ['#8e949b', '#4b4d52', '#6b5a4c']),
    fasciaColor: roofMat === 'metal' ? pick(r, ['#ece8df', '#4f4a4a', '#6b5242', '#8e949b']) : pick(r, ['#ece8df', '#6b5242', '#4f4a4a']),
    soffitColor: pick(r, ['#ece8df', '#e6dfd0', '#efe9dc']),
    gutterColor: pick(r, PAL.gutter), flashColor: '#8a8f96', foundColor: pick(r, ['#bdbcb5', '#c3c1b9', '#b5b3ac']),
    shutterColor: pick(r, PAL.shutter), shutterStyle: trad ? 'tobukuro' : wpick(r, [['tobukuro', 30], ['roll', 32], ['none', 38]]),
    shutterClosed: 0.07, hoods: trad || r() < 0.18, hoodColor: pick(r, ['#6b7079', '#5a5f66', '#7b8691']),
    belt: light && r() < 0.45, cornerTrim: r() < 0.5, porchColor: pick(r, ['#c9bfb0', '#b9b1a4', '#d6cfc4', '#a9a49b', '#c4b39a']),
    canopyColor: pick(r, ['#ece8df', '#d8d2c4', '#6b5242', '#8e949b']), balconySlab: pick(r, ['#e2ddd2', '#d8d2c4']),
    railColor: pick(r, ['#8e949b', '#4b4d52', '#6b5242', '#c9ccd1']), poleColor: pick(r, ['#8fb3c9', '#c9ccd1', '#a8c7a0']),
    bigFront: r() < 0.7, antenna: r() < (o.antennaP ?? 0.55), solar: !trad && roofType !== 'flat' && r() < 0.1,
    propane: r() < 0.22, interiors: trad ? ['int_shoji', 'int_lace', 'int_shoji', 'int_dark', 'int_room'] : null,
  };
}

/**
 * Build one residential lot.
 * D: { F: Frame at frontage centre (+z toward road), w, depth, seed, lod, walls:{left,right,back}, road,
 *      layout?, floors?, keep?: [{x,z,r}], gardenSpot?: bool, special?: 'w3' }
 */
export function buildLot(H, D) {
  const { ctx, M, P } = H;
  const r = ctx.rng('lot-' + D.seed);
  const F = D.F;
  const W = D.w, Dp = D.depth, lod = D.lod ?? 2;
  H.lod = lod;
  const gy = (x, z) => H.gy(F, x, z);
  const res = { gardenSpots: [], bikeSpots: [], wallTops: [] };
  const toWorld = (x, z) => { const p = F.w(x, 0, z); return { x: p.x, z: p.z, y: p.y }; };

  // ------------------------------------------------------------ layout
  let layout = D.layout || wpick(r, [['yard', 40], ['sidePark', 38], ['frontPark', Dp >= 13 ? 22 : 0]]);
  if (W < 8.2 && layout === 'sidePark') layout = 'yard';
  const floors = D.floors || wpick(r, [[1, 8], [2, 74], [3, layout === 'sidePark' && W < 10 ? 18 : 6]]);
  let hx0, hx1, hz0, hz1, park = null;
  const gapA = 0.9 + r() * 0.35, gapB = 0.9 + r() * 0.35;
  const rear = Dp > 12.5 ? 1.4 + r() * 1.0 : 1.0 + r() * 0.5;
  let setback;
  if (layout === 'frontPark') {
    setback = 5.6 + r() * 0.5;
    hx0 = -W / 2 + gapA; hx1 = W / 2 - gapB;
    park = { x0: -W / 2 + 0.25, x1: Math.min(W / 2 - 1.4, -W / 2 + 0.25 + (W > 9.5 ? 5.4 : 2.8)), z0: -setback + 0.3, z1: -0.05 };
  } else if (layout === 'sidePark') {
    setback = 1.7 + r() * 1.4;
    const ps = r() < 0.5 ? -1 : 1;
    const pw = 2.75;
    if (ps < 0) { park = { x0: -W / 2 + 0.2, x1: -W / 2 + 0.2 + pw, z0: -5.6, z1: -0.05 }; hx0 = park.x1 + 0.4; hx1 = W / 2 - gapB; }
    else { park = { x0: W / 2 - 0.2 - pw, x1: W / 2 - 0.2, z0: -5.6, z1: -0.05 }; hx1 = park.x0 - 0.4; hx0 = -W / 2 + gapA; }
    park.side = ps;
  } else {
    setback = Dp > 12.5 ? 2.4 + r() * 2.3 : 1.8 + r() * 1.2;
    hx0 = -W / 2 + gapA; hx1 = W / 2 - gapB;
  }
  if (D.houseRect) ({ hx0, hx1, hz0, hz1 } = D.houseRect);
  else {
    hz1 = -setback; hz0 = -Dp + rear;
    const maxD = floors === 1 ? 9.5 : 9.0;
    if (hz1 - hz0 > maxD) hz0 = hz1 - maxD;
    // narrow the house a little for variety of side gaps
    const hw = hx1 - hx0;
    if (hw > 8.8) { const cut = hw - 8.8 + r() * 0.8; if (r() < 0.5) hx0 += cut; else hx1 -= cut; }
  }
  const hw = hx1 - hx0, hd = hz1 - hz0;
  const hcx = (hx0 + hx1) / 2, hcz = (hz0 + hz1) / 2;

  // ------------------------------------------------------------ house spec
  const S = makeSpec(r, { floors, traditional: D.traditional, roofType: D.roofType, allowFlat: floors >= 2 && hw < 7.5, antennaP: D.antennaP });
  Object.assign(S, { w: hw, d: hd, floors, fh: 2.85, lod });
  if (D.specOverride) Object.assign(S, D.specOverride);
  // ground under the footprint
  const HF = F.sub(hcx, 0, hcz, 0);
  let gmin = 1e9, gmax = -1e9;
  for (const [x, z] of [[hx0, hz0], [hx1, hz0], [hx0, hz1], [hx1, hz1], [hcx, hcz]]) { const g = gy(x, z); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
  S.floorY = gmax + 0.45 + (S.traditional ? 0.08 : 0);
  S.groundMin = gmin;
  S.groundFront = gy(hcx, hz1 + 1);
  // door position on the front face (u relative to house centre)
  let du;
  if (layout === 'sidePark') du = park.side < 0 ? -hw / 2 + 0.95 : hw / 2 - 0.95;
  else du = (r() < 0.5 ? -1 : 1) * (hw / 2 - 1.0 - r() * 0.6);
  const dStyle = S.traditional ? 'door_slide' : wpick(r, [['door_wood', 40], ['door_white', 22], ['door_grey', 28], ['door_slide', 10]]);
  if (dStyle === 'door_slide') du = Math.sign(du || 1) * Math.min(Math.abs(du), hw / 2 - 1.35);
  S.door = { u: du, style: dStyle, canopy: wpick(r, [['slab', 50], ['roof', S.traditional ? 60 : 22], ['posts', 12]]), porchD: 1.15 + r() * 0.3 };
  // wing (1F extension) on the front, opposite side of the door
  if (floors >= 2 && lod >= 1 && r() < (D.wingP ?? 0.32) && hw > 6.2 && setback > 2.6 && layout !== 'frontPark') {
    const ww = Math.min(3.6, hw * 0.45), wd = Math.min(1.5, setback - 1.3);
    if (wd > 0.9) {
      const sgn = du > 0 ? -1 : 1;
      S.wing = { cx: sgn * (hw / 2 - ww / 2), cz: hd / 2 + wd / 2, w: ww, d: wd, floors: 1, attach: 'front' };
    }
  }
  // balcony
  if (floors >= 2 && r() < (D.balconyP ?? 0.72)) {
    const bw = Math.min(hw - 0.4, 2.8 + r() * 1.8);
    let bu = (r() - 0.5) * (hw - bw) ;
    if (S.wing) bu = -Math.sign(S.wing.cx) * (hw / 2 - bw / 2 - 0.1);
    const overDoor = Math.abs(bu - du) < bw / 2 + 0.7;
    if (overDoor) S.door.canopy = S.door.canopy === 'roof' ? 'slab' : S.door.canopy;
    const mix = pick(r, ['balcony', 'student', 'family', 'sheets', 'balcony']);
    S.balcony = { u: bu, w: bw, depth: 0.85 + r() * 0.2, rail: r() < (lod >= 2 ? 0.5 : 0.8) ? 'panel' : 'bars', laundry: r() < (D.laundryP ?? 0.62), laundryMix: mix, futon: r() < 0.22, dish: r() < 0.3, chime: r() < 0.12, koinobori: r() < 0.06, posts: false };
  }
  if (S.traditional && floors >= 2 && r() < 0.7 && !S.wing) S.skirt = { depth: 0.75 + r() * 0.25 };
  // nameplate & mailbox on a gate pillar (if there is a gate) or by the door
  const plateName = D.plate || (r() < 0.33 ? 'plateV' + (1 + 3 * Math.floor(r() * 8)) : 'plateH' + [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17][Math.floor(r() * 12)]);
  S.plate = plateName;
  S.wallMailbox = pick(r, ['mailbox', 'mailbox_dark', 'mailbox', 'mailbox_red']);
  S.baseY = HF.origin.y;

  // ------------------------------------------------------------ boundary (front)
  const frontStyle = D.frontStyle || (layout === 'frontPark' ? pick(r, ['low', 'low', 'fence']) : wpick(r, [['block', 26], ['plasterWall', 18], ['fence', 22], ['hedge', 18], ['low', 10], ['lattice', 6]]));
  const hasGate = frontStyle !== 'low' || r() < 0.5;
  S.gatePlate = hasGate && frontStyle !== 'hedge' && r() < 0.8;
  const gateX = hcx + du;
  const gateW = 1.15;
  const openings = [];
  if (park) openings.push([park.x0 - 0.05, park.x1 + 0.05, 'park']);
  if (hasGate) openings.push([gateX - gateW / 2 - 0.2, gateX + gateW / 2 + 0.2, 'gate']);
  else openings.push([gateX - 0.8, gateX + 0.8, 'open']);
  openings.sort((a, b) => a[0] - b[0]);
  // merge overlapping openings
  const ops = [];
  for (const o of openings) { const last = ops[ops.length - 1]; if (last && o[0] <= last[1] + 0.3) { last[1] = Math.max(last[1], o[1]); last[2] += '+' + o[2]; } else ops.push([...o]); }
  const segs = [];
  let cur = -W / 2 + 0.06;
  for (const o of ops) { if (o[0] - cur > 0.25) segs.push([cur, o[0]]); cur = Math.max(cur, o[1]); }
  if (W / 2 - 0.06 - cur > 0.25) segs.push([cur, W / 2 - 0.06]);
  const fz = D.frontZ ?? -0.15;
  const wallCol = frontStyle === 'block' ? pick(r, ['#c9c7c0', '#d8d2c4', '#bdbcb5', '#e3dccd']) : frontStyle === 'plasterWall' ? pick(r, PAL.plaster) : '#c9c7c0';
  const wh = frontStyle === 'block' ? 1.0 + r() * 0.3 : frontStyle === 'plasterWall' ? 1.1 + r() * 0.25 : frontStyle === 'fence' ? 0.5 : frontStyle === 'low' ? 0.42 : frontStyle === 'lattice' ? 0.35 : 0.3;
  for (const [a, b] of segs) {
    boundarySeg(H, F, a, b, fz, frontStyle, wh, wallCol, r, gy, lod, res, true);
  }
  // gate pillars + leaves
  const gateOp = ops.find(o => o[2].includes('gate'));
  if (hasGate && gateOp) {
    const pillarCol = frontStyle === 'plasterWall' ? wallCol : pick(r, ['#d8d2c4', '#bdb6a8', '#e3dccd', '#9d9c96', '#c9bfb0']);
    const pkind = frontStyle === 'plasterWall' ? 'plaster' : pick(r, ['tile', 'plaster', 'tile']);
    const ph = Math.max(1.35, wh + 0.2);
    const gxL = gateX - gateW / 2 - 0.15, gxR = gateX + gateW / 2 + 0.15;
    const pillars = [gxL, gxR];
    for (const px of pillars) {
      const g = gy(px, fz);
      F.boxB(M[WALLS[pkind][0]], pillarCol, 0.3, ph + 0.12, 0.3, px, g - 0.12, fz, { uv: { world: WALLS[pkind][1] } });
      F.boxB(M.plain, '#8f8c84', 0.36, 0.05, 0.36, px, g + ph, fz);
      H.col(F, px, fz, 0.3, 0.3, 0, g - 0.5, g + ph);
    }
    // plate / intercom / mailbox on the right pillar (street side +z)
    const pp = gxR, g = gy(pp, fz);
    if (S.gatePlate) {
      P.plate(F.sub(pp, 0, fz + 0.15, 0), 0, g + 1.1, 0.0, plateName);
      F.box(M.atlas, '#ffffff', 0.09, 0.15, 0.03, pp, g + 0.82, fz + 0.165, { uv: { rect: H.A.rects.intercom, white: H.A.white } });
      F.box(M.atlas, '#ffffff', 0.3, 0.24, 0.08, gxL, gy(gxL, fz) + 1.0, fz + 0.18, { uv: { rect: H.A.rects[S.wallMailbox], white: H.A.white } });
      if (r() < 0.3) F.box(M.plain, '#e9e5da', 0.2, 0.03, 0.05, gxL + 0.02, gy(gxL, fz) + 1.14, fz + 0.24, { rz: 0.2 }); // newspaper sticking out
      if (lod >= 2 && r() < 0.35) F.box(M.atlas, '#ffffff', 0.13, 0.08, 0.01, pp, g + 0.55, fz + 0.155, { uv: { rect: H.A.rects[r() < 0.5 ? 'sticker_dog' : 'sticker_nosale'], white: H.A.white } });
    }
    // gate lamp on the pillar
    if (r() < 0.35) { F.box(M.plain, '#4b4d52', 0.16, 0.2, 0.16, gxL, gy(gxL, fz) + ph + 0.15, fz); F.box(M.lampDim, null, 0.12, 0.14, 0.12, gxL, gy(gxL, fz) + ph + 0.17, fz, { shadow: false }); }
    // leaves: aluminium lattice gate (門扉), closed or ajar
    const open = r() < 0.45;
    const lw = gateW / 2 - 0.02;
    for (const s of [-1, 1]) {
      const hinge = gateX + s * gateW / 2;
      const ang = open ? s * 1.2 : 0;
      const GF = F.sub(hinge, gy(hinge, fz), fz, -ang);
      GF.box(M.atlasCut, '#ffffff', lw, 1.0, 0.03, -s * lw / 2, 0.55, 0, { uv: { rect: H.A.rects.gate_alu, white: H.A.white, faces: 'front+back' }, noOutline: true });
      GF.box(M.plain, '#5c4a3e', 0.04, 1.0, 0.04, -s * 0.02, 0.55, 0);
    }
    if (!open) H.col(F, gateX, fz, gateW, 0.12, 0, gy(gateX, fz) - 0.5, gy(gateX, fz) + 1.05);
  }
  // ------------------------------------------------------------ side + rear boundaries
  const sideStyle = D.sideStyle || pick(r, ['block', 'block', 'mesh', 'mesh', 'block']);
  const sideH = sideStyle === 'block' ? 0.9 + r() * 0.35 : 1.0;
  const sideCol = pick(r, ['#c9c7c0', '#bdbcb5', '#d8d2c4']);
  const sideZ0 = fz - 0.15, sideZ1 = -Dp + 0.08;
  if (D.walls?.left !== false) boundarySegZ(H, F, -W / 2 + 0.07, sideZ0, sideZ1, sideStyle, sideH, sideCol, r, gy);
  if (D.walls?.right) boundarySegZ(H, F, W / 2 - 0.07, sideZ0, sideZ1, sideStyle, sideH, sideCol, r, gy);
  if (D.walls?.back !== false) boundarySeg(H, F, -W / 2 + 0.07, W / 2 - 0.07, -Dp + 0.08, D.backStyle || sideStyle, D.backH || (sideStyle === 'block' ? 1.2 : 1.0), sideCol, r, gy, lod, null, false);

  // ------------------------------------------------------------ ground covers
  const frontCover = D.traditional ? 'gravel' : pick(r, ['gravel', 'gravel', 'lawn', 'soil']);
  H.groundRect(F, -W / 2 + 0.05, -Dp + 0.05, W / 2 - 0.05, fz - 0.1, frontCover === 'lawn' ? M.lawn : frontCover === 'soil' ? M.soil : M.gravel, frontCover === 'lawn' ? '#b9cf98' : frontCover === 'soil' ? '#cdbfa6' : '#d6d0c4', 0.02, frontCover === 'lawn' ? 2 : 1.5);
  // strip in front of the boundary (between the frontage line and the wall) — concrete
  H.groundRect(F, -W / 2 + 0.02, fz - 0.1, W / 2 - 0.02, 0, M.concrete, '#c9c7c0', 0.03, 2);
  // approach (gate -> porch)
  const porchFrontZ = hz1 + (S.door.porchD || 1.2) + 0.55;
  const apz0 = Math.min(porchFrontZ, fz - 0.1), apz1 = fz - 0.1;
  if (apz1 - apz0 > 0.2 && !(park && gateX > park.x0 - 0.5 && gateX < park.x1 + 0.5)) {
    if (D.traditional || (r() < 0.25 && frontCover !== 'soil')) P.steppingStones(F, gateX, apz1 - 0.3, gateX + (r() - 0.5) * 0.3, apz0 + 0.2, gy, r);
    else H.groundRect(F, gateX - 0.6, apz0, gateX + 0.6, apz1, M.paver, pick(r, ['#d8d0c2', '#cfc6b6', '#c9c3b8', '#d9cdbd']), 0.04, 1.2);
  }
  // parking pad (concrete with slits)
  if (park) {
    const pz0 = layout === 'frontPark' ? park.z0 : Math.max(park.z0, hz0 + 0.5);
    H.groundRect(F, park.x0, pz0, park.x1, park.z1, M.concrete, pick(r, ['#c9c7c0', '#cdcbc3', '#c3c1b9']), 0.05, 2);
    if (r() < 0.5) { for (const t of [0.33, 0.66]) H.groundRect(F, park.x0 + 0.1, pz0 + (park.z1 - pz0) * t - 0.07, park.x1 - 0.1, pz0 + (park.z1 - pz0) * t + 0.07, M.lawn, '#a9c48a', 0.058, 2); }
    else if (lod >= 2) H.decal(F.sub(0, 0, 0, 0), 'stain', (park.x0 + park.x1) / 2, 0, 1.0, 1.0, 0, '#ffffff', { floor: true, z: (pz0 + park.z1) / 2, gy });
    // carport roof for some
    if (r() < 0.35 && lod >= 1) carport(H, F, park.x0, park.x1, pz0, park.z1, gy, r);
    // bike spot in the parking, parallel to the house side
    const bx = park.side ? (park.side < 0 ? park.x1 - 0.5 : park.x0 + 0.5) : park.x1 - 0.5;
    const bz = Math.max(pz0 + 1.2, hz1 - 1.2);
    if (bz < park.z1 - 0.5) { const w = toWorld(bx, bz); res.bikeSpots.push({ x: w.x, z: w.z, rotY: F.ry + (r() < 0.5 ? 0 : Math.PI) }); }
  }
  // ------------------------------------------------------------ house
  const hout = buildHouse(H, HF, S);
  // bike spot by the porch (parallel to the house front)
  if (hout.porch && lod >= 1) {
    const side = du > 0 ? -1 : 1;
    const bxl = hcx + du + side * ((hout.porch.w / 2) + 1.0);
    if (bxl > hx0 + 0.5 && bxl < hx1 - 0.5 && r() < 0.6 && !(park && bxl > park.x0 - 0.8 && bxl < park.x1 + 0.8)) {
      const w = toWorld(bxl, hz1 + 0.5);
      res.bikeSpots.push({ x: w.x, z: w.z, rotY: F.ry + Math.PI / 2 * (r() < 0.5 ? 1 : -1) });
    }
  }
  // ------------------------------------------------------------ garden
  const keep = (D.keep || []).slice();
  let gspot = null;
  if (D.gardenSpot && layout !== 'frontPark' && setback > 2.3) {
    const sx = park ? -park.side : (du > 0 ? -1 : 1);
    const gx = sx * (W / 2 - 1.55), gz = fz - Math.min(1.6, (setback - 0.3) / 2) - 0.1;
    if (!(gx - 1.2 < hx1 && gx + 1.2 > hx0 && gz - 1.2 < hz1)) {
      gspot = { x: gx, z: gz, r: 1.2 };
      keep.push({ x: gx, z: gz, r: 1.4 });
      const w = toWorld(gx, gz); res.gardenSpots.push({ x: w.x, z: w.z, r: 1.3 });
      H.groundRect(F, gx - 1.2, gz - 1.1, gx + 1.2, Math.min(gz + 1.1, fz - 0.12), M.lawn, '#b5cc93', 0.028, 2);
    }
  }
  const isKept = (x, z, rr = 0.5) => keep.some(k => Math.hypot(k.x - x, k.z - z) < k.r + rr);
  if (lod >= 1) gardenPlanting(H, F, { W, Dp, fz, hx0, hx1, hz0, hz1, park, gateX, gateW, frontStyle, setback, traditional: !!D.traditional, lod, du, hcx }, r, gy, isKept);
  // yard items: laundry stand in the back/side yard, shed, bins, faucet, propane handled in house
  if (lod >= 1) {
    const rearDepth = hz0 - (-Dp);
    if (rearDepth > 1.6 && r() < 0.4) P.laundryStand(F, hcx + (r() - 0.5) * (hw - 3), hz0 - rearDepth / 2, gy, 2.4, r, r() < 0.7);
    if (rearDepth > 1.3 && r() < 0.45) { const sx = hcx + (r() < 0.5 ? -1 : 1) * (hw / 2 - 1.2); P.shed(F.sub(sx, 0, -Dp + 0.62, 0), 0, gy(sx, -Dp + 0.6), 0, r, 1.5 + r() * 0.4); H.col(F, sx, -Dp + 0.62, 1.8, 0.95, 0, gy(sx, -Dp + 0.6) - 0.5, gy(sx, -Dp + 0.6) + 1.95); }
    // garbage bins by the gate (inside)
    if (r() < 0.45) { const bx = gateX + (gateX > 0 ? -1 : 1) * (gateW / 2 + 0.9); if (bx > -W / 2 + 0.6 && bx < W / 2 - 0.6 && !isKept(bx, fz - 0.55) && !(park && bx > park.x0 - 0.3 && bx < park.x1 + 0.3)) P.bins(F, bx, gy(bx, fz - 0.55), fz - 0.55, r, 1 + Math.floor(r() * 2)); }
    // outdoor tap by the house side
    if (lod >= 2 && r() < 0.5) { const fx = hx0 - 0.35; if (fx > -W / 2 + 0.3) P.faucet(F.sub(fx, 0, hz1 - 1.2, Math.PI / 2), 0, gy(fx, hz1 - 1.2), 0, r); }
    // broom / dustpan leaning by the door side wall
    if (lod >= 2 && r() < 0.35) { const g0 = gy(hx1 + 0.3, hz1 - 0.7); P.broom(F.sub(hx1 + 0.02, 0, hz1 - 0.7, Math.PI / 2), 0, g0, 0); if (r() < 0.6) P.dustpan(F.sub(hx1 + 0.02, 0, hz1 - 1.15, Math.PI / 2), 0, g0, 0.2); }
    if (lod >= 2 && r() < 0.2) P.toys(F, hcx + (r() - 0.5) * 2, gy(hcx, hz1 + 0.9), hz1 + 0.9, r);
  }
  // wall-top services from front walls
  for (const wt of res.wallTops) { /* already world */ }
  res.house = hout; res.S = S; res.layout = layout; res.houseRect = { hx0, hx1, hz0, hz1 };
  return res;
}

// =============================================================================================
/** A boundary segment along local x (a..b) at z. style: block|plasterWall|fence|hedge|low|lattice|mesh */
export function boundarySeg(H, F, a, b, z, style, h, col, r, gy, lod, res, isFront) {
  const { M, P } = H;
  const L = b - a;
  if (L < 0.2) return;
  const t = style === 'hedge' ? 0.55 : 0.15;
  const xm = (a + b) / 2;
  const g0 = gy(a, z), g1 = gy(b, z), gm = gy(xm, z);
  if (style === 'block' || style === 'plasterWall' || style === 'low') {
    const kind = style === 'plasterWall' ? 'plaster' : 'block';
    H.slopedWall(F, a, b, z, h, t, M[kind === 'plaster' ? 'plaster' : 'block'], col, kind === 'plaster' ? 3 : 1.6, kind === 'plaster' ? 3 : 0.8);
    // coping (笠木)
    H.slopedWall(F, a - 0.02, b + 0.02, z, h + 0.05, t + 0.05, M.plain, style === 'plasterWall' ? '#8f8c84' : '#b3b1aa', 0, 0, h);
    if (style === 'low' && lod >= 1) { // planting strip behind a low wall
      const n = Math.max(1, Math.round(L / 1.1));
      for (let i = 0; i < n; i++) { const x = a + (i + 0.5) * L / n; P.bush(F, x, gy(x, z - 0.45), z - 0.45, 0.32 + r() * 0.12, r, { pal: 'green', flowers: r() < 0.5 ? 'azalea' : null, fn: 5 }); }
    }
    if (lod >= 2 && r() < 0.7 && style !== 'low') H.decal(F, 'moss', xm, gm + 0.12, L * 0.9, 0.3, z + t / 2 + 0.006, '#ffffff');
    if (lod >= 2 && r() < 0.3 && style === 'block') H.decal(F, 'crack', a + L * (0.2 + r() * 0.6), gm + h * 0.5, 0.35, 0.5, z + t / 2 + 0.006, '#ffffff');
    H.col(F, xm, z, L, t + 0.04, 0, Math.min(g0, g1) - 0.5, Math.max(g0, g1) + h);
    if (res && h >= 0.9 && L > 1.2) {
      const p = F.w(xm, 0, z);
      res.wallTops.push({ x: p.x, z: p.z, y: +(H.L.heightAt(p.x, p.z) + h + 0.05).toFixed(3), rotY: F.ry, len: +L.toFixed(2) });
    }
  } else if (style === 'fence') { // block base + aluminium slat fence
    const bh = 0.45;
    H.slopedWall(F, a, b, z, bh, 0.15, M.block, col, 1.6, 0.8);
    H.slopedWall(F, a - 0.02, b + 0.02, z, bh + 0.04, 0.19, M.plain, '#b3b1aa', 0, 0, bh);
    const fc = pick(r, ['#5c4a3e', '#4b4d52', '#8e949b', '#6b5242']);
    const n = Math.max(1, Math.round(L / 1.9));
    for (let i = 0; i <= n; i++) { const x = a + 0.05 + i * (L - 0.1) / n; F.boxB(M.plain, fc, 0.05, 0.78, 0.05, x, gy(x, z) + bh + 0.04, z); }
    for (let k = 0; k < 6; k++) H.slopedWall(F, a + 0.05, b - 0.05, z, bh + 0.12 + k * 0.12 + 0.05, 0.02, M.plain, fc, 0, 0, bh + 0.12 + k * 0.12);
    H.col(F, xm, z, L, 0.2, 0, Math.min(g0, g1) - 0.5, Math.max(g0, g1) + 1.3);
  } else if (style === 'hedge') {
    H.slopedWall(F, a, b, z + 0.2, 0.28, 0.16, M.block, '#c9c7c0', 1.6, 0.8);
    P.hedge(F, a + 0.05, b - 0.05, z - 0.12, 1.05 + r() * 0.35, 0.55, r, r() < 0.3 ? 'dark' : 'green', gy);
    H.col(F, xm, z - 0.1, L, 0.6, 0, Math.min(g0, g1) - 0.5, Math.max(g0, g1) + 1.3);
  } else if (style === 'lattice') { // low base + wooden lattice screen (木格子)
    H.slopedWall(F, a, b, z, 0.3, 0.16, M.concrete, '#bdbcb5', 2, 2);
    const wc = pick(r, ['#6b4f3c', '#8a6446', '#5f4636']);
    const n = Math.round(L / 0.11);
    for (let i = 0; i <= n; i++) { const x = a + 0.03 + i * (L - 0.06) / n; F.boxB(M.plain, wc, 0.035, 1.3, 0.05, x, gy(x, z) + 0.3, z); }
    H.slopedWall(F, a, b, z, 1.66, 0.08, M.plain, wc, 0, 0, 1.6);
    H.col(F, xm, z, L, 0.2, 0, Math.min(g0, g1) - 0.5, Math.max(g0, g1) + 1.7);
  } else if (style === 'mesh') {
    meshFence(H, F, a, b, z, h, r, gy, 'x');
    H.col(F, xm, z, L, 0.12, 0, Math.min(g0, g1) - 0.5, Math.max(g0, g1) + h);
  }
}
/** boundary along local z at x (for side walls) — implemented via a rotated frame */
export function boundarySegZ(H, F, x, z0, z1, style, h, col, r, gy) {
  // frame whose local x runs along -z of F: sub(x,0,0, PI/2): local x -> F's -z
  const SF = F.sub(x, 0, 0, Math.PI / 2);
  const g2 = (u, w) => gy(x + w, -u); // SF local (u along -z, w along +x)
  boundarySeg(H, SF, -z0, -z1, 0, style, h, col, r, (u, w) => gy(x + w, -u), 1, null, false);
}

function meshFence(H, F, a, b, z, h, r, gy, axis) {
  const { M } = H;
  const c = pick(r, ['#5f8f6a', '#6b7f8f', '#8e949b']);
  const L = b - a, n = Math.max(1, Math.round(L / 2));
  H.slopedWall(F, a, b, z, 0.12, 0.12, M.concrete, '#b9b8b2', 2, 2);
  for (let i = 0; i <= n; i++) { const x = a + 0.03 + i * (L - 0.06) / n; F.boxB(M.plain, c, 0.045, h, 0.045, x, gy(x, z), z); }
  H.slopedWall(F, a, b, z, h, 0.035, M.plain, c, 0, 0, h - 0.035);
  H.slopedWall(F, a, b, z, 0.2, 0.03, M.plain, c, 0, 0, 0.16);
  H.meshPanel(F, a, b, z, 0.2, h - 0.04, c, gy);
}

function carport(H, F, x0, x1, z0, z1, gy, r) {
  const { M } = H;
  const c = pick(r, ['#8e949b', '#5c4a3e', '#c9ccd1']);
  const hh = 2.3;
  const px = x1 - x0 > 4 ? x0 + 0.1 : (x0 + 0.1);
  const zA = z0 + 0.4, zB = z1 - 0.4;
  for (const zz of [zA, zB]) { F.boxB(M.plain, c, 0.08, hh, 0.08, px, gy(px, zz) - 0.1, zz); H.colC(F, px, zz, 0.07, gy(px, zz) - 0.5, gy(px, zz) + hh); }
  const top = Math.max(gy(px, zA), gy(px, zB)) + hh;
  F.box(M.plain, c, 0.1, 0.14, z1 - z0 - 0.2, px, top, (z0 + z1) / 2);
  F.box(M.plain, c, x1 - x0 + 0.2, 0.08, 0.08, (x0 + x1) / 2 + 0.05, top + 0.12, z0 + 0.2);
  F.box(M.plain, c, x1 - x0 + 0.2, 0.08, 0.08, (x0 + x1) / 2 + 0.05, top + 0.12, z1 - 0.2);
  for (let k = 1; k < 4; k++) F.box(M.plain, c, x1 - x0 + 0.1, 0.05, 0.05, (x0 + x1) / 2 + 0.05, top + 0.14, z0 + 0.2 + k * (z1 - z0 - 0.4) / 4);
  F.box(M.poly, null, x1 - x0 + 0.25, 0.02, z1 - z0 - 0.2, (x0 + x1) / 2 + 0.05, top + 0.18, (z0 + z1) / 2, { shadow: true, noOutline: true });
}

function gardenPlanting(H, F, o, r, gy, isKept) {
  const { P } = H;
  const { W, fz, hx0, hx1, hz1, park, gateX, gateW, frontStyle, setback, traditional, lod, du, hcx } = o;
  const zIn = fz - 0.55;
  const inPark = (x) => park && x > park.x0 - 0.4 && x < park.x1 + 0.4;
  const nearGate = (x) => Math.abs(x - gateX) < gateW / 2 + 0.6;
  // shrubs along the inside of the front boundary
  if (frontStyle !== 'hedge' && frontStyle !== 'low') {
    for (let x = -W / 2 + 0.6; x < W / 2 - 0.5; x += 0.9 + r() * 0.8) {
      if (inPark(x) || nearGate(x) || isKept(x, zIn)) continue;
      if (zIn < hz1 + 0.4) continue;
      const t = r();
      if (t < 0.4) P.bush(F, x, gy(x, zIn), zIn, 0.35 + r() * 0.15, r, { pal: 'green', flowers: 'azalea', fn: 7 });
      else if (t < 0.6) P.bush(F, x, gy(x, zIn), zIn, 0.4 + r() * 0.15, r, { pal: 'dark' });
      else if (t < 0.72) P.nandina(F, x, gy(x, zIn), zIn, 1.0, r);
      else if (t < 0.8 && lod >= 2) P.bush(F, x, gy(x, zIn), zIn, 0.45, r, { pal: 'green', flowers: 'hydrangea', fn: 5, fsize: 0.18 });
    }
  }
  // a garden tree / pine in the front yard corner (if space and not a kept spot)
  if (setback > 2.4) {
    const sx = du > 0 ? -1 : 1;
    const tx = hcx + sx * ((hx1 - hx0) / 2 - 0.8), tz = (fz + hz1) / 2 - 0.1;
    if (!inPark(tx) && !isKept(tx, tz, 1.0) && !nearGate(tx)) {
      if (traditional || r() < 0.3) P.pine(F, tx, gy(tx, tz), tz, 1.1 + r() * 0.5, r);
      else P.tree(F, tx, gy(tx, tz), tz, 1.0 + r() * 0.5, r, pick(r, ['maple', 'olive', 'osmanthus', 'camellia', 'round']));
    }
    // lantern + bonsai for traditional gardens
    if (traditional && lod >= 2) {
      const lx = hcx - sx * 1.2, lz = (fz + hz1) / 2;
      if (!isKept(lx, lz, 0.6) && !nearGate(lx)) P.lantern(F, lx, gy(lx, lz), lz);
    }
  }
  // shrubs along the house front base
  const baseZ = hz1 + 0.45;
  for (let x = hx0 + 0.5; x < hx1 - 0.4; x += 1.2 + r() * 1.2) {
    if (Math.abs(x - (hcx + du)) < 1.3 || inPark(x) || isKept(x, baseZ)) continue;
    if (baseZ > fz - 0.4) continue;
    if (r() < 0.55) P.bush(F, x, gy(x, baseZ), baseZ, 0.28 + r() * 0.12, r, { pal: r() < 0.5 ? 'green' : 'dark', flowers: r() < 0.3 ? 'azalea' : null, fn: 4 });
    else if (lod >= 2 && r() < 0.4) P.planter(F, x, gy(x, baseZ), baseZ, 0.7 + r() * 0.3, r);
  }
  if (traditional && lod >= 2 && r() < 0.8) {
    const bx = hx1 - 0.9, bz = hz1 + 0.6;
    if (!isKept(bx, bz) && baseZ < fz - 0.8) P.bonsaiShelf(F, bx, gy(bx, bz), bz, r);
  }
}
