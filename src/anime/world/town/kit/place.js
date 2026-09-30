// [v3:town] copied from src/anime/world/_houses/place.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// [v3:foundation] First-look adapters: Sakura's house generator on arbitrary real footprints (the GSI outline's OBB
// is the house box; frontage and colours come from the layout), plus a simple anime warehouse for port sheds.
import { Frame } from './gb.js';
import { makeSpec } from './lot.js';
import { buildHouse } from './house.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const wpick = (r, items) => { let s = 0; for (const [, w] of items) s += w; let x = r() * s; for (const [v, w] of items) { x -= w; if (x <= 0) return v; } return items[items.length - 1][0]; };

function groundRange(H, F, w, d) {
  let gmin = 1e9, gmax = -1e9;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) { const g = H.gy(F, x, z); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
  return { gmin, gmax };
}

/** A house / shop / apartment on its real footprint. Returns false when the footprint is too small or odd. */
export function buildLotHouse(H, lot, lod) {
  const { ctx, L, gb } = H;
  const w = lot.obb.w - 0.3, d = lot.obb.d - 0.3;
  if (w < 3.4 || d < 3.4 || w / d > 4.5 || d / w > 4.5) return false;
  const r = ctx.rng('klc-lot-' + lot.id);
  const f = L.lotFrame(lot);
  const F = Frame.at(gb, f.x, f.y, f.z, f.rotY);
  const HF = F.sub(0, 0, -lot.obb.d / 2, 0);
  H.lod = lod;
  const tall = lot.kind === 'apartment' || lot.kind === 'office' || lot.kind === 'public' || lot.kind === 'school' || lot.kind === 'hotel';   // [v4:polish1]
  const floors = Math.max(1, Math.min(tall ? 6 : 3, lot.storeys));
  const shape = lot.roof.shape;
  let roofType = shape === 'flat' ? 'flat' : shape === 'hip' ? 'hip' : shape === 'shed' ? 'shed' : 'gable';
  if (roofType === 'flat' && floors <= 2 && !tall) roofType = r() < 0.5 ? 'gable' : 'hip';
  const S = makeSpec(r, { floors, roofType, allowFlat: true, antennaP: tall ? 0 : 0.5, traditional: lot.kind === 'house' && r() < 0.12 });
  // the real roof colour (sampled from the aerial photo, snapped to the palette); walls from the layout
  S.roof.color = lot.roof.color;
  if (roofType !== 'flat' && roofType !== 'shed' && r() < 0.55) S.roof.mat = 'kawara';
  if (S.wall.kind === 'plaster' || S.wall.kind === 'paint') S.wall.color = lot.wall;
  if (tall) { S.wall = { kind: r() < 0.6 ? 'tile' : 'paint', color: r() < 0.6 ? pick(r, ['#d9d2c6', '#cdd0cd', '#e3dccd']) : lot.wall }; S.wall2 = null; S.antenna = false; S.solar = false; }
  Object.assign(S, { w, d, floors, fh: 2.85, lod });
  const { gmin, gmax } = groundRange(H, HF, w, d);
  S.floorY = gmax + 0.32;
  S.groundMin = gmin;
  S.groundFront = H.gy(HF, 0, d / 2 + 1);
  let du = (r() < 0.5 ? -1 : 1) * Math.max(0, w / 2 - 1.05 - r() * 0.6);
  const dStyle = S.traditional ? 'door_slide' : wpick(r, [['door_wood', 40], ['door_white', 22], ['door_grey', 28], ['door_slide', 10]]);
  if (dStyle === 'door_slide') du = Math.sign(du || 1) * Math.min(Math.abs(du), w / 2 - 1.35);
  S.door = { u: du, style: dStyle, canopy: wpick(r, [['slab', 55], ['roof', S.traditional ? 60 : 22], ['posts', 8]]), porchD: 0.9 + r() * 0.25 };
  if (floors >= 2 && w > 4.6 && r() < (tall ? 0.9 : 0.6)) {
    const bw = Math.min(w - 0.5, tall ? w * 0.8 : 2.6 + r() * 1.6);
    let bu = (r() - 0.5) * (w - bw);
    if (Math.abs(bu - du) < bw / 2 + 0.7 && S.door.canopy === 'roof') S.door.canopy = 'slab';
    S.balcony = { u: bu, w: bw, depth: 0.85 + r() * 0.2, rail: r() < 0.5 ? 'panel' : 'bars', laundry: !tall && r() < 0.55, laundryMix: pick(r, ['balcony', 'student', 'family', 'sheets']), futon: !tall && r() < 0.2, dish: r() < 0.25, chime: r() < 0.1, koinobori: false, posts: false };
  }
  S.plate = r() < 0.33 ? 'plateV' + (1 + 3 * Math.floor(r() * 8)) : 'plateH' + [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17][Math.floor(r() * 12)];
  S.wallMailbox = pick(r, ['mailbox', 'mailbox_dark', 'mailbox', 'mailbox_red']);
  S.baseY = HF.origin.y;
  buildHouse(H, HF, S);
  return true;
}

/** Port shed / processing plant: concrete plinth, corrugated walls, roll-up shutters, low metal gable (or flat) roof. */
export function buildWarehouse(H, lot, lod) {
  const { ctx, L, M, gb } = H;
  const w = lot.obb.w - 0.2, d = lot.obb.d - 0.2;
  if (w < 3 || d < 3) return false;
  const r = ctx.rng('klc-wh-' + lot.id);
  const f = L.lotFrame(lot);
  const F = Frame.at(gb, f.x, f.y, f.z, f.rotY);
  const HF = F.sub(0, 0, -lot.obb.d / 2, 0);
  const { gmin, gmax } = groundRange(H, HF, w, d);
  const h = Math.max(4.6, Math.min(14, lot.height));
  const fy = gmax + 0.12;
  const wall = lot.kind === 'landmark' ? '#e6e4dc' : lot.wall;
  HF.boxB(M.concrete, '#bdbcb5', w + 0.1, fy - gmin + 0.45, d + 0.1, 0, gmin - 0.3, 0, { uv: { world: 2 } });
  HF.boxB(M.siding, wall, w, h, d, 0, fy, 0, { uv: { world: 1.2 } });
  // band under the eaves (painted trim) and a rust-streaked lower band
  HF.boxB(M.plain, r() < 0.5 ? '#4f6f8f' : '#8a5a44', w + 0.06, 0.35, d + 0.06, 0, fy + h - 0.9, 0);
  // roll-up shutters on the street face (+z), sized to the face
  const n = Math.max(1, Math.min(6, Math.floor(w / 6.5)));
  const sw = Math.min(4.2, w / n - 1.2), sh = Math.min(h - 1.2, 3.6);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    HF.box(M.shutter || M.plain, '#aeb5bb', sw, sh, 0.08, x, fy + sh / 2, d / 2 + 0.04, { uv: { world: 1 } });
    HF.box(M.plain, '#5b6168', sw + 0.3, 0.3, 0.3, x, fy + sh + 0.15, d / 2 + 0.15);
  }
  // roof
  const alongX = w >= d;
  const RF = alongX ? HF : HF.sub(0, 0, 0, Math.PI / 2);
  const hx = (alongX ? w : d) / 2 + 0.35, hz = (alongX ? d : w) / 2 + 0.4;
  const top = fy + h;
  if (lot.roof.shape === 'flat') {
    HF.boxB(M.concrete, '#c9c7c0', w + 0.1, 0.5, d + 0.1, 0, top, 0, { uv: { world: 2 } });
    HF.boxB(M.plain, lot.roof.color, w - 0.5, 0.06, d - 0.5, 0, top + 0.5, 0);
  } else {
    const p = 0.16, tv = 0.12, yE = top + tv - 0.4 * p, yR = yE + hz * p;
    for (const s of [1, -1]) {
      const pts = [[-hx, yE, s * hz], [hx, yE, s * hz], [hx, yR, 0], [-hx, yR, 0]];
      const sl = H.slab(pts, tv, (q) => [q[0] / 1.08, -(hz - s * q[2]) * 1.02]);
      gb.mesh(M.metal, lot.roof.color, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
    }
    // gable ends filled with the wall colour
    const ww = alongX ? w : d, dd = alongX ? d : w;
    for (const s of [1, -1]) {
      const x = s * ww / 2;
      const tri = H.poly([[x, top, -dd / 2], [x, top, dd / 2], [x, yR - 0.1, 0]], [s, 0, 0]);
      gb.mesh(M.plain, wall, tri.p, tri.n, tri.u, tri.i, RF.M(0, 0, 0));
    }
  }
  H.col(HF, 0, 0, w, d, 0, gmin - 1, top + 2);
  return true;
}
