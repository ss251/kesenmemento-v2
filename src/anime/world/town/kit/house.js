// [v3:town] copied from src/anime/world/_houses/house.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Procedural Japanese house (住宅) generator: foundation, walls (1–3 storeys), sliding windows with
// shutters / grilles / hoods / curtains, entrance (door, porch, canopy, lamp, nameplate, intercom),
// balcony with laundry, kawara or metal roofs (hip / gable / shed / pent skirts) with ridges, fascia,
// soffits, gutters and downpipes, plus wall-mounted utilities (AC units, meters, water heater, vents)
// and roof antennas. Everything is appended to the module's GeoBatch through a Frame.
import { slab, poly } from './gb.js';

export const WALLS = { plaster: ['plaster', 3], paint: ['plaster', 3], siding: ['siding', 1.2], tile: ['tile', 0.96], wood: ['wood', 1.2] };
const INTERIORS = ['int_lace', 'int_lace', 'int_curtain_pink', 'int_curtain_green', 'int_curtain_blue', 'int_blind', 'int_blind', 'int_dark', 'int_room', 'int_room'];

export function buildHouse(H, F, S) {
  const { M, A } = H;
  const r = S.rng;
  const lod = S.lod ?? 2;
  const fy = S.floorY, gy = S.groundMin, FH = S.fh;
  const out = { faces: [], vols: [], ridgeY: 0, doorWorld: null, porch: null };

  // ------------------------------------------------------------ volumes
  const vols = [{ id: 'main', cx: 0, cz: 0, w: S.w, d: S.d, floors: S.floors }];
  if (S.wing) vols.push({ id: 'wing', ...S.wing, floors: S.wing.floors || 1 });
  out.vols = vols;
  for (const v of vols) v.top = fy + v.floors * FH;

  // ------------------------------------------------------------ foundation, walls, belts
  for (const v of vols) {
    const fh0 = fy - gy + 0.14;
    F.boxB(M.concrete, S.foundColor, v.w - 0.04, fh0, v.d - 0.04, v.cx, gy - 0.14, v.cz, { uv: { world: 2 } });
    // 水切り flashing between foundation and wall
    F.boxB(M.plainLow, S.flashColor, v.w + 0.035, 0.045, v.d + 0.035, v.cx, fy - 0.03, v.cz);
    const w1 = S.wall, w2 = S.wall2 || S.wall;
    const extra = S.roof.type === 'flat' ? 0.9 : 0;
    if (S.shop && v.id === 'main') {
      // [v3:town] shop house: the ground floor is set back by S.shop.depth (the shop room is built by town/shops.js)
      const sd = S.shop.depth, [mk1, s1] = WALLS[w1.kind], [mk2, s2] = WALLS[w2.kind];
      F.boxB(M[mk1], w1.color, v.w, FH + 0.02 + (v.floors === 1 ? extra : 0), v.d - sd, v.cx, fy - 0.02, v.cz - sd / 2, { uv: { world: s1 } });
      if (v.floors > 1) F.boxB(M[mk2], w2.color, v.w, (v.floors - 1) * FH + extra, v.d, v.cx, fy + FH, v.cz, { uv: { world: s2 } });
    } else if (v.floors === 1 || !S.wall2) {
      const [mk, s] = WALLS[w1.kind];
      F.boxB(M[mk], w1.color, v.w, v.floors * FH + 0.02 + extra, v.d, v.cx, fy - 0.02, v.cz, { uv: { world: s } });
    } else {
      const [mk1, s1] = WALLS[w1.kind], [mk2, s2] = WALLS[w2.kind];
      F.boxB(M[mk1], w1.color, v.w, FH + 0.02, v.d, v.cx, fy - 0.02, v.cz, { uv: { world: s1 } });
      F.boxB(M[mk2], w2.color, v.w, (v.floors - 1) * FH + extra, v.d, v.cx, fy + FH, v.cz, { uv: { world: s2 } });
    }
    // belt (幕板) at upper floor levels
    if (S.belt && v.floors > 1) for (let f = 1; f < v.floors; f++) F.boxB(M.plain, S.trim, v.w + 0.05, 0.14, v.d + 0.05, v.cx, fy + f * FH - 0.07, v.cz);
    // corner trims for siding / wood houses
    if (lod >= 1 && (w1.kind === 'siding' || w2.kind === 'siding') && S.cornerTrim) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.boxB(M.plain, S.trim, 0.09, v.floors * FH, 0.09, v.cx + sx * (v.w / 2 - 0.03), fy, v.cz + sz * (v.d / 2 - 0.03));
    }
    H.col(F, v.cx, v.cz, v.w + 0.05, v.d + 0.05, 0, gy - 1, v.top + 3);
  }

  // ------------------------------------------------------------ faces + occlusion
  const faces = [];
  for (const v of vols) {
    const defs = [
      { side: 'front', x: v.cx, z: v.cz + v.d / 2, ry: 0, len: v.w },
      { side: 'back', x: v.cx, z: v.cz - v.d / 2, ry: Math.PI, len: v.w },
      { side: 'right', x: v.cx + v.w / 2, z: v.cz, ry: Math.PI / 2, len: v.d },
      { side: 'left', x: v.cx - v.w / 2, z: v.cz, ry: -Math.PI / 2, len: v.d },
    ];
    for (const d of defs) {
      const fr = F.sub(d.x, 0, d.z, d.ry);
      const face = { vol: v, side: d.side, F: fr, len: d.len, ry: d.ry, x: d.x, z: d.z, res: [], floors: v.floors };
      if (S.shop && v.id === 'main' && d.side === 'front') face.res.push([0, -99, 99]);   // [v3:town] shop front
      if (S.shop && v.id === 'main' && (d.side === 'left' || d.side === 'right')) face.res.push([0, d.side === 'left' ? d.len / 2 - S.shop.depth - 0.3 : -d.len / 2 - 1, d.side === 'left' ? d.len / 2 + 1 : -d.len / 2 + S.shop.depth + 0.3]);   // [v3:town]
      // occlusion by other volumes touching this face plane
      for (const o of vols) {
        if (o === v) continue;
        const ox0 = o.cx - o.w / 2, ox1 = o.cx + o.w / 2, oz0 = o.cz - o.d / 2, oz1 = o.cz + o.d / 2;
        let hit = null;
        if (d.side === 'front' && Math.abs(oz0 - d.z) < 0.05) hit = [ox0 - d.x, ox1 - d.x];
        if (d.side === 'back' && Math.abs(oz1 - d.z) < 0.05) hit = [-(ox1 - d.x), -(ox0 - d.x)];
        if (d.side === 'right' && Math.abs(ox0 - d.x) < 0.05) hit = [-(oz1 - d.z), -(oz0 - d.z)];
        if (d.side === 'left' && Math.abs(ox1 - d.x) < 0.05) hit = [oz0 - d.z, oz1 - d.z];
        if (hit) for (let f = 0; f < o.floors; f++) face.res.push([f, hit[0] - 0.25, hit[1] + 0.25]);
        // wing roof rises above its own floors a little: keep windows off the roof line
        if (hit && o.floors < v.floors) face.res.push([o.floors, hit[0] - 0.1, hit[1] + 0.1, 'low']);
      }
      faces.push(face);
    }
  }
  out.faces = faces;
  const faceOf = (vid, side) => faces.find(f => f.vol.id === vid && f.side === side);
  const free = (face, fl, u0, u1) => u0 >= -face.len / 2 + 0.3 && u1 <= face.len / 2 - 0.3 && !face.res.some(q => q[0] === fl && !(u1 < q[1] || u0 > q[2]) && q[3] !== 'low');
  const freeLow = (face, fl, u0, u1) => !face.res.some(q => q[0] === fl && !(u1 < q[1] || u0 > q[2]));
  const reserve = (face, fl, u0, u1) => face.res.push([fl, u0, u1]);
  H.reserve = reserve; H.free = free;

  // ------------------------------------------------------------ entrance (front of main, floor 0)
  const front = faceOf('main', S.door.face || 'front');
  {
    const dw = S.door.style === 'door_slide' ? 1.7 : 0.92;
    const du = S.door.u;
    reserve(front, 0, du - dw / 2 - 0.35, du + dw / 2 + 0.35);
    buildEntrance(H, front, du, dw, S, out);
  }
  // ------------------------------------------------------------ balcony (front, floor 1)
  if (S.balcony && S.floors >= 2) {
    const bf = faceOf('main', S.balcony.face || 'front');
    const b = S.balcony;
    reserve(bf, 1, b.u - b.w / 2 - 0.1, b.u + b.w / 2 + 0.1);
    buildBalcony(H, bf, b, S, out);
  }
  // ------------------------------------------------------------ windows
  for (const face of faces) {
    for (let fl = 0; fl < face.floors; fl++) {
      if (face.vol.id === 'wing' && face.side !== 'front' && face.side !== 'left' && face.side !== 'right') continue;
      placeWindows(H, face, fl, S, r, free, reserve, lod);
    }
  }
  // ------------------------------------------------------------ roofs
  const mainV = vols[0];
  out.ridgeY = buildRoof(H, F, mainV, S.roof, S, out, true);
  if (S.wing) {
    const w = vols[1];
    // pent roof leaning against the main volume (or own hip when free-standing)
    const host = S.wing.attach; // 'front'|'back'|'left'|'right' of main
    const pr = { ...S.roof, type: 'pentWing', pitch: Math.min(S.roof.pitch, 0.38), over: 0.45 };
    buildWingRoof(H, F, w, host, pr, S);
  }
  // 1F skirt roof (下屋 / 庇) along the front of the main volume
  if (S.skirt && S.floors >= 2) {
    const face = faceOf('main', 'front');
    buildPent(H, face.F, -face.len / 2 - 0.25, face.len / 2 + 0.25, fy + FH + 0.12, S.skirt.depth, 0.32, S.roof, S, true);
  }
  // ------------------------------------------------------------ utilities
  buildUtilities(H, faces, S, r, free, reserve, lod, out);
  // ------------------------------------------------------------ antenna / solar
  if (S.antenna && lod >= 1) buildAntenna(H, F, mainV, S, out);
  return out;
}

// =============================================================================================
function placeWindows(H, face, fl, S, r, free, reserve, lod) {
  const fy = S.floorY, FH = S.fh;
  const L = face.len;
  const role = face.side === 'front' ? 'front' : face.side === 'back' ? 'back' : 'side';
  const y0 = fy + fl * FH;
  // candidate types by role
  const types = [];
  if (role === 'front') {
    if (fl === 0) types.push(S.bigFront ? 'big' : 'std', 'std', 'mid');
    else types.push('std', 'mid', 'std');
  } else if (role === 'side') types.push('mid', 'small', 'high', 'slit', 'mid');
  else types.push('small', 'mid', 'std', 'high');
  const DIM = {
    big: [1.69, 1.95, 0.08], std: [1.69, 1.15, 0.85], mid: [1.19, 1.12, 0.88], small: [0.74, 0.9, 1.05], high: [0.6, 0.48, 1.62], slit: [0.36, 1.35, 0.7], bay: [1.69, 1.15, 0.85],
  };
  let u = -L / 2 + 0.45 + r() * 0.4;
  let guard = 0, count = 0;
  const maxN = Math.max(1, Math.floor(L / 2.2));
  while (u < L / 2 - 0.5 && guard++ < 20 && count < maxN) {
    let t = types[Math.floor(r() * types.length)];
    if (fl === 0 && role === 'front' && count === 0 && S.bigFront) t = 'big';
    const [w, h, sill] = DIM[t];
    const u0 = u, u1 = u + w;
    if (u1 > L / 2 - 0.4) { u += 0.4; continue; }
    if (!free(face, fl, u0 - 0.2, u1 + 0.2)) { u += 0.5; continue; }
    const topY = y0 + sill + h;
    if (topY > y0 + FH - 0.25 && !(fl === face.floors - 1)) { u += 0.3; continue; }
    reserve(face, fl, u0 - 0.15, u1 + 0.15);
    let kind = t;
    if (t === 'std' && role === 'front' && fl === 0 && lod >= 2 && r() < 0.18) kind = 'bay';
    buildWindow(H, face.F, (u0 + u1) / 2, y0 + sill, w, h, kind, S, r, lod, role, fl);
    count++;
    u = u1 + 0.6 + r() * (role === 'front' ? 1.0 : 1.6);
  }
}

/** One window unit on a face frame. cu = centre u, yb = bottom y (local). */
export function buildWindow(H, FF, cu, yb, w, h, kind, S, r, lod, role, fl) {
  const { M, A } = H;
  const fc = S.frameColor;
  const frost = kind === 'high' || kind === 'slit' || (kind === 'small' && r() < 0.8) || (role === 'back' && r() < 0.3);
  const cy = yb + h / 2;
  if (kind === 'bay') { // 出窓 bay window
    const pd = 0.42;
    FF.box(M.plain, S.trim, w + 0.24, 0.1, pd + 0.06, cu, yb - 0.05, pd / 2);
    FF.box(M.plain, S.trim, w + 0.3, 0.08, pd + 0.14, cu, yb + h + 0.07, pd / 2 + 0.03);
    FF.box(M.metal, S.roof.mat === 'metal' ? S.roof.color : '#6d737c', w + 0.34, 0.05, pd + 0.2, cu, yb + h + 0.14, pd / 2 + 0.05, { rx: 0.18, uv: { world: 0.9 } });
    for (const s of [-1, 1]) FF.box(M.plain, fc, 0.05, h, pd, cu + s * (w / 2 + 0.07), cy, pd / 2);
    FF.box(M.atlas, '#ffffff', w, h, 0.01, cu, cy, 0.02, { uv: { rect: A.rects[pickInt(r, S)], white: A.white } });
    FF.box(M.plain, fc, 0.05, h, 0.05, cu, cy, pd - 0.02);
    FF.box(M.glass, null, w + 0.1, h, 0.005, cu, cy, pd - 0.035, { shadow: false });
    // side glass
    for (const s of [-1, 1]) FF.box(M.glass, null, 0.005, h, pd - 0.08, cu + s * (w / 2 + 0.06), cy, pd / 2, { shadow: false });
    if (lod >= 2 && r() < 0.7) H.props.sillPot(FF, cu + (r() - 0.5) * w * 0.5, yb + 0.02, pd * 0.6);
    return;
  }
  const deep = 0.065;
  // interior (dark room / curtain) — slightly recessed look
  const louver = frost && (kind === 'small' || kind === 'mid') && r() < 0.4;
  const inter = louver ? 'int_louver' : frost ? 'int_frost' : (S.traditional && r() < 0.5 ? 'int_shoji' : (r() < 0.04 ? 'int_warm' : pickInt(r, S)));
  const shut = !frost && (kind === 'std' || kind === 'big' || kind === 'mid') && r() < (S.shutterClosed ?? 0.08);
  if (!shut) FF.box(M.atlas, '#ffffff', w - 0.04, h - 0.04, 0.01, cu, cy, 0.02, { uv: { rect: A.rects[inter], white: A.white }, skip: 'rltdb' });
  // frame
  const fw = 0.055;
  FF.box(M.plain, fc, w + 0.02, fw, deep, cu, yb + h - fw / 2 + 0.01, deep / 2, { skip: 'btrl' });
  FF.box(M.plain, fc, w + 0.02, fw, deep, cu, yb + fw / 2 - 0.01, deep / 2, { skip: 'bdrl' });
  FF.box(M.plain, fc, fw, h + 0.02, deep, cu - w / 2 + fw / 2 - 0.01, cy, deep / 2, { skip: 'btd' });
  FF.box(M.plain, fc, fw, h + 0.02, deep, cu + w / 2 - fw / 2 + 0.01, cy, deep / 2, { skip: 'btd' });
  if (kind !== 'high' && kind !== 'slit' && w > 0.7 && !louver) FF.box(M.plain, fc, 0.05, h - 0.06, 0.03, cu + 0.012, cy, deep - 0.012, { skip: 'btd' }); // meeting stile
  if (kind === 'big' || kind === 'std') { if (r() < 0.3) FF.box(M.plain, fc, w - 0.08, 0.03, 0.02, cu, yb + h * 0.62, 0.035, { skip: 'brl' }); }
  if (!shut) FF.box(frost && !louver ? M.frost : M.glass, null, w - 0.06, h - 0.06, 0.004, cu, cy, 0.036, { shadow: false, skip: 'rltdb' });
  else FF.box(M.shutter, S.shutterColor, w - 0.04, h - 0.04, 0.02, cu, cy, 0.03, { uv: { world: 0.5 }, skip: 'rltdb' });
  // sill (水切り)
  FF.box(M.plain, S.sillColor || fc, w + 0.1, 0.03, 0.1, cu, yb - 0.02, 0.05, { skip: 'b' });
  // shutter box (戸袋) or roll-shutter box
  const bigish = kind === 'std' || kind === 'big' || kind === 'mid';
  const sb = S.shutterStyle;
  if (bigish && sb === 'tobukuro' && lod >= 1) {
    const side = (cu > 0 ? 1 : -1) * (r() < 0.8 ? 1 : -1);
    const tw = w / 2 + 0.04;
    FF.box(M.shutter, S.shutterColor, tw, h + 0.12, 0.13, cu + side * (w / 2 + tw / 2), cy + 0.02, 0.065, { uv: { world: 0.5 }, skip: 'b' });
    FF.box(M.plain, S.shutterColor, w + tw + 0.04, 0.05, 0.14, cu + side * tw / 2, yb + h + 0.09, 0.07, { skip: 'b' });
  } else if (bigish && sb === 'roll' && lod >= 1) {
    FF.box(M.plain, S.shutterColor, w + 0.12, 0.26, 0.24, cu, yb + h + 0.14, 0.12, { skip: 'b' });
    for (const s of [-1, 1]) FF.box(M.plain, S.shutterColor, 0.05, h, 0.07, cu + s * (w / 2 + 0.035), cy, 0.035, { skip: 'btd' });
  }
  // hood (霧除け庇) over windows on traditional / older houses
  if (S.hoods && bigish && lod >= 1 && !(sb === 'roll')) {
    FF.box(M.metal, S.hoodColor, w + (sb === 'tobukuro' ? w / 2 + 0.3 : 0.3), 0.045, 0.42, cu + (sb === 'tobukuro' ? ((cu > 0 ? 1 : -1) * w / 4) : 0), yb + h + 0.22, 0.2, { rx: 0.22, uv: { world: 0.9 } });
  }
  // grille (面格子) on small frosted windows
  if (frost && (kind === 'small' || kind === 'mid') && lod >= 1 && r() < 0.75) {
    const n = Math.max(3, Math.round(w / 0.12));
    for (let i = 0; i <= n; i++) FF.box(M.plain, S.grilleColor, 0.022, h + 0.06, 0.03, cu - w / 2 + i * w / n, cy, 0.1, { skip: 'btdb' });
    FF.box(M.plain, S.grilleColor, w + 0.06, 0.035, 0.05, cu, yb + h + 0.03, 0.09);
    FF.box(M.plain, S.grilleColor, w + 0.06, 0.035, 0.05, cu, yb - 0.02, 0.09);
  }
  // window railing (窓手すり) on upper floor big windows without balcony
  if (fl >= 1 && kind === 'big') {
    FF.box(M.plain, S.frameColor, w + 0.1, 0.04, 0.05, cu, yb + 0.95, 0.24);
    for (let i = 0; i <= 10; i++) FF.box(M.plain, S.frameColor, 0.02, 0.9, 0.02, cu - w / 2 + i * w / 10, yb + 0.5, 0.24, { skip: 'td' });
    for (const s of [-1, 1]) FF.box(M.plain, S.frameColor, 0.04, 0.04, 0.24, cu + s * (w / 2 + 0.03), yb + 0.95, 0.12);
  }
  // rain streak under the sill
  if (lod >= 2 && r() < 0.55) H.decal(FF, 'streak', cu, yb - 0.05 - 0.35, w * 0.9, 0.7, 0.012, '#ffffff');
  // flower pot on some sills
  if (lod >= 2 && role === 'front' && fl === 0 && kind === 'std' && r() < 0.25) H.props.sillPot(FF, cu + (r() - 0.5) * w * 0.4, yb + 0.0, 0.07);
}

function pickInt(r, S) { return (S.interiors || INTERIORS)[Math.floor(r() * (S.interiors || INTERIORS).length)]; }

// =============================================================================================
function buildEntrance(H, face, du, dw, S, out) {
  const { M, A } = H;
  const FF = face.F;
  const r = S.rng;
  const fy = S.floorY, lod = S.lod ?? 2;
  const style = S.door.style;
  const dh = style === 'door_slide' ? 1.95 : 2.05;
  const gFront = S.groundFront ?? 0; // local ground at the face
  // porch (tiled) — top 0.12..0.2 below floor, one or two steps down to the ground
  const pw = dw + 1.1, pd = S.door.porchD || 1.25;
  const porchTop = fy - 0.14;
  const steps = Math.max(1, Math.round((porchTop - gFront) / 0.17));
  FF.boxB(M.tile, S.porchColor, pw, porchTop - gFront + 0.12, pd, du, gFront - 0.12, pd / 2, { uv: { world: 0.96 } });
  // step(s)
  const sh = (porchTop - gFront) / (steps + 1);
  for (let i = 0; i < steps; i++) {
    const sd = 0.3 * (steps - i);
    FF.boxB(M.tile, S.porchColor, pw - 0.2, gFront + sh * (i + 1) - (gFront - 0.1), 0.3, du, gFront - 0.1, pd + sd - 0.15, { uv: { world: 0.96 } });
  }
  // physics: walkable porch & steps
  H.walk(FF, du, pd / 2, pw, pd, 0, porchTop);
  for (let i = 0; i < steps; i++) H.walk(FF, du, pd + 0.3 * (steps - i) - 0.15, pw - 0.2, 0.3, 0, gFront + sh * (i + 1));
  out.porch = { F: FF, u: du, w: pw, d: pd + 0.3 * steps, top: porchTop };
  // door frame + door
  const fr = S.doorFrame || S.frameColor;
  FF.box(M.plain, fr, dw + 0.14, 0.07, 0.09, du, porchTop + dh + 0.035, 0.045);
  for (const s of [-1, 1]) FF.box(M.plain, fr, 0.07, dh, 0.09, du + s * (dw / 2 + 0.035), porchTop + dh / 2, 0.045);
  FF.box(M.atlas, '#ffffff', dw, dh, 0.03, du, porchTop + dh / 2, 0.02, { uv: { rect: A.rects[style], white: A.white } });
  out.doorWorld = FF.w(du, porchTop, 0.6);
  // side light (袖) for single doors
  if (style !== 'door_slide' && r() < 0.5 && lod >= 1) {
    const s = r() < 0.5 ? -1 : 1;
    FF.box(M.frost, null, 0.24, dh - 0.1, 0.004, du + s * (dw / 2 + 0.2), porchTop + dh / 2, 0.03, { shadow: false });
    FF.box(M.plain, fr, 0.05, dh, 0.08, du + s * (dw / 2 + 0.34), porchTop + dh / 2, 0.04);
  }
  // canopy (玄関庇)
  const cT = S.door.canopy || 'slab';
  const cy = porchTop + dh + 0.3;
  if (cT === 'slab') {
    FF.box(M.plain, S.canopyColor, pw + 0.1, 0.12, pd + 0.1, du, cy, (pd + 0.1) / 2);
    FF.box(M.plain, S.soffitColor, pw, 0.02, pd, du, cy - 0.07, pd / 2);
  } else if (cT === 'roof') {
    buildPent(H, FF, du - pw / 2 - 0.15, du + pw / 2 + 0.15, cy + 0.1, pd + 0.15, 0.45, S.roof, S, false);
  } else if (cT === 'posts') {
    FF.box(M.plain, S.canopyColor, pw + 0.3, 0.12, pd + 0.2, du, cy, (pd + 0.2) / 2);
    for (const s of [-1, 1]) FF.boxB(M.plain, S.trim, 0.1, cy - porchTop, 0.1, du + s * (pw / 2 + 0.05), porchTop, pd + 0.05);
  }
  // door lamp (warm)
  const ls = (du > 0 ? -1 : 1);
  const lx = du + ls * (dw / 2 + 0.32);
  // 風鈴 hung under the entrance canopy on some houses (away from the lamp)
  if (lod >= 2 && cT !== 'none' && r() < 0.3) H.laundry.chime(FF, du - ls * (pw / 2 - 0.2), cT === 'roof' ? cy - 0.22 : cy - 0.1, 0.4);
  FF.box(M.plain, '#4b4d52', 0.14, 0.24, 0.12, lx, porchTop + 1.95, 0.08);
  FF.box(M.lamp, null, 0.1, 0.16, 0.02, lx, porchTop + 1.95, 0.145, { shadow: false });
  // intercom + nameplate beside the door (unless the gate pillar carries them)
  if (!S.gatePlate) {
    const ix = du - ls * (dw / 2 + 0.26);
    H.props.plate(FF, ix, porchTop + 1.55, 0.02, S.plate);
    FF.box(M.atlas, '#ffffff', 0.09, 0.15, 0.03, ix, porchTop + 1.25, 0.015, { uv: { rect: A.rects.intercom, white: A.white } });
    if (S.wallMailbox) FF.box(M.atlas, '#ffffff', 0.34, 0.26, 0.1, lx, porchTop + 1.1, 0.05, { uv: { rect: A.rects[S.wallMailbox], white: A.white } });
  }
  // doorstep life: mat, slippers, umbrella stand, parcels, pots, milk box, newspaper
  if (lod >= 1) H.props.doorstep(FF, du, dw, porchTop, pw, pd, S);
}

// =============================================================================================
function buildBalcony(H, face, b, S, out) {
  const { M } = H;
  const FF = face.F;
  const r = S.rng;
  const fy = S.floorY, FH = S.fh;
  const yF = fy + FH; // 2F floor level
  const bw = b.w, bd = b.depth;
  const lod = S.lod ?? 2;
  // tall window (balcony door) behind
  buildWindow(H, FF, b.u, yF + 0.05, Math.min(1.69, bw - 0.6), 1.9, 'big', { ...S, shutterStyle: S.shutterStyle === 'tobukuro' ? 'none' : S.shutterStyle }, r, lod, 'balc', 0);
  // slab
  FF.box(M.plain, S.balconySlab, bw, 0.18, bd, b.u, yF - 0.06, bd / 2);
  FF.box(M.plain, S.soffitColor, bw - 0.06, 0.02, bd - 0.06, b.u, yF - 0.155, bd / 2);
  // railing
  const rh = 1.05;
  if (b.rail === 'panel') {
    const wm = S.wall2 || S.wall;
    FF.boxB(M.plain, S.balconyPanel || wm.color, bw, rh, 0.08, b.u, yF + 0.03, bd - 0.04);
    for (const s of [-1, 1]) FF.boxB(M.plain, S.balconyPanel || wm.color, 0.08, rh, bd - 0.08, b.u + s * (bw / 2 - 0.04), yF + 0.03, (bd - 0.08) / 2);
    FF.box(M.plain, S.trim, bw + 0.04, 0.05, 0.12, b.u, yF + 0.03 + rh + 0.025, bd - 0.04);
    // drain spout
    FF.box(M.plain, '#8f949a', 0.05, 0.05, 0.16, b.u + bw / 2 - 0.3, yF - 0.02, bd + 0.06);
  } else {
    const col = S.railColor;
    FF.box(M.plain, col, bw, 0.05, 0.06, b.u, yF + rh, bd - 0.03);
    FF.box(M.plain, col, bw, 0.04, 0.04, b.u, yF + 0.12, bd - 0.03);
    const n = Math.round(bw / 0.12);
    for (let i = 0; i <= n; i++) FF.box(M.plain, col, 0.022, rh - 0.12, 0.022, b.u - bw / 2 + 0.02 + i * (bw - 0.04) / n, yF + 0.12 + (rh - 0.12) / 2, bd - 0.03);
    for (const s of [-1, 1]) {
      FF.box(M.plain, col, 0.05, 0.05, bd, b.u + s * (bw / 2 - 0.025), yF + rh, bd / 2);
      for (let k = 1; k < 5; k++) FF.box(M.plain, col, 0.022, rh - 0.12, 0.022, b.u + s * (bw / 2 - 0.025), yF + 0.12 + (rh - 0.12) / 2, k * bd / 5 - 0.02);
    }
  }
  // support posts for deep balconies
  if (b.posts) for (const s of [-1, 1]) FF.boxB(M.plain, S.trim, 0.1, yF - 0.15 - (S.groundFront ?? 0) + 0.1, 0.1, b.u + s * (bw / 2 - 0.08), (S.groundFront ?? 0) - 0.1, bd - 0.1);
  // laundry pole (物干し竿) on wall-mounted arms
  const py = yF + 1.75;
  const pz = bd * 0.55;
  for (const s of [-1, 1]) {
    const ax = b.u + s * (bw / 2 - 0.25);
    FF.box(M.plain, '#c9ccd1', 0.04, 0.04, pz + 0.05, ax, py + 0.06, pz / 2);
    FF.box(M.plain, '#c9ccd1', 0.04, 0.3, 0.04, ax, py - 0.07, 0.02);
  }
  const x0 = b.u - bw / 2 + 0.15, x1 = b.u + bw / 2 - 0.15;
  FF.cyl(M.plain, S.poleColor || '#8fb3c9', 0.016, x1 - x0 + 0.3, (x0 + x1) / 2, py + 0.1, pz, { rz: Math.PI / 2, seg: 6 });
  if (b.laundry) H.laundry.line(FF, x0 + 0.1, x1 - 0.1, py + 0.1, pz, r, b.laundryMix);
  // futon over the railing
  if (b.futon && lod >= 1) H.props.futon(FF, b.u + (r() - 0.5) * (bw - 1.6), yF + rh + 0.05, bd - 0.03, r);
  // balcony clutter
  if (lod >= 2) {
    if (r() < 0.6) H.props.acUnit(FF, b.u - bw / 2 + 0.55, yF + 0.03, 0.3, 0);
    if (r() < 0.45) H.props.pot(FF, b.u + bw / 2 - 0.35, yF + 0.03, bd - 0.3, r, 0.7);
    if (b.dish) H.props.dish(FF, b.u + bw / 2 - 0.3, yF + rh - 0.15, bd + 0.05, 0);
    if (b.chime) H.laundry.chime(FF, b.u - bw / 2 + 0.35, yF + 2.25, 0.35);
    if (b.koinobori) H.laundry.koinoboriSmall(FF, b.u + bw / 2 - 0.12, yF + rh, bd - 0.05);
  }
}

// =============================================================================================
//  Roofs
// =============================================================================================
function roofMats(H, R) {
  const { M } = H;
  if (R.mat === 'metal') return { top: M.metal, topS: 0.9, edge: null, ridge: M.plain, t: 0.1 };
  return { top: M.kawara, topS: 1.0, edge: M.kawaraEdge, ridge: M.ridge, t: 0.2 };
}

/** Main roof over a volume. Returns ridge y. */
function buildRoof(H, F, v, R, S, out, isMain) {
  const { M } = H;
  const top = v.top;
  const rm = roofMats(H, R);
  const tv = rm.t, p = R.pitch, o = R.over;
  const col = R.color, ridgeCol = R.ridgeColor || R.color;
  const type = R.type;
  const lod = S.lod ?? 2;
  let W = v.w, D = v.d, cx = v.cx, cz = v.cz;
  // work in a roof frame where the ridge runs along local x
  const alongZ = (type === 'gable' && R.axis === 'z') || (type === 'hip' && D > W);
  const RF = alongZ ? F.sub(cx, 0, cz, Math.PI / 2) : F.sub(cx, 0, cz, 0);
  if (alongZ) { const t = W; W = D; D = t; }
  const og = type === 'gable' ? Math.min(o, 0.42) : o;
  const hx = W / 2 + og, hz = D / 2 + o;
  const yE = top + tv - o * p;
  const uvf = (e, s) => (q) => [q[0] / 1.2 * rm.topS, (s * q[2] - hz) / -1.0 * rm.topS + q[1] * 0.0];
  let ridgeY = top;
  const addPlane = (pts, sgn) => {
    const sl = slab(pts, tv, (q) => { const dist = Math.hypot(hz - sgn * q[2], q[1] - yE); return [q[0] / (1.2 * rm.topS), -Math.abs(hz - sgn * q[2]) * Math.sqrt(1 + p * p) / 1.0]; });
    H.gb.mesh(rm.top, col, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
  };
  const addSidePlane = (pts, sgn) => { // hip ends: channels run along local x
    const sl = slab(pts, tv, (q) => [q[2] / (1.2 * rm.topS), -Math.abs(hx - sgn * q[0]) * Math.sqrt(1 + p * p)]);
    H.gb.mesh(rm.top, col, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
  };
  const trimC = S.fasciaColor, soff = S.soffitColor, gut = S.gutterColor;
  const eaveLine = (x0, x1, z, dir) => { // fascia + soffit + gutter + eave tiles along x at depth z (dir ±1 outward)
    const L = x1 - x0, xm = (x0 + x1) / 2;
    RF.box(M.plain, trimC, L, 0.19, 0.04, xm, yE - tv - 0.05, z - dir * 0.02);
    const sz = (Math.abs(z) - D / 2) - 0.04;
    RF.box(M.plain, soff, L - 0.04, 0.02, sz, xm, yE - tv - 0.12, dir * (D / 2 + sz / 2));
    if (rm.edge && lod >= 1) RF.box(rm.edge, col, L, 0.1, 0.07, xm, yE - 0.05, z - dir * 0.02, { uv: { world: 0.3, worldV: 0.1 } });
    if (S.gutters !== false) RF.box(M.plain, gut, L, 0.09, 0.11, xm, yE - tv - 0.06, z + dir * 0.06);
  };
  const eaveLineZ = (z0, z1, x, dir) => {
    const L = z1 - z0, zm = (z0 + z1) / 2;
    RF.box(M.plain, trimC, 0.04, 0.19, L, x - dir * 0.02, yE - tv - 0.05, zm);
    const sx = (Math.abs(x) - W / 2) - 0.04;
    RF.box(M.plain, soff, sx, 0.02, L - 0.04, dir * (W / 2 + sx / 2), yE - tv - 0.12, zm);
    if (rm.edge && lod >= 1) RF.box(rm.edge, col, 0.07, 0.1, L, x - dir * 0.02, yE - 0.05, zm, { uv: { world: 0.3, worldV: 0.1 } });
    if (S.gutters !== false) RF.box(M.plain, gut, 0.11, 0.09, L, x + dir * 0.06, yE - tv - 0.06, zm);
  };

  if (type === 'hip') {
    const rl = Math.max(0, hx - hz);
    const yR = yE + hz * p; ridgeY = yR;
    addPlane([[-hx, yE, hz], [hx, yE, hz], [rl, yR, 0], [-rl, yR, 0]], 1);
    addPlane([[hx, yE, -hz], [-hx, yE, -hz], [-rl, yR, 0], [rl, yR, 0]], -1);
    addSidePlane([[hx, yE, hz], [hx, yE, -hz], [rl, yR, 0]], 1);
    addSidePlane([[-hx, yE, -hz], [-hx, yE, hz], [-rl, yR, 0]], -1);
    eaveLine(-hx, hx, hz, 1); eaveLine(-hx, hx, -hz, -1);
    eaveLineZ(-hz + 0.05, hz - 0.05, hx, 1); eaveLineZ(-hz + 0.05, hz - 0.05, -hx, -1);
    // ridges
    const rw = rm.edge ? 0.26 : 0.16, rh = rm.edge ? 0.2 : 0.08;
    if (rl > 0.05) RF.beam(rm.ridge, ridgeCol, [-rl - 0.1, yR + rh / 2 - 0.03, 0], [rl + 0.1, yR + rh / 2 - 0.03, 0], rw, rh, { uv: { world: 0.6, worldV: 0.2 } });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) RF.beam(rm.ridge, ridgeCol, [sx * hx, yE + rh / 2 - 0.02, sz * hz], [sx * rl, yR + rh / 2 - 0.03, 0], rw * 0.8, rh * 0.85, { uv: { world: 0.6, worldV: 0.2 } });
    if (rm.edge && rl > 0.05) for (const sx of [-1, 1]) RF.box(M.plain, ridgeCol, 0.12, 0.34, 0.34, sx * (rl + 0.12), yR + 0.14, 0);
    // downpipes at two corners
    downpipe(H, RF, hx - 0.1, hz + 0.06, W / 2, D / 2, yE - tv - 0.06, S, 1);
    downpipe(H, RF, -hx + 0.1, -hz - 0.06, -W / 2, -D / 2, yE - tv - 0.06, S, -1);
  } else if (type === 'gable') {
    const yR = yE + hz * p; ridgeY = yR;
    addPlane([[-hx, yE, hz], [hx, yE, hz], [hx, yR, 0], [-hx, yR, 0]], 1);
    addPlane([[hx, yE, -hz], [-hx, yE, -hz], [-hx, yR, 0], [hx, yR, 0]], -1);
    eaveLine(-hx, hx, hz, 1); eaveLine(-hx, hx, -hz, -1);
    // gable end walls
    const wm = S.wall2 || S.wall; const [mk, s] = WALLS[wm.kind];
    for (const sx of [-1, 1]) {
      const pts = [[sx * W / 2, top - 0.01, D / 2], [sx * W / 2, top - 0.01, -D / 2], [sx * W / 2, top + (D / 2) * p, 0]];
      const pg = poly(pts, [sx, 0, 0], (q) => [q[2] / s, q[1] / s]);
      H.gb.mesh(M[mk], wm.color, pg.p, pg.n, pg.u, pg.i, RF.M(0, 0, 0));
      // verge boards (破風)
      for (const sz of [-1, 1]) {
        RF.beam(M.plain, trimC, [sx * (hx + 0.015), yE - tv * 0.6, sz * hz], [sx * (hx + 0.015), yR - tv * 0.6, 0], 0.045, 0.26, { extend: 0.1 });
        if (rm.edge && lod >= 1) RF.beam(rm.ridge, ridgeCol, [sx * (hx - 0.08), yE + 0.05, sz * hz], [sx * (hx - 0.08), yR + 0.05, 0], 0.2, 0.08, { uv: { world: 0.6, worldV: 0.2 } });
      }
      // gable vent (換気口)
      if (lod >= 1) RF.box(M.plain, S.trim, 0.04, 0.34, 0.5, sx * (W / 2 + 0.02), top + (D / 2) * p * 0.45, 0);
    }
    const rw = rm.edge ? 0.28 : 0.18, rh = rm.edge ? 0.22 : 0.08;
    RF.beam(rm.ridge, ridgeCol, [-hx - 0.05, yR + rh / 2 - 0.03, 0], [hx + 0.05, yR + rh / 2 - 0.03, 0], rw, rh, { uv: { world: 0.6, worldV: 0.2 } });
    if (rm.edge) for (const sx of [-1, 1]) RF.box(M.plain, ridgeCol, 0.12, 0.4, 0.4, sx * (hx + 0.02), yR + 0.14, 0); // 鬼瓦
    downpipe(H, RF, hx - 0.1, hz + 0.06, W / 2, D / 2, yE - tv - 0.06, S, 1);
    downpipe(H, RF, -hx + 0.1, -hz - 0.06, -W / 2, -D / 2, yE - tv - 0.06, S, -1);
  } else if (type === 'shed') {
    // high at the back (-z), low at the front (+z) (or reversed)
    const s = R.reverse ? -1 : 1;
    const yLow = yE, yHigh = yE + 2 * hz * p; ridgeY = yHigh;
    const pts = [[-hx, yLow, s * hz], [hx, yLow, s * hz], [hx, yHigh, -s * hz], [-hx, yHigh, -s * hz]];
    const sl = slab(pts, tv, (q) => [q[0] / (1.2 * rm.topS), -(hz - s * q[2]) * Math.sqrt(1 + p * p)]);
    H.gb.mesh(rm.top, col, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
    eaveLine(-hx, hx, s * hz, s);
    RF.box(M.plain, trimC, W + 2 * og, 0.25, 0.04, 0, yHigh - tv - 0.02, -s * (hz + 0.02));
    // side (trapezoid) walls and raised back wall
    const wm = S.wall2 || S.wall; const [mk, ws] = WALLS[wm.kind];
    for (const sx of [-1, 1]) {
      const pts2 = [[sx * W / 2, top - 0.01, s * D / 2], [sx * W / 2, top - 0.01, -s * D / 2], [sx * W / 2, top + D * p, -s * D / 2]];
      const pg = poly(pts2, [sx, 0, 0], (q) => [q[2] / ws, q[1] / ws]);
      H.gb.mesh(M[mk], wm.color, pg.p, pg.n, pg.u, pg.i, RF.M(0, 0, 0));
      RF.beam(M.plain, trimC, [sx * (hx + 0.015), yLow - tv * 0.6, s * hz], [sx * (hx + 0.015), yHigh - tv * 0.6, -s * hz], 0.045, 0.24, { extend: 0.05 });
    }
    RF.boxB(M[mk], wm.color, W, D * p, 0.02, 0, top - 0.01, -s * (D / 2 - 0.011), { uv: { world: ws } });
    downpipe(H, RF, (R.reverse ? -1 : 1) * (hx - 0.1), s * (hz + 0.06), (R.reverse ? -1 : 1) * W / 2, s * D / 2, yE - tv - 0.06, S, s);
  } else if (type === 'flat') {
    // parapet roof (apartments / modern boxes)
    // [v5] the roof colour (hero.js: flatRoofOf, the measured / override colour); it was S.trim (random white / brown / black)
    RF.boxB(M.plain, col || S.trim, W + 0.1, 0.12, D + 0.1, 0, top + 0.9, 0);
    ridgeY = top + 1.0;
  }
  // solar panels on the sunny (front/back) plane
  if (S.solar && (type === 'hip' || type === 'gable') && lod >= 1) {
    const sgn = alongZ ? 1 : 1;
    const pw = Math.min(W * 0.7, 5), ph = Math.min(hz * 0.7, 2.6);
    const zc = hz * 0.5, yc = yE + (hz - zc) * p + 0.08;
    RF.box(H.M.atlas, '#ffffff', pw, 0.05, ph, 0, yc, zc, { rx: Math.atan(p), uv: { rect: H.A.rects.solar, white: H.A.white, faces: 'all' } });
  }
  out.roofFrame = RF; out.roofHx = hx; out.roofHz = hz; out.roofYE = yE; out.roofP = p; out.alongZ = alongZ;
  return ridgeY;
}

/** Wing roof: a pent leaning against the host face of the main volume. */
function buildWingRoof(H, F, w, host, R, S) {
  const fy = S.floorY;
  const top = fy + S.fh * w.floors;
  // frame on the host face line, local +z pointing out of the main body
  let FF, L0, L1, depth;
  if (host === 'front') { FF = F.sub(0, 0, w.cz - w.d / 2, 0); L0 = w.cx - w.w / 2; L1 = w.cx + w.w / 2; depth = w.d; }
  else if (host === 'back') { FF = F.sub(0, 0, w.cz + w.d / 2, Math.PI); L0 = -(w.cx + w.w / 2); L1 = -(w.cx - w.w / 2); depth = w.d; }
  else if (host === 'right') { FF = F.sub(w.cx - w.w / 2, 0, 0, Math.PI / 2); L0 = -(w.cz + w.d / 2); L1 = -(w.cz - w.d / 2); depth = w.w; }
  else { FF = F.sub(w.cx + w.w / 2, 0, 0, -Math.PI / 2); L0 = w.cz - w.d / 2; L1 = w.cz + w.d / 2; depth = w.w; }
  const p = R.pitch;
  const rise = depth * p;
  buildPent(H, FF, L0 - 0.4, L1 + 0.4, top + rise + 0.05, depth + 0.45, p, S.roof, S, true, { closeSides: true, top, depth });
}

/** Pent roof (下屋 / 庇 / canopy roof) on a face frame, from u0..u1, high edge at y (at the wall), projecting d. */
export function buildPent(H, FF, u0, u1, y, d, p, R, S, gutter, o = {}) {
  const { M } = H;
  const rm = roofMats(H, R);
  const tv = Math.min(rm.t, 0.16);
  const yLow = y - d * p;
  const pts = [[u0, y + tv, 0], [u1, y + tv, 0], [u1, yLow + tv, d], [u0, yLow + tv, d]];
  const sl = slab(pts, tv, (q) => [q[0] / (1.2 * rm.topS), -(d - q[2]) * Math.sqrt(1 + p * p)]);
  H.gb.mesh(rm.top, R.color, sl.p, sl.n, sl.u, sl.i, FF.M(0, 0, 0));
  const L = u1 - u0, um = (u0 + u1) / 2;
  FF.box(M.plain, S.fasciaColor, L, 0.17, 0.04, um, yLow - 0.02, d - 0.02);
  if (rm.edge) FF.box(rm.edge, R.color, L, 0.09, 0.07, um, yLow + tv - 0.04, d - 0.02, { uv: { world: 0.3, worldV: 0.09 } });
  FF.box(M.plain, S.soffitColor, L - 0.06, 0.02, d - 0.06, um, yLow - 0.1, d / 2);
  if (gutter && S.gutters !== false) FF.box(M.plain, S.gutterColor, L, 0.08, 0.1, um, yLow - 0.05, d + 0.05);
  // flashing against the wall
  FF.box(M.plain, S.flashColor, L, 0.06, 0.05, um, y + tv + 0.02, 0.02);
  // closed sides (wing walls under a pent): triangles
  if (o.closeSides) {
    const wm = S.wall; const [mk, s] = WALLS[wm.kind];
    const dd = o.depth;
    for (const uu of [u0 + 0.4, u1 - 0.4]) {
      const pts2 = [[uu, o.top - 0.01, 0], [uu, o.top - 0.01, dd], [uu, y - 0.02, 0]];
      const pg = poly(pts2, [uu < um ? -1 : 1, 0, 0], (q) => [q[2] / s, q[1] / s]);
      H.gb.mesh(M[mk], wm.color, pg.p, pg.n, pg.u, pg.i, FF.M(0, 0, 0));
    }
    // edge ridge cover against the wall
    FF.box(rm.edge ? M.ridge : M.plain, R.color, L, 0.1, 0.16, um, y + tv + 0.05, 0.06, { uv: { world: 0.6, worldV: 0.2 } });
  }
}

function downpipe(H, RF, gx, gz, wx, wz, gyTop, S, dir) {
  const { M } = H;
  const col = S.gutterColor;
  const g0 = S.groundMin - 0.02;
  // corner of the wall: pipe runs down the wall face near the corner
  const px = wx - Math.sign(wx) * 0.12, pz = wz + dir * 0.06;
  // elbow from the gutter back to the wall
  RF.beam(M.plain, col, [gx, gyTop - 0.05, gz], [px, gyTop - 0.45, pz], 0.06, 0.06);
  RF.cyl(M.plain, col, 0.032, gyTop - 0.45 - g0, px, (gyTop - 0.45 + g0) / 2, pz, { seg: 6 });
  // brackets
  for (let k = 1; k < 4; k++) RF.box(M.plain, col, 0.09, 0.03, 0.08, px, g0 + (gyTop - g0) * k / 4, pz - dir * 0.03);
  // shoe + small drain box on the ground
  RF.box(M.concrete, '#b8b6ae', 0.3, 0.06, 0.3, px, g0 + 0.03, pz + dir * 0.05, { uv: { world: 2 } });
}

// =============================================================================================
function buildUtilities(H, faces, S, r, free, reserve, lod, out) {
  const P = H.props;
  const sides = faces.filter(f => f.vol.id === 'main' && (f.side === 'left' || f.side === 'right' || f.side === 'back'));
  const g0 = S.groundMin;
  const findSpot = (face, w, fl = 0, pref = 0) => {
    const L = face.len;
    for (let k = 0; k < 14; k++) {
      const u = pref !== 0 ? (pref * (L / 2 - 0.5 - w / 2) - pref * k * 0.35) : (-L / 2 + 0.5 + w / 2 + r() * (L - 1 - w));
      if (u - w / 2 < -L / 2 + 0.3 || u + w / 2 > L / 2 - 0.3) continue;
      if (free(face, fl, u - w / 2, u + w / 2)) { reserve(face, fl, u - w / 2, u + w / 2); return u; }
    }
    return null;
  };
  // electric meter on a side face near the front
  const sideF = sides.filter(f => f.side !== 'back');
  const mf = sideF[Math.floor(r() * sideF.length)] || sides[0];
  if (mf) {
    const pref = mf.side === 'right' ? -1 : 1;
    const u = findSpot(mf, 0.4, 0, pref);
    if (u !== null) P.elecMeter(mf.F, u, S.floorY + 1.3);
  }
  // gas meter + water heater
  const gf = sides[Math.floor(r() * sides.length)];
  if (gf && lod >= 1) {
    const u = findSpot(gf, 0.45);
    if (u !== null) { if (S.propane) P.propane(gf.F, u, g0 - (gf.F === gf.F ? 0 : 0), S.floorY); else P.gasMeter(gf.F, u, S.floorY + 0.55, g0); }
    const u2 = findSpot(gf, 0.55);
    if (u2 !== null && lod >= 2) P.waterHeater(gf.F, u2, S.floorY + 0.7);
  }
  // AC outdoor units with pipe covers (1–3)
  const nAC = lod >= 2 ? 1 + Math.floor(r() * 2.4) : (lod >= 1 ? 1 : 0);
  for (let i = 0; i < nAC; i++) {
    const f = sides[Math.floor(r() * sides.length)];
    if (!f) break;
    const u = findSpot(f, 0.95);
    if (u === null) continue;
    const to = f.floors > 1 && r() < 0.6 ? S.floorY + S.fh + 2.2 : S.floorY + 2.1;
    P.acUnit(f.F, u, g0 - 0.0, 0.33, to);
    out.acCount = (out.acCount || 0) + 1;
  }
  // vents & small hoods
  if (lod >= 2) for (let i = 0; i < 2; i++) {
    const f = sides[Math.floor(r() * sides.length)]; if (!f) continue;
    const fl = f.floors > 1 && r() < 0.5 ? 1 : 0;
    const u = findSpot(f, 0.3, fl);
    if (u !== null) P.ventHood(f.F, u, S.floorY + fl * S.fh + 2.1);
  }
  // foundation vents (床下換気)
  if (lod >= 1) for (const f of faces) {
    if (f.vol.floors < 1) continue;
    const n = Math.floor(f.len / 3);
    for (let k = 0; k < n; k++) {
      const u = -f.len / 2 + (k + 0.5) * f.len / n;
      if (f.res.some(q => q[0] === 0 && !(u + 0.25 < q[1] || u - 0.25 > q[2]))) continue;
      f.F.box(H.M.atlas, '#ffffff', 0.34, 0.12, 0.02, u, S.floorY - 0.2, -0.01, { uv: { rect: H.A.rects.vent, white: H.A.white } });
    }
  }
  // address plate on a side corner
  if (lod >= 2 && r() < 0.5 && mf) {
    const u = findSpot(mf, 0.3, 0);
    if (u !== null) mf.F.box(H.M.atlas, '#ffffff', 0.3, 0.125, 0.012, u, S.floorY + 1.95, 0.006, { uv: { rect: H.A.rects['addr' + Math.floor(r() * 6)], white: H.A.white } });
  }
  // moss / dirt band along the foundation on a shaded side
  if (lod >= 2) for (const f of faces) {
    if (f.vol.id !== 'main' || f.side === 'front') continue;
    if (r() < 0.6) H.decal(f.F, 'dirt', (r() - 0.5) * f.len * 0.3, S.floorY - 0.18, f.len * 0.8, 0.5, 0.03, '#ffffff');
  }
}

// =============================================================================================
function buildAntenna(H, F, v, S, out) {
  const { M, ctx } = H;
  const r = S.rng;
  const RF = out.roofFrame;
  const yR = out.ridgeY;
  const ax = (r() - 0.5) * Math.max(0.2, (out.roofHx - out.roofHz)) * 1.2;
  const h = 2.2 + r() * 1.2;
  RF.cyl(M.plain, '#9aa1a8', 0.022, h + 0.3, ax, yR + h / 2 - 0.05, 0, { seg: 6 });
  RF.box(M.plain, '#8b9199', 0.3, 0.05, 0.3, ax, yR + 0.12, 0);
  // Yagi antennas: all point the same way (to the regional TV tower in the north-west)
  const az = H.antennaAz - RF.ry;
  const addYagi = (yy, len, n, ew) => {
    const c = Math.cos(az), s = Math.sin(az);
    const P = (a, b, y) => RF.w(ax + a * c + b * s, y, -a * s + b * c);
    ctx.wires.add([P(-len * 0.35, 0, yy), P(len * 0.65, 0, yy)], { width: 0.03, color: '#8a9098' });
    for (let i = 0; i < n; i++) { const a = -len * 0.3 + i * len * 0.9 / (n - 1); const e = ew * (1 - i / (n * 1.6)); ctx.wires.add([P(a, -e / 2, yy), P(a, e / 2, yy)], { width: 0.015, color: '#9aa1a8' }); }
  };
  addYagi(yR + h - 0.1, 1.6, 9, 0.5);
  if (r() < 0.5) addYagi(yR + h - 0.7, 1.0, 5, 0.9);
  // guy wires to the roof
  const top = RF.w(ax, yR + h - 0.5, 0);
  for (const [a, b] of [[1.3, 0.9], [-1.3, 0.9], [0, -1.2]]) {
    const q = RF.w(ax + a, out.roofYE + (out.roofHz - Math.abs(b)) * out.roofP + 0.25, b);
    ctx.wires.add([top, q], { width: 0.008, color: '#7d828b' });
  }
  // BS dish on the mast sometimes
  if (r() < 0.35) {
    const DF = RF.sub(ax, yR + 0.9, 0, H.dishAz - RF.ry);
    H.props.dish(DF, 0, 0, 0.1, 0);
  }
}
