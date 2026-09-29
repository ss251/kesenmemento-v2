// [v3:town] Hero-zone buildings on the real GSI footprints (layout LOTS, zone 'hero'): Sakura's house generator for
// houses and apartments, a shop ground floor (shops.js) for shop lots and main-street frontages, port warehouses and
// processing plants (industrial.js), office blocks, plus front yards (block walls, gates, plants, bikes) where the
// footprint stands back from the street.
import { makeSpec } from './kit/lot.js';
import { buildHouse } from './kit/house.js';
import { groundRange, pick, wpick } from './common.js';
import { buildShop } from './shops.js';
import { buildWarehouse } from './industrial.js';
import { SHOPS, OFFICES } from './names.js';
import { wallOf, pitchedRoofOf, flatRoofOf } from './palette.js';
import { buildApartmentBlock, buildOfficeBlock } from './blocks.js';

/** Decide what each hero lot becomes. Deterministic (seeded by lot id). */
export function classifyHero(L, lots, roadIdx) {
  const out = new Map();
  const shopish = new Set(['八日町', '魚町', '南町', '内湾']);
  const areaOf = (x, z) => { for (const a of L.AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name; return ''; };
  for (const lot of lots) {
    const r = mulberry(lot.seed ^ 0x5bd1e995);
    const road = lot.front?.roadId ? L.roadById(lot.front.roadId) : null;
    const main = road && road.width >= 7.5 && road.kind !== 'alley';
    const area = areaOf(lot.obb.cx, lot.obb.cz);
    let kind = lot.kind;
    if (lot.landmark) kind = 'landmark';
    else if (kind === 'house' && main && shopish.has(area) && lot.area >= 35 && lot.area <= 260 && lot.obb.w >= 4 && r() < 0.55) kind = 'shop';
    else if (kind === 'office' && lot.storeys <= 2 && main && r() < 0.5) kind = 'shop';
    out.set(lot.id, { kind, main, area, road });
  }
  return out;
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Build one hero lot. ctxT = { H, SM, IM, signs, awn, out, shopCounter }.
 * Returns 'house'|'shop'|'apartment'|'office'|'warehouse'|null.
 */
export function buildHeroLot(T, lot, cls, lod) {
  const { H, SM, IM, signs, awn, out } = T;
  const { ctx, L } = H;
  const r = ctx.rng('klc-town-' + lot.id);
  if (cls.kind === 'landmark' || cls.kind === 'shrine' || lot.landmark) return null;   // harbor builds these
  if (L.shoreDist(lot.obb.cx, lot.obb.cz) > 0.5) return null;                          // pontoons / piers: harbor's
  if (cls.kind === 'warehouse' || cls.kind === 'factory') return buildWarehouse(H, lot, lod, IM, SM, signs, r, out) ? 'warehouse' : null;
  const w = lot.obb.w - 0.3, d = lot.obb.d - 0.3;
  if (w < 3.2 || d < 3.2 || w / d > 5 || d / w > 5) return null;
  const f = L.lotFrame(lot);
  const F = H.Frame.at(H.gb, f.x, f.y, f.z, f.rotY);
  const HF = F.sub(0, 0, -lot.obb.d / 2, 0);
  H.lod = lod;
  const kind = cls.kind;
  const tall = kind === 'apartment' || kind === 'office' || kind === 'public' || kind === 'school';
  // big blocks get the dedicated マンション / office builder (blocks.js)
  if (tall && lot.storeys >= 3 && Math.max(w, d) >= 9) {
    const ok = kind === 'apartment' ? buildApartmentBlock(H, lot, lod, r, T) : buildOfficeBlock(H, lot, lod, r, T);
    if (ok) return kind === 'apartment' ? 'apartment' : 'office';
  }
  const isShop = kind === 'shop' && w >= 3.4 && d >= 5;
  let floors = Math.max(1, Math.min(tall ? 7 : 3, lot.storeys));
  if (isShop && floors < 2 && r() < 0.8) floors = 2;
  const shape = lot.roof.shape;
  let roofType = shape === 'flat' ? 'flat' : shape === 'hip' ? 'hip' : shape === 'shed' ? 'shed' : 'gable';
  // Kesennuma's town is mostly pitched roofs; GSI "shed" is often a low gable read from above
  if (roofType === 'shed' && !tall && r() < 0.6) roofType = r() < 0.5 ? 'gable' : 'hip';
  if (roofType === 'flat' && floors <= 2 && !tall) roofType = r() < 0.5 ? 'gable' : 'hip';
  const S = makeSpec(r, { floors, roofType, allowFlat: true, antennaP: tall ? 0 : 0.5, traditional: (kind === 'house' || isShop) && r() < (isShop ? 0.3 : 0.12) });
  S.roof.color = roofType === 'flat' ? flatRoofOf(lot) : pitchedRoofOf(lot);
  if (roofType !== 'flat' && roofType !== 'shed' && r() < 0.55) S.roof.mat = 'kawara';
  if (S.wall.kind === 'plaster' || S.wall.kind === 'paint') S.wall.color = wallOf(lot);
  if (tall) {
    S.wall = { kind: r() < 0.6 ? 'tile' : 'paint', color: r() < 0.6 ? pick(r, ['#d9d2c6', '#cdd0cd', '#e3dccd', '#c9c3b6', '#dcd6ca', '#d6dde0', '#e6dcc8']) : wallOf(lot) };
    S.wall2 = null; S.antenna = false; S.solar = false;
  }
  Object.assign(S, { w, d, floors, fh: 2.85, lod });
  const { gmin, gmax } = groundRange(H, HF, w, d);
  S.floorY = gmax + (isShop ? 0.12 : 0.32);
  S.groundMin = gmin;
  S.groundFront = H.gy(HF, 0, d / 2 + 1);
  let du = (r() < 0.5 ? -1 : 1) * Math.max(0, w / 2 - 1.05 - r() * 0.6);
  const dStyle = S.traditional ? 'door_slide' : wpick(r, [['door_wood', 40], ['door_white', 22], ['door_grey', 28], ['door_slide', 10]]);
  if (dStyle === 'door_slide') du = Math.sign(du || 1) * Math.min(Math.abs(du), w / 2 - 1.35);
  S.door = { u: du, style: dStyle, canopy: wpick(r, [['slab', 55], ['roof', S.traditional ? 60 : 22], ['posts', 8]]), porchD: 0.9 + r() * 0.25 };
  let shopIdx = -1;
  if (isShop) {
    shopIdx = T.shopCounter++ % SHOPS.length;
    const style = SHOPS[shopIdx].style === 'wa' || SHOPS[shopIdx].style === 'open' ? SHOPS[shopIdx].style : (r() < 0.12 ? 'shutter' : SHOPS[shopIdx].style);
    S.shop = { depth: Math.min(d - 1.6, 3.4 + r() * 1.2), style };
    if (SHOPS[shopIdx].style === 'wa') { S.roof.mat = 'kawara'; if (S.roof.type === 'flat') S.roof.type = 'gable'; }
    S.door = { u: Math.max(-w / 2 + 1, Math.min(w / 2 - 1, du)), style: 'door_grey', canopy: 'slab', porchD: 0.8, face: 'back' };
    S.balcony = null;
  }
  if (!isShop && floors >= 2 && w > 4.6 && r() < (tall ? 0.9 : 0.6)) {
    const bw = Math.min(w - 0.5, tall ? w * 0.8 : 2.6 + r() * 1.6);
    const bu = (r() - 0.5) * (w - bw);
    if (Math.abs(bu - du) < bw / 2 + 0.7 && S.door.canopy === 'roof') S.door.canopy = 'slab';
    S.balcony = { u: bu, w: bw, depth: 0.85 + r() * 0.2, rail: r() < 0.5 ? 'panel' : 'bars', laundry: !tall && r() < 0.55, laundryMix: pick(r, ['balcony', 'student', 'family', 'sheets']), futon: !tall && r() < 0.2, dish: r() < 0.25, chime: r() < 0.1, koinobori: false, posts: false };
  }
  S.plate = r() < 0.33 ? 'plateV' + (1 + 3 * Math.floor(r() * 8)) : 'plateH' + [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17][Math.floor(r() * 12)];
  S.wallMailbox = pick(r, ['mailbox', 'mailbox_dark', 'mailbox', 'mailbox_red']);
  S.baseY = HF.origin.y;
  const res = buildHouse(H, HF, S);
  if (isShop) {
    const sh = buildShop(H, HF, S, shopIdx, SM, signs, awn, r, out);
    const fp = HF.w(0, 0, S.d / 2);
    out.shopFronts.push({ x: fp.x, y: fp.y, z: fp.z, rotY: HF.ry, w: S.w, type: sh.type, name: sh.name, lotId: lot.id, style: S.shop.style });
  }
  // office / apartment name plate on the facade
  if (tall && lod >= 1 && floors >= 3) {
    const name = OFFICES[Math.abs(lot.seed) % OFFICES.length];
    out.buildingNames.push({ lotId: lot.id, name });
  }
  // front yard: block wall + gate + plants + a bicycle spot when the house stands back from the street
  if (!isShop && !tall && lod >= 1) frontYard(T, lot, HF, S, r, cls);
  out.windowsHint += floors * 4;
  return isShop ? 'shop' : tall ? (kind === 'office' ? 'office' : 'apartment') : 'house';
}

function frontYard(T, lot, HF, S, r, cls) {
  const { H, out } = T;
  const { L, M } = H;
  const road = cls.road;
  if (!road) return;
  // distance from the building front to the road edge, measured from the frontage centre
  const fp = HF.w(0, 0, S.d / 2 + 0.15);
  const near = T.roadIdx.nearest(fp.x, fp.z, 25);
  if (!near) return;
  const setback = near.d - near.road.width / 2;
  if (setback < 1.6) {
    // flush with a lane: a row of potted plants (鉢植え) along the front wall, sometimes a bench or a bike
    if (setback > 0.35 && near.road.width < 7.5 && r() < 0.55) {
      const n = 3 + Math.floor(r() * 6), x0 = -S.w / 2 + 0.3 + r() * 0.8;
      for (let i = 0; i < n; i++) { const px = x0 + i * (0.42 + r() * 0.15); if (px > S.w / 2 - 0.3 || Math.abs(px - (S.door.u ?? 99)) < 0.7) continue; const pz = S.d / 2 + 0.28; H.props.pot(HF, px, H.gy(HF, px, pz), pz, r, 0.8 + r() * 0.5); }
      if (r() < 0.35) { const p = HF.w((S.door.u ?? 0) > 0 ? -S.w / 2 + 1.2 : S.w / 2 - 1.2, 0, S.d / 2 + 0.55); out.bikeSpots.push({ x: p.x, z: p.z, rotY: HF.ry + Math.PI / 2 + (r() - 0.5) * 0.2, seed: lot.seed }); }
    }
    return;
  }
  if (setback > 9) return;
  const zWall = S.d / 2 + setback - 0.35;
  // don't build walls into other buildings
  const probe = HF.w(0, 0, zWall);
  if (T.lotIdx.at(probe.x, probe.z, 0.2) && T.lotIdx.at(probe.x, probe.z, 0.2) !== lot) return;
  const w = S.w + 0.6;
  const gateW = 1.2 + r() * 0.6, gu = Math.max(-w / 2 + gateW / 2 + 0.3, Math.min(w / 2 - gateW / 2 - 0.3, S.door.u ?? 0));
  const wallH = wpick(r, [[0.6, 3], [1.0, 3], [1.4, 2]]);
  const col = pick(r, ['#c9c5bb', '#bdbcb5', '#d6d0c2', '#b8b2a6']);
  const seg = [[-w / 2, gu - gateW / 2], [gu + gateW / 2, w / 2]];
  for (const [a, b] of seg) if (b - a > 0.4) H.slopedWall(HF, a, b, zWall, wallH, 0.15, M.block, col, 0.4, 0.2);
  // gate posts + mailbox
  for (const s of [-1, 1]) { const x = gu + s * (gateW / 2 + 0.1), gy = H.gy(HF, x, zWall); HF.boxB(M.plain, '#9d9c96', 0.24, Math.max(wallH, 1.1) + 0.1, 0.24, x, gy, zWall); }
  // yard: a tree or shrubs, pots by the door, a bicycle spot
  const yz = S.d / 2 + (zWall - S.d / 2) / 2;
  const tx = gu > 0 ? -w / 4 : w / 4;
  if (zWall - S.d / 2 > 1.4) {
    const gy = H.gy(HF, tx, yz);
    if (r() < 0.6) H.props.tree(HF, tx, gy, yz, 0.8 + r() * 0.5, r, pick(r, ['round', 'round', 'pine', 'maple']));
    else H.props.bush(HF, tx, gy, yz, 0.6 + r() * 0.3, r, { pal: 'green', n: 3 });
    for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const px = gu + (r() - 0.5) * gateW, pz = S.d / 2 + 0.4 + r() * 0.3; H.props.pot(HF, px, H.gy(HF, px, pz), pz, r, 0.9); }
    if (r() < 0.55) { const p = HF.w(gu + (gu > 0 ? -1 : 1) * (gateW / 2 + 0.7), 0, yz); out.bikeSpots.push({ x: p.x, z: p.z, rotY: HF.ry + Math.PI / 2 + (r() - 0.5) * 0.3, seed: lot.seed }); }
  }
  const gp = HF.w(gu, 0, zWall);
  out.gates.push({ x: gp.x, z: gp.z });
}
