// [v3:town] Big buildings of the hero zone: マンション / 市営住宅 apartment blocks and office / public buildings.
// Apartment blocks: balconies on the sunny long face (concrete parapet panels, unit partitions, sliding glass doors with
// curtains from the house kit, laundry, AC units), open external corridors with steel doors on the back, a stair tower
// and an elevator shaft, rooftop water tank + machine room, a vertical building name, an entrance canopy.
// Offices / public buildings: ribbon windows (life's window material: anime glass by day, a lit fraction at night),
// coloured spandrels, a glass entrance with a canopy, rooftop plant and a parapet.
import { buildWindow } from './kit/house.js';
import { groundRange, pick } from './common.js';
import { flatRoofOf } from './palette.js';
import { OFFICES } from './names.js';
import { lights } from '../life/lights.js';

const BODY = ['#e6e1d6', '#dcd6ca', '#e9e4da', '#d6dde0', '#e3dccd', '#d2d6d2', '#ece6d8'];
const ACCENT = ['#8c5a4a', '#4f6f8f', '#6d8a6a', '#b88a4a', '#5d6f86', '#9a6b5b'];

/** Name atlas: vertical building names (64×256 cells, 8 per row, 512×512). */
export function makeNameAtlas(ctx) {
  const T = ctx.tex, F = T.FONTS;
  const tex = T.draw(512, 512, (g) => {
    OFFICES.forEach((name, k) => {
      const x = (k % 8) * 64, y = Math.floor(k / 8) * 256;
      g.fillStyle = '#f2efe8'; g.fillRect(x + 2, y + 2, 60, 252);
      g.fillStyle = '#3a4a66'; g.fillRect(x + 6, y + 6, 52, 244);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = [...name.replace(/ /g, '')], size = Math.min(34, 230 / (chars.length * 1.05));
      g.font = `900 ${size}px ${F.sans}`;
      chars.forEach((ch, i) => g.fillText(ch, x + 32, y + 18 + size / 2 + i * size * 1.05));
    });
  }, { key: 'town-names', anisotropy: 4 });
  return { tex, rect: (k) => { const x = (k % 8) * 64, y = Math.floor(k / 8) * 256; return [x / 512, 1 - (y + 256) / 512, (x + 64) / 512, 1 - y / 512]; } };
}

/** Frame the block so that local +z is the sunny (balcony) long face and local x runs along it. */
function blockFrame(H, lot, wing = null) {
  const L = H.L, f = L.lotFrame(lot);
  const F = H.Frame.at(H.gb, f.x, f.y, f.z, f.rotY);
  // [v4:town-accuracy] on the footprint's main wing (hero.js: the other wings are annexes from the simplified builder)
  const wg = wing || { cx: 0, cz: 0, w: lot.obb.w, d: lot.obb.d };
  const HF = F.sub(wg.cx, 0, -lot.obb.d / 2 + wg.cz, 0);
  const w = wg.w - 0.3, d = wg.d - 0.3;
  const alongX = w >= d;
  const cands = alongX ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
  let best = cands[0], bz = -2;
  for (const a of cands) { const ry = f.rotY + a; const nz = Math.cos(ry); if (nz > bz) { bz = nz; best = a; } }   // world +z = south
  return { BF: HF.sub(0, 0, 0, best), Lw: alongX ? w : d, D: alongX ? d : w, HF };
}

export function buildApartmentBlock(H, lot, lod, r, T, wing = null) {
  const { M } = H;
  const bf = blockFrame(H, lot, wing);
  if (bf.Lw < 8 || bf.D < 5.5) return false;
  // [v4:town-accuracy] the stair tower stands inside the footprint at one end (it stood 2.7 m outside it)
  const sx = r() < 0.5 ? 1 : -1;
  const BF = bf.BF.sub(-sx * 1.4, 0, 0, 0), Lw = bf.Lw - 2.8, D = bf.D;
  const n = Math.max(3, Math.min(14, lot.storeys));
  const FH = 2.9;
  const { gmin, gmax } = groundRange(H, BF, Lw, D);
  const fy = gmax + 0.25, top = fy + n * FH;
  const corridor = D >= 8.5;
  const bd = D - 1.25 - (corridor ? 1.2 : 0), bz = (corridor ? 1.2 : 0) / 2 - 1.25 / 2;     // body depth + centre z
  const zFront = bz + bd / 2, zBack = bz - bd / 2;
  const body = pick(r, BODY), accent = pick(r, ACCENT), rail = r() < 0.5 ? '#f1eee6' : '#dfe3e6';
  const S = { rng: r, frameColor: '#8e949b', sillColor: '#8e949b', trim: '#e9e6df', roof: { mat: 'metal', color: '#7b8691' }, interiors: null, shutterClosed: 0.02, shutterStyle: 'none', hoods: false, traditional: false, floorY: fy, fh: FH, lod };
  // plinth + body + parapet
  BF.boxB(M.concrete, '#bdbcb5', Lw + 0.1, fy - gmin + 0.3, D + 0.1, 0, gmin - 0.3, 0, { uv: { world: 2 } });
  BF.boxB(M.tile, body, Lw, n * FH, bd, 0, fy, bz, { uv: { world: 0.96 } });
  BF.boxB(M.plain, body, Lw + 0.1, 0.9, bd + 0.1, 0, top, bz);
  // [v5] the roof deck sits ON the parapet box (it was at top + 0.6, inside it, so no roof colour showed): the measured colour
  BF.boxB(M.plain, flatRoofOf(lot), Lw - 0.3, 0.05, bd - 0.3, 0, top + 0.9, bz);
  // accent stripe on the end walls (vertical) + the building name
  for (const sx of [-1, 1]) BF.boxB(M.plain, accent, 0.06, n * FH * 0.8, 1.2, sx * (Lw / 2 + 0.03), fy + n * FH * 0.1, bz);
  const real = T.real?.get(lot);   // [v4:town-accuracy] the real building name (OSM), on a board over the entrance
  if (real) { const bw = Math.min(Lw - 1, 0.6 * [...real.name].length + 0.8, 8), bh = bw / real.aspect * 1.2; BF.boxB(M.plain, real.colors[0], bw + 0.12, bh + 0.12, 0.06, 0, fy + 3.1 - 0.06, zFront + 1.3); H.card(BF.sub(0, 0, zFront + 1.335, 0), real.mat, real.rect, 0, fy + 3.1 + bh / 2, 0, bw, bh); }
  else if (T.names && lod >= 1) { const k = Math.abs(lot.seed) % OFFICES.length; H.card(BF.sub(Lw / 2 + 0.05, 0, bz + bd / 4, Math.PI / 2), T.nameMat, T.names.rect(k), 0, fy + n * FH * 0.55, 0.02, 0.8, 3.2); }
  const units = Math.max(1, Math.round(Lw / 3.8)), uw = Lw / units;
  const FF = BF.sub(0, 0, zFront, 0);                 // front face frame (+z out)
  const BK = BF.sub(0, 0, zBack, Math.PI);            // back face frame
  for (let f = 0; f < n; f++) {
    const y0 = fy + f * FH;
    // --- balconies (f >= 1); 1F gets small terraces behind a low wall
    if (f >= 1) {
      BF.box(M.plain, '#dcd8ce', Lw, 0.16, 1.25, 0, y0 - 0.08, zFront + 0.625);
      BF.boxB(M.plain, rail, Lw, 1.05, 0.1, 0, y0, zFront + 1.2);
      BF.box(M.plain, '#aeb4ba', Lw, 0.05, 0.12, 0, y0 + 1.07, zFront + 1.2);
    } else BF.boxB(M.block, '#c9c5bb', Lw, 0.9, 0.15, 0, gmin - 0.2, zFront + 1.2 + (fy - gmin) * 0, { uv: { world: 1.6 } });
    for (let u = 0; u <= units; u++) BF.boxB(M.plain, '#efece4', 0.05, FH - 0.2, 1.2, -Lw / 2 + u * uw, y0, zFront + 0.6);
    for (let u = 0; u < units; u++) {
      const cu = -Lw / 2 + (u + 0.5) * uw;
      if (lod >= 1) buildWindow(H, FF, cu, y0 + 0.08, Math.min(2.4, uw - 1.2), 2.0, 'big', S, r, 0, 'front', f);
      else FF.box(M.glass, null, Math.min(2.4, uw - 1.2), 2.0, 0.02, cu, y0 + 1.08, 0.02, { shadow: false, noOutline: true });
      if (f >= 1 && lod >= 1) {
        if (r() < 0.4) H.laundry.line(FF, cu - uw / 2 + 0.4, cu + uw / 2 - 0.4, y0 + 1.75, 0.75, r, pick(r, ['balcony', 'family', 'sheets']));
        if (r() < 0.55) FF.boxB(M.plain, '#e6e6e2', 0.78, 0.58, 0.28, cu + uw / 2 - 0.65, y0 + 0.02, 0.35);   // AC unit
        if (r() < 0.12) H.props.futon?.(FF, cu, y0 + 1.1, 1.2, r);
      }
    }
    // --- back: open corridor with steel doors
    if (corridor) {
      if (f >= 1) { BF.box(M.plain, '#dcd8ce', Lw, 0.16, 1.2, 0, y0 - 0.08, zBack - 0.6); BF.boxB(M.plain, rail, Lw, 1.05, 0.1, 0, y0, zBack - 1.15); }
      for (let u = 0; u < units; u++) {
        const cu = -Lw / 2 + (u + 0.5) * uw;
        BK.box(M.plain, pick(r, ['#5d6f86', '#6b5a4c', '#4f6f8f', '#8e949b']), 0.85, 2.0, 0.06, cu - uw * 0.2, y0 + 1.0, 0.03);
        if (lod >= 1) { BK.box(M.frost ?? M.glass, null, 0.7, 0.5, 0.02, cu + uw * 0.2, y0 + 1.6, 0.02, { shadow: false }); BK.box(M.plain, '#aeb4ba', 0.3, 0.4, 0.12, cu + uw * 0.2 + 0.55, y0 + 1.2, 0.06); }
      }
    } else {
      for (let u = 0; u < units; u++) if (lod >= 1) buildWindow(H, BK, -Lw / 2 + (u + 0.5) * uw, y0 + 1.0, 1.2, 1.0, 'small', S, r, 0, 'back', f);
    }
  }
  // stair tower + elevator
  const stX = sx * (Lw / 2 + 1.35);
  const sgy = H.gy(BF, stX, bz);
  BF.boxB(M.tile, body, 2.7, top + 1.4 - sgy, 3.6, stX, sgy, bz, { uv: { world: 0.96 } });
  for (let f = 0; f < n; f++) BF.box(M.frost ?? M.glass, null, 0.02, 1.2, 0.6, stX + sx * 1.36, fy + f * FH + 1.6, bz, { shadow: false });
  if (n >= 5) { const ex = stX, ez = bz - 1.2; const egy = H.gy(BF, ex, ez); BF.boxB(M.plain, accent, 2.1, top + 2.2 - egy, 2.3, ex, egy, ez); }   // [v4:town-accuracy] the lift shaft rises out of the stair tower
  // entrance canopy + glass doors at the stair end
  BF.box(M.plain, '#e2ddd2', 3.2, 0.18, 2.0, stX - sx * 0.2, fy + 2.65, zFront + 1.0);
  BF.box(M.glass, null, 1.8, 2.3, 0.02, stX, fy + 1.15, bz + 1.81, { shadow: false, noOutline: true });
  // roof: water tank on a stand, machine room, antenna
  const tx = -sx * (Lw / 4);
  BF.boxB(M.plain, '#c9c7c0', 3.0, 2.4, 3.0, tx, top + 0.05, bz);
  for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) BF.boxB(M.plain, '#8e949b', 0.12, 1.4, 0.12, tx + 4 + q[0] * 0.9, top + 0.05, bz + q[1] * 0.9);
  BF.boxB(M.plain, '#d9dcdc', 2.3, 1.6, 2.3, tx + 4, top + 1.45, bz);
  BF.cyl(M.plain, '#8e949b', 0.03, 3.5, tx - 2.4, top + 1.8, bz, { seg: 5 });
  H.col(BF, 0, bz, Lw, bd, 0, gmin - 1, top + 2);
  H.col(BF, stX, bz, 2.7, 3.6, 0, gmin - 1, top + 2);
  T.out.bigBuildings.push({ id: lot.id, kind: 'apartment', floors: n });
  return true;
}

export function buildOfficeBlock(H, lot, lod, r, T, wing = null) {
  const { M } = H;
  const { BF, Lw, D } = blockFrame(H, lot, wing);
  if (Lw < 6 || D < 5) return false;
  const n = Math.max(2, Math.min(12, lot.storeys));
  const FH = 3.4;
  const { gmin, gmax } = groundRange(H, BF, Lw, D);
  const fy = gmax + 0.2, top = fy + n * FH;
  const body = pick(r, ['#e3dccd', '#d6d8d4', '#cfc8bc', '#e6e1d6', '#c9cfd3']), span = pick(r, ['#8a8f96', '#6d7680', '#b8b2a6', '#5d6f86', '#9a8c7c']);
  const glassTint = pick(r, ['#7d97b5', '#86a0bd', '#6f8aa6']);
  const win = lights(H.ctx).windowMaterial({ kind: lot.kind === 'public' ? 'public' : 'office', tint: glassTint });
  BF.boxB(M.concrete, '#bdbcb5', Lw + 0.1, fy - gmin + 0.3, D + 0.1, 0, gmin - 0.3, 0, { uv: { world: 2 } });
  BF.boxB(M.tile, body, Lw, n * FH + 0.9, D, 0, fy, 0, { uv: { world: 0.96 } });
  // ribbon windows on all four faces, per pane quads (life's window material wants uv 0..1 per pane)
  const faces = [[0, D / 2, 0, Lw], [0, -D / 2, Math.PI, Lw], [Lw / 2, 0, Math.PI / 2, D], [-Lw / 2, 0, -Math.PI / 2, D]];
  for (const [fx, fz, ry, len] of faces) {
    const FF = BF.sub(fx, 0, fz, ry);
    const panes = Math.max(1, Math.round((len - 1) / 1.8)), pw = (len - 1) / panes;
    for (let f = 0; f < n; f++) {
      const y0 = fy + f * FH;
      if (f === 0 && fz > 0) continue;   // ground floor front: the entrance
      FF.box(M.plain, span, len + 0.06, 0.95, 0.06, 0, y0 + 0.48, 0.03);
      for (let p = 0; p < panes; p++) {
        const cu = -len / 2 + 0.5 + (p + 0.5) * pw;
        H.quads(FF, win, '#ffffff', [{ p: [[cu - pw / 2 + 0.05, y0 + 1.0, 0.02], [cu + pw / 2 - 0.05, y0 + 1.0, 0.02], [cu + pw / 2 - 0.05, y0 + FH - 0.25, 0.02], [cu - pw / 2 + 0.05, y0 + FH - 0.25, 0.02]], n: [0, 0, 1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }], { shadow: false, noOutline: true });
        if (lod >= 1) FF.box(M.plain, '#aeb4ba', 0.06, FH - 1.2, 0.08, cu - pw / 2, y0 + 1.0 + (FH - 1.25) / 2, 0.05);
      }
    }
  }
  // entrance: glass wall + canopy
  const FFr = BF.sub(0, 0, D / 2, 0);
  { const real = T.real?.get(lot);   // [v4:town-accuracy] the real name (OSM / GSI 注記) over the entrance canopy
    if (real) { const bw = Math.min(Lw - 1, 0.6 * [...real.name].length + 0.8, 10), bh = bw / real.aspect * 1.2; FFr.boxB(M.plain, real.colors[0], bw + 0.12, bh + 0.12, 0.06, 0, fy + 3.25, 0.04); H.card(FFr, real.mat, real.rect, 0, fy + 3.31 + bh / 2, 0.075, bw, bh); } }
  FFr.box(M.glass, null, Math.min(Lw - 1, 8), 2.8, 0.02, 0, fy + 1.4, 0.02, { shadow: false, noOutline: true });
  FFr.box(M.plain, '#dcd8ce', Math.min(Lw - 0.5, 9), 0.25, 2.2, 0, fy + 3.0, 1.1);
  FFr.box(H.ctx.mat.emissive('#ffd9a0', 1.1), null, 1.6, 0.03, 0.4, 0, fy + 2.86, 1.2, { shadow: false });
  // roof plant + parapet
  // [v5] the body box rises to top + 0.9: the deck goes on it (at top + 0.4 it was hidden inside the body)
  BF.boxB(M.plain, flatRoofOf(lot), Lw - 0.4, 0.05, D - 0.4, 0, top + 0.9, 0);
  const nu = 1 + Math.floor(Lw * D / 250);
  for (let k = 0; k < Math.min(5, nu); k++) BF.boxB(M.plain, pick(r, ['#c9cdd0', '#d9dcdc', '#aeb4ba']), 1.6 + r() * 2, 1.0 + r() * 1.2, 1.2 + r() * 1.5, (r() - 0.5) * (Lw - 4), top + 0.95, (r() - 0.5) * (D - 4));
  H.col(BF, 0, 0, Lw, D, 0, gmin - 1, top + 2);
  T.out.bigBuildings.push({ id: lot.id, kind: lot.kind, floors: n });
  return true;
}
