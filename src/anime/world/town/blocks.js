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

// [v6:c6] Rooftop signs of schools, read from the author's photos (a school without an entry carries its name, after the
// corporate prefix, on its street face). 晃陽学園 気仙沼リアス調理製菓専門学校 (IMG_0822, 2026-10-01): the set-back top
// storey is clad in navy; its street (ENE) face carries the round crest and 「気仙沼リアス調理製菓専門学校」 in white, and
// its south face the white script 'Koyo gakuen'.
const SCHOOL_SIGNS = {
  '16/58540/25068/332': { main: '気仙沼リアス調理製菓専門学校', side: 'Koyo gakuen', crest: true },
};
const SCHOOL_NAVY = '#2e3a5c';
function schoolSigns(lot) {
  const s = SCHOOL_SIGNS[lot.id];
  if (s) return s;
  const name = (lot.name || '').trim();
  if (!name) return null;
  const parts = name.split(/\s+/);
  return { main: parts[parts.length - 1], side: null, crest: false };
}
/** [v6:c6] The white-on-navy signs of one school in one 512 x 128 texture (canvas budget): the street-face sign in the top
 *  512 x 64 row (with the round crest at its left when `crest`), the side sign (a serif italic script) in the bottom row.
 *  -> { mat, main: uv rect, side: uv rect } */
function schoolSignMat(ctx, key, SG) {
  const T = ctx.tex, F = T.FONTS;
  const tex = T.draw(512, 128, (g) => {
    g.fillStyle = SCHOOL_NAVY; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (SG.main) {
      let x0 = 10;
      if (SG.crest) {
        g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(34, 32, 22, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(34, 32, 22, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#6a4a2a'; for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.arc(34 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 4, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffffff'; x0 = 66;
      }
      T.fitText(g, SG.main, (x0 + 502) / 2, 34, 502 - x0, 42, F.sans, 800);
    }
    if (SG.side) {   // a serif italic script (the style goes before the weight in a CSS font, so fitText cannot set it)
      let size = 42; g.font = `italic 500 ${size}px ${F.serif}`;
      const w = g.measureText(SG.side).width || 1; if (w > 492) { size = Math.floor(size * 492 / w); g.font = `italic 500 ${size}px ${F.serif}`; }
      g.fillText(SG.side, 256, 98);
    }
  }, { key: 'town-school-sign-' + key, anisotropy: 8 });
  return { mat: ctx.mat.toon('#ffffff', { map: tex, paint: 0.01 }), main: [0, 0.5, 1, 1], side: [0, 0, 1, 0.5] };
}

export function buildOfficeBlock(H, lot, lod, r, T, wing = null) {
  const { M } = H;
  const { BF, Lw, D } = blockFrame(H, lot, wing);
  if (Lw < 6 || D < 5) return false;
  const n = Math.max(2, Math.min(12, lot.storeys));
  const FH = 3.4;
  const { gmin, gmax } = groundRange(H, BF, Lw, D);
  const fy = gmax + 0.2, top = fy + n * FH;
  const body0 = pick(r, ['#e3dccd', '#d6d8d4', '#cfc8bc', '#e6e1d6', '#c9cfd3']), span = pick(r, ['#8a8f96', '#6d7680', '#b8b2a6', '#5d6f86', '#9a8c7c']);
  // [v6:c6] a wall colour from an override (read from a photo) is the body colour
  const body = lot.src?.wall === 'override' && lot.wall ? lot.wall : body0;
  // [v6:c6] a facade style other than office (an override's `facade`): punched windows in groups of panes with wall
  // between them, no spandrel band; a school gets a set-back top storey clad in navy with its name (schoolSigns)
  const punched = !!lot.facade && lot.facade !== 'office';
  const school = lot.kind === 'school' && n >= 3;
  const nb = school ? n - 1 : n;                         // storeys of the main body
  const topB = fy + nb * FH;
  const glassTint = pick(r, ['#7d97b5', '#86a0bd', '#6f8aa6']);
  const win = lights(H.ctx).windowMaterial({ kind: lot.kind === 'public' ? 'public' : 'office', tint: glassTint });
  BF.boxB(M.concrete, '#bdbcb5', Lw + 0.1, fy - gmin + 0.3, D + 0.1, 0, gmin - 0.3, 0, { uv: { world: 2 } });
  BF.boxB(M.tile, body, Lw, nb * FH + (school ? 0.45 : 0.9), D, 0, fy, 0, { uv: { world: 0.96 } });
  // ribbon windows on all four faces, per pane quads (life's window material wants uv 0..1 per pane)
  const faces = [[0, D / 2, 0, Lw], [0, -D / 2, Math.PI, Lw], [Lw / 2, 0, Math.PI / 2, D], [-Lw / 2, 0, -Math.PI / 2, D]];
  const pane = (FF, x0, x1, y0, y1) => H.quads(FF, win, '#ffffff', [{ p: [[x0, y0, 0.02], [x1, y0, 0.02], [x1, y1, 0.02], [x0, y1, 0.02]], n: [0, 0, 1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }], { shadow: false, noOutline: true });
  for (const [fx, fz, ry, len] of faces) {
    const FF = BF.sub(fx, 0, fz, ry);
    if (punched) {
      // groups of three 0.85 m panes (grey frames and mullions), about 5 m apart, sill 0.9 m, head 2.4 m
      const gw = 3 * 0.85, groups = Math.max(1, Math.floor((len - 1.5) / 5)), pitch = (len - 1.5) / groups;
      for (let f = 0; f < nb; f++) {
        const y0 = fy + f * FH;
        if (f === 0 && fz > 0) continue;   // ground floor front: the entrance
        for (let k = 0; k < groups; k++) {
          const gc = -len / 2 + 0.75 + (k + 0.5) * pitch;
          FF.box(M.plain, '#9aa0a6', gw + 0.16, 1.66, 0.024, gc, y0 + 0.82 + 0.83, 0);
          for (let p = 0; p < 3; p++) { const x0 = gc - gw / 2 + p * 0.85; pane(FF, x0 + 0.05, x0 + 0.8, y0 + 0.9, y0 + 2.4); }
          if (lod >= 1) FF.box(M.plain, '#e2e2de', gw + 0.3, 0.08, 0.14, gc, y0 + 0.82, 0.07);   // sill
        }
      }
      continue;
    }
    const panes = Math.max(1, Math.round((len - 1) / 1.8)), pw = (len - 1) / panes;
    for (let f = 0; f < n; f++) {
      const y0 = fy + f * FH;
      if (f === 0 && fz > 0) continue;   // ground floor front: the entrance
      FF.box(M.plain, span, len + 0.06, 0.95, 0.06, 0, y0 + 0.48, 0.03);
      for (let p = 0; p < panes; p++) {
        const cu = -len / 2 + 0.5 + (p + 0.5) * pw;
        pane(FF, cu - pw / 2 + 0.05, cu + pw / 2 - 0.05, y0 + 1.0, y0 + FH - 0.25);
        if (lod >= 1) FF.box(M.plain, '#aeb4ba', 0.06, FH - 1.2, 0.08, cu - pw / 2, y0 + 1.0 + (FH - 1.25) / 2, 0.05);
      }
    }
  }
  if (school) {
    // light-grey metal eave line round the main body (IMG_0822), its roof deck, and the set-back top storey: a pale
    // lower band, then navy cladding to the parapet
    BF.boxB(M.plain, '#b9bec2', Lw + 0.5, 0.35, D + 0.5, 0, topB + 0.1, 0);
    BF.boxB(M.plain, flatRoofOf(lot), Lw - 0.2, 0.05, D - 0.2, 0, topB + 0.45, 0);
    const sb = Math.min(2.5, Math.min(Lw, D) * 0.12), tw = Lw - 2 * sb, td = D - 2 * sb, y1 = topB + 0.45;
    BF.boxB(M.tile, '#dfe1e0', tw, 1.2, td, 0, y1, 0, { uv: { world: 0.96 } });
    BF.boxB(M.plain, SCHOOL_NAVY, tw + 0.06, top + 0.9 - (y1 + 1.2), td + 0.06, 0, y1 + 1.2, 0);
    BF.boxB(M.plain, flatRoofOf(lot), tw - 0.3, 0.05, td - 0.3, 0, top + 0.9, 0);
    // the sign faces: the one facing the lot's street, and the more southern of its neighbours
    const tf = [[0, td / 2, 0, tw], [tw / 2, 0, Math.PI / 2, td], [0, -td / 2, Math.PI, tw], [-tw / 2, 0, -Math.PI / 2, td]].map(([fx, fz, ry, len]) => {
      const F2 = BF.sub(fx, 0, fz, ry), o = F2.w(0, 0, 0), q = F2.w(0, 0, 1);
      return { F2, len, nx: q.x - o.x, nz: q.z - o.z, x: o.x, z: o.z };
    });
    const fr = lot.front ? [lot.front.x - lot.obb.cx, lot.front.z - lot.obb.cz] : [0, 1];
    let mi = 0; tf.forEach((f, i) => { if (f.nx * fr[0] + f.nz * fr[1] > tf[mi].nx * fr[0] + tf[mi].nz * fr[1]) mi = i; });
    const si = tf[(mi + 1) % 4].nz > tf[(mi + 3) % 4].nz ? (mi + 1) % 4 : (mi + 3) % 4;
    const SG = schoolSigns(lot), bandH = top + 0.9 - (y1 + 1.2), bandY = y1 + 1.2 + bandH / 2;
    if (SG) {
      const SM = schoolSignMat(H.ctx, lot.id, SG);
      const put = (f, rect, cwWant) => { const ch = Math.min(bandH * 0.8, Math.min(f.len - 1, cwWant) / 8); H.card(f.F2, SM.mat, rect, 0, bandY, 0.06, ch * 8, ch); };
      if (SG.main) put(tf[mi], SM.main, 0.95 * [...SG.main].length + (SG.crest ? 1.6 : 0.6));
      if (SG.side) put(tf[si], SM.side, 0.6 * [...SG.side].length + 0.6);
    }
    // the footprint's other wings (hero.js hands them to the simplified builder, which would raise them to the full
    // height with the top storey): the same white two-storey body, eave line and punched windows on their outer faces
    const ax = wing ? T.annex?.get(lot.id) : null;
    if (ax) {
      const f = H.L.lotFrame(lot), F = H.Frame.at(H.gb, f.x, f.y, f.z, f.rotY);
      const others = ax.rects.filter((q) => q !== wing);
      const inside = (x, z) => ax.rects.some((q) => Math.abs(x - q.cx) < q.w / 2 - 0.05 && Math.abs(z - q.cz) < q.d / 2 - 0.05);
      for (const q of others) {
        if (q.w < 1.2 || q.d < 1.2) continue;
        const WF = F.sub(q.cx, 0, -lot.obb.d / 2 + q.cz, 0);
        const g = groundRange(H, WF, q.w, q.d);
        WF.boxB(M.concrete, '#bdbcb5', q.w + 0.1, fy - g.gmin + 0.3, q.d + 0.1, 0, g.gmin - 0.3, 0, { uv: { world: 2 } });
        WF.boxB(M.tile, body, q.w, topB + 0.45 - fy, q.d, 0, fy, 0, { uv: { world: 0.96 } });
        WF.boxB(M.plain, '#b9bec2', q.w + 0.5, 0.35, q.d + 0.5, 0, topB + 0.1, 0);
        WF.boxB(M.plain, flatRoofOf(lot), q.w - 0.2, 0.05, q.d - 0.2, 0, topB + 0.45, 0);
        for (const [fx, fz, ry, len] of [[0, q.d / 2, 0, q.w], [0, -q.d / 2, Math.PI, q.w], [q.w / 2, 0, Math.PI / 2, q.d], [-q.w / 2, 0, -Math.PI / 2, q.d]]) {
          if (len < 4 || inside(q.cx + fx + Math.sign(fx) * 0.4, q.cz + fz + Math.sign(fz) * 0.4)) continue;   // a face against another wing
          const FF = WF.sub(fx, 0, fz, ry), gw = 3 * 0.85, groups = Math.max(1, Math.floor((len - 1.5) / 5)), pitch = (len - 1.5) / groups;
          for (let fl = 0; fl < nb; fl++) for (let k = 0; k < groups; k++) {
            const y0 = fy + fl * FH, gc = -len / 2 + 0.75 + (k + 0.5) * pitch;
            FF.box(M.plain, '#9aa0a6', gw + 0.16, 1.66, 0.024, gc, y0 + 1.65, 0);
            for (let p = 0; p < 3; p++) { const x0 = gc - gw / 2 + p * 0.85; pane(FF, x0 + 0.05, x0 + 0.8, y0 + 0.9, y0 + 2.4); }
          }
        }
        H.col(WF, 0, 0, q.w, q.d, 0, g.gmin - 1, topB + 1);
      }
      T.annex.delete(lot.id);
    }
  }
  // entrance: glass wall + canopy
  const FFr = BF.sub(0, 0, D / 2, 0);
  { const real = school ? null : T.real?.get(lot);   // [v4:town-accuracy] the real name (OSM / GSI 注記) over the entrance canopy ([v6:c6] a school's is on its top storey)
    if (real) { const bw = Math.min(Lw - 1, 0.6 * [...real.name].length + 0.8, 10), bh = bw / real.aspect * 1.2; FFr.boxB(M.plain, real.colors[0], bw + 0.12, bh + 0.12, 0.06, 0, fy + 3.25, 0.04); H.card(FFr, real.mat, real.rect, 0, fy + 3.31 + bh / 2, 0.075, bw, bh); } }
  FFr.box(M.glass, null, Math.min(Lw - 1, 8), 2.8, 0.02, 0, fy + 1.4, 0.02, { shadow: false, noOutline: true });
  FFr.box(M.plain, '#dcd8ce', Math.min(Lw - 0.5, 9), 0.25, 2.2, 0, fy + 3.0, 1.1);
  FFr.box(H.ctx.mat.emissive('#ffd9a0', 1.1), null, 1.6, 0.03, 0.4, 0, fy + 2.86, 1.2, { shadow: false });
  // roof plant + parapet
  // [v5] the body box rises to top + 0.9: the deck goes on it (at top + 0.4 it was hidden inside the body)
  if (!school) BF.boxB(M.plain, flatRoofOf(lot), Lw - 0.4, 0.05, D - 0.4, 0, top + 0.9, 0);
  const nu = 1 + Math.floor(Lw * D / 250);
  if (!school) for (let k = 0; k < Math.min(5, nu); k++) BF.boxB(M.plain, pick(r, ['#c9cdd0', '#d9dcdc', '#aeb4ba']), 1.6 + r() * 2, 1.0 + r() * 1.2, 1.2 + r() * 1.5, (r() - 0.5) * (Lw - 4), top + 0.95, (r() - 0.5) * (D - 4));
  H.col(BF, 0, 0, Lw, D, 0, gmin - 1, top + 2);
  T.out.bigBuildings.push({ id: lot.id, kind: lot.kind, floors: n });
  return true;
}
