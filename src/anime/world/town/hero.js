// [v3:town] Hero-zone buildings on the real GSI footprints (layout LOTS, zone 'hero'): Sakura's house generator for
// houses and apartments, a shop ground floor (shops.js) for shop lots and main-street frontages, port warehouses and
// processing plants (industrial.js), office blocks, plus front yards (block walls, gates, plants, bikes) where the
// footprint stands back from the street.
import { makeSpec } from './kit/lot.js';
import { buildHouse } from './kit/house.js';
import { CORNER_VBOARD } from './realnames.js';
import { groundRange, pick, wpick, roofShapeAt, realFh, isMeasuredRoof } from './common.js';
import { buildShop } from './shops.js';
import { buildWarehouse } from './industrial.js';
import { SHOPS, OFFICES } from './names.js';
import { wallOf, pitchedRoofOf, flatRoofOf, kawaraColour, measuredWall } from './palette.js';
import { wings } from './wings.js';   // [v4:town-accuracy]
import { buildApartmentBlock, buildOfficeBlock } from './blocks.js';
import { LOT_TOWER, buildSignTower } from './signtower.js';   // [r2:12]
import { flatPaint } from './flatroof.js';   // [r2:3]
import { hasPlant, drawRoofPlant } from './roofplant.js';   // [r2:5]
import { isFlushPv } from './pv.js';   // [r3:5]

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
    // [sys:30] a kind read from the imagery / OSM / an override is not re-rolled into a shop by the main-street rules below
    const measuredKind = !!lot.src?.kind && lot.src.kind !== 'derived';
    if (lot.landmark) kind = 'landmark';
    // [v4:town-accuracy] a real shop / restaurant / bank (OSM shop=* or amenity=*) gets a shop front
    // [v6:c5r3] a measured 3+ storey office (an override: 気仙沼信用金庫 本店, amenity:bank) stays an office block, not a 5-storey shop-front house
    else if (REAL_SHOP.test(lot.use || '') && !(kind === 'office' && measuredKind && lot.storeys >= 3) && lot.area >= 25 && lot.area <= 450 && lot.obb.w >= 3.6 && (kind === 'house' || kind === 'shop' || kind === 'office' || kind === 'apartment' && lot.storeys <= 3)) kind = 'shop';
    else if (!measuredKind && kind === 'house' && main && shopish.has(area) && lot.area >= 35 && lot.area <= 260 && lot.obb.w >= 4 && r() < 0.55) kind = 'shop';
    else if (!measuredKind && kind === 'office' && lot.storeys <= 2 && main && r() < 0.5) kind = 'shop';
    out.set(lot.id, { kind, main, area, road });
  }
  return out;
}

const REAL_SHOP = /^(shop:|amenity:(restaurant|cafe|bar|pub|fast_food|pharmacy|bank|ice_cream)|tourism:(hotel|guest_house))/;
/** [v4:town-accuracy] the fictional shop kit (names.js) whose trade matches a real OSM use: its front, interior and
 *  display suit the real shop; the board then carries the real name. */
const USE_TYPE = [[/seafood|fish/, '鮮魚'], [/sushi/, '寿司'], [/alcohol|wine|sake/, '酒店'], [/cafe|coffee|tea/, '喫茶'], [/confectionery|pastry|bakery/, '菓子'], [/greengrocer|farm/, '青果'],
  [/hairdresser|barber/, '理容'], [/pharmacy|chemist/, '薬局'], [/stationery|books|newsagent/, '文具'], [/hardware|doityourself/, '金物'], [/clothes|fabric|shoes/, '呉服'], [/gift|souvenir/, '土産'],
  [/restaurant|fast_food|food/, '食堂'], [/bar|pub/, '食堂']];
export function shopIndexFor(use, fallback) {
  const u = use || '';
  for (const [re, type] of USE_TYPE) if (re.test(u)) { const i = SHOPS.findIndex((x) => x.type === type); if (i >= 0) return i; }
  return fallback;
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
  if (lot.kind === 'temple') return null;   // [v4:polish3] landmarks/temples.js builds the 入母屋 hall (templeLots)
  if (cls.kind === 'carpark') return null;   // [v6:c6r3] an open multi-storey car park: mid.js drawCarpark (the kit would stand a closed box on it)
  if (L.shoreDist(lot.obb.cx, lot.obb.cz) > 0.5) return null;                          // pontoons / piers: harbor's
  // [v4:town-accuracy] the real footprint: a near-rectangular lot is one kit building; an L / T / U-shaped one gets the kit
  // building on its main wing and the other wings from the simplified builder (T.annex); odd shapes go to mid entirely
  const WG = wings(lot);
  // [v4:polish1] a big curved / many-sided footprint filling < 0.8 of its box: the simplified builder builds it on its
  // true polygon (the kit would stand a box on the OBB)
  if (WG.simple && WG.rect < 0.8 && lot.area >= 250) return null;
  if (cls.kind === 'warehouse' || cls.kind === 'factory') {
    if (WG.rect < 0.85) return null;
    return buildWarehouse(H, lot, lod, IM, SM, signs, r, out) ? 'warehouse' : null;
  }
  let wing = WG.rects[0];
  if (!WG.simple) {
    const polyA = WG.rects.reduce((a, q) => a + q.area, 0);
    if (wing.area < 0.4 * polyA || Math.min(wing.w, wing.d) < 3.6) return null;
    if (WG.rects.length > 1) T.annex?.set(lot.id, { rects: WG.rects });
  }
  const f = L.lotFrame(lot);
  const F = H.Frame.at(H.gb, f.x, f.y, f.z, f.rotY);
  const HF = F.sub(wing.cx, 0, -lot.obb.d / 2 + wing.cz, 0);
  // walls stand under the eaves: the roof outline (not the walls) is the footprint edge; the inset is set below once
  // the spec knows its overhang
  let w = wing.w - 0.3, d = wing.d - 0.3;
  if (w < 3.2 || d < 3.2 || w / d > 5 || d / w > 5) { T.annex?.delete(lot.id); return null; }
  H.lod = lod;
  const kind = cls.kind;
  const tall = kind === 'apartment' || kind === 'office' || kind === 'public' || kind === 'school' || kind === 'hotel';   // [v4:polish1] hotel
  // big blocks get the dedicated マンション / office builder (blocks.js)
  if (tall && lot.storeys >= 3 && Math.max(w, d) >= 9) {
    const ok = kind === 'apartment' ? buildApartmentBlock(H, lot, lod, r, T, wing) : buildOfficeBlock(H, lot, lod, r, T, wing);
    if (ok) return kind === 'apartment' ? 'apartment' : 'office';
  }
  const isShop = kind === 'shop' && w >= 3.4 && d >= 5;
  // [v4:town-accuracy] real storeys (OSM building:levels / height, or a landmark sheet) are built as they are
  const realH = lot.src?.h === 'osm' || lot.src?.h === 'landmark' || lot.src?.h === 'override' || lot.src?.h === 'ref';   // [v4:overrides] + override heights; [r2:12] + LOT_FIX heights ('ref')
  let floors = Math.max(1, Math.min(realH ? (tall ? 14 : 8) : tall ? 7 : 3, lot.storeys));   // [sys:29] a measured non-tall block may have up to 8 storeys
  if (isShop && floors < 2 && !realH && r() < 0.8) floors = 2;
  // [sys:4] the roof is the lot's own: a derived shape was resolved once in build-layout.js (no re-roll here, so L0 matches L1 and far)
  let roofType = roofShapeAt(lot, 'hero');
  if (roofType !== 'flat' && roofType !== 'hip' && roofType !== 'shed') roofType = 'gable';
  // [r2:12] a big derived-roof block is a flat deck: a house-style gable or mono-pitch over a 30 m+ lot is a derived guess (the AEON mall was a 46 m wedge); a roof read from
  // the imagery (aerial, OSM, an override) is kept (its rise is capped in kit/house.js). Warehouses and plants never reach here.
  if (roofType !== 'flat' && kind !== 'warehouse' && !isMeasuredRoof(lot) && (Math.max(w, d) > 30 || lot.area > 1500)) roofType = 'flat';
  const S = makeSpec(r, { floors, roofType, allowFlat: true, antennaP: tall ? 0 : 0.5, traditional: (kind === 'house' || isShop) && r() < (isShop ? 0.3 : 0.12), pvData: lot.roof.pv != null });   // [r3:5] pvData masks the seeded roof panel
  S.roof.color = roofType === 'flat' ? flatPaint(flatRoofOf(lot)) : pitchedRoofOf(lot);   // [r2:3] a flat top renders about 3.5 L* lighter than painted
  // [v4:town-accuracy] 瓦 only on tile-coloured roofs (the kawara texture would turn a red or blue metal roof grey)
  if (roofType !== 'flat' && roofType !== 'shed' && kawaraColour(S.roof.color) && r() < 0.7) S.roof.mat = 'kawara';
  else if (S.roof.mat === 'kawara' && !kawaraColour(S.roof.color)) S.roof.mat = 'metal';
  if (isFlushPv(lot.roof.pv) && wing === WG.rects[0]) S.pvFlush = { rects: lot.roof.pv.rects, ridgeAt: lot.roof.pv.ridgeAt ?? null, off: { x: wing.cx, z: wing.cz } };   // [r3:5] measured solar blocks lying in the roof plane (kit/house.js buildRoof)
  // [r3:5] a ridge an override measured (src.roof 'override') holds on an L / T-shaped lot too, as in mid.js (萬屋呉服部 /129: the real ridge runs along the frontage; the main wing's long axis is z, so the kit turned it a quarter and its PV blocks stood 3 m off)
  S.roof.axis = lot.roof.ridge && wing === WG.rects[0] && (WG.simple || lot.src?.roof === 'override') ? lot.roof.ridge : (w >= d ? 'x' : 'z');   // [v4:town-accuracy] measured ridge, else the long axis (was a coin flip)
  if (S.wall.kind === 'plaster' || S.wall.kind === 'paint') S.wall.color = wallOf(lot);
  // [v6:c5] a wall colour an override read from the imagery (島田呉服店: white-rendered RC) is drawn as that painted wall, not a random board / tile skin
  // [sys:31] the same for an OSM building:colour: every r() call above stays where it is, only the result is replaced
  if (measuredWall(lot) && !tall) { S.wall = { kind: S.wall.kind === 'wood' || S.wall.kind === 'siding' || S.wall.kind === 'tile' ? 'paint' : S.wall.kind, color: lot.wall }; S.wall2 = null; }
  if (tall) {
    S.wall = { kind: r() < 0.6 ? 'tile' : 'paint', color: r() < 0.6 ? pick(r, ['#d9d2c6', '#cdd0cd', '#e3dccd', '#c9c3b6', '#dcd6ca', '#bdbcb6', '#e6dcc8']) : wallOf(lot) };
    if (measuredWall(lot)) S.wall.color = lot.wall;
    S.wall2 = null; S.antenna = false; S.solar = false;
  }
  // [v4:town-accuracy] inset the walls by the eave overhang so the roof edge lands on the footprint edge
  { const ov = roofType === 'flat' ? 0.05 : Math.max(0, (S.roof.over ?? 0.5) - 0.15); w = Math.max(3.0, w - 2 * ov); d = Math.max(3.0, d - 2 * ov); }
  // [sys:29] a measured height is built as given: the storey height follows lot.height (the kit used a fixed 2.85 m)
  Object.assign(S, { w, d, floors, fh: realH ? realFh(lot, floors, roofType) : 2.85, lod });
  const { gmin, gmax } = groundRange(H, HF, w, d);
  S.floorY = gmax + (isShop ? 0.12 : 0.32);
  S.groundMin = Math.min(gmin, lot.baseY ?? gmin);   // [sys:6] the foundation reaches the lowest terrain of the lot (baseY)
  S.groundFront = H.gy(HF, 0, d / 2 + 1);
  let du = (r() < 0.5 ? -1 : 1) * Math.max(0, w / 2 - 1.05 - r() * 0.6);
  const dStyle = S.traditional ? 'door_slide' : wpick(r, [['door_wood', 40], ['door_white', 22], ['door_grey', 28], ['door_slide', 10]]);
  if (dStyle === 'door_slide') du = Math.sign(du || 1) * Math.min(Math.abs(du), w / 2 - 1.35);
  S.door = { u: du, style: dStyle, canopy: wpick(r, [['slab', 55], ['roof', S.traditional ? 60 : 22], ['posts', 8]]), porchD: 0.9 + r() * 0.25 };
  let shopIdx = -1;
  const real = T.real?.get(lot) || null;   // [v4:town-accuracy] the real name, when OSM / GSI has one
  if (isShop) {
    shopIdx = real ? shopIndexFor(lot.use, T.shopCounter % SHOPS.length) : T.shopCounter % SHOPS.length;
    T.shopCounter++;
    const style = SHOPS[shopIdx].style === 'wa' || SHOPS[shopIdx].style === 'open' ? SHOPS[shopIdx].style : (r() < 0.12 ? 'shutter' : SHOPS[shopIdx].style);
    S.shop = { depth: Math.min(d - 1.6, 3.4 + r() * 1.2), style: CORNER_VBOARD[lot.id] ? 'shutter' : style };   // [v6:c5] 島田呉服店's shopfront is closed by grey roller shutters (Commons 2026-09-24)
    if (real) S.real = real;
    if (SHOPS[shopIdx].style === 'wa' && roofType !== 'flat') S.roof.mat = 'kawara';   // [sys:4] a flat roof stays flat (it was turned into a gable here)
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
  // [r2:12] the AEON sign tower over the roof deck (LOT_TOWER: the kit's flat roof has none); the deck is the parapet slab at floor + storeys + 0.9 m
  // [r2:5] a measured rooftop plant spec (lot.roof.plant) on a kit flat roof: the deck is the parapet plate at floor + storeys + 0.9 m (+ 0.12)
  if (hasPlant(lot) && roofType === 'flat') drawRoofPlant(HF, H.M, lot, S.floorY + floors * S.fh + 1.02, wing);
  if (LOT_TOWER[lot.id] && roofType === 'flat') {
    // the tower's world spot in this frame (the kit frame of a far lot may be turned by explore: world -> local through the frame's inverse)
    const tw = LOT_TOWER[lot.id], q = HF.origin.clone().set(tw.at[0], 0, tw.at[1]).applyMatrix4(HF.m.clone().invert());
    buildSignTower(H, HF, S.floorY + floors * S.fh + 1.0, { ...tw, x: q.x, z: q.z });
  }
  if (isShop) {
    const sh = buildShop(H, HF, S, shopIdx, SM, signs, awn, r, out);
    const fp = HF.w(0, 0, S.d / 2);
    out.shopFronts.push({ x: fp.x, y: fp.y, z: fp.z, rotY: HF.ry, w: S.w, type: sh.type, name: sh.name, lotId: lot.id, style: S.shop.style, real: !!S.real });
    // [v6:c5] a tall vertical (縦書き) board at the street corner of a shop that has one (realnames.js CORNER_VBOARD)
    if (real?.vboard) { const vx = S.w / 2 - 0.4, vy = S.floorY + 3.4; HF.boxB(H.M.plain, '#2f3133', 0.62, 2.5, 0.08, vx, vy - 1.25, S.d / 2 + 0.12); H.card(HF, real.vboard.mat, real.vboard.rect, vx, vy, S.d / 2 + 0.165, 0.5, 2.4); }
  }
  // office / apartment name plate on the facade
  if (tall && lod >= 1 && floors >= 3) {
    const name = real ? real.name : OFFICES[Math.abs(lot.seed) % OFFICES.length];
    out.buildingNames.push({ lotId: lot.id, name, real: !!real });
  }
  // [v4:town-accuracy] a named non-shop building (school, clinic, office, inn, bathhouse) carries its name over the door
  if (real && !isShop) {
    const bw = Math.max(1.4, Math.min(S.w - 0.5, 0.55 * [...real.name].length + 0.7, 6)), bh = bw / real.aspect * 1.2;
    const by = S.floorY + Math.min(2.55 + bh / 2, floors * S.fh - bh / 2 - 0.2);
    HF.boxB(H.M.plain, real.colors[0], bw + 0.12, bh + 0.12, 0.06, 0, by - bh / 2 - 0.06, S.d / 2 + 0.03);
    H.card(HF, real.mat, real.rect, 0, by, S.d / 2 + 0.065, bw, bh);
    out.buildingNames.push({ lotId: lot.id, name: real.name, real: true });
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
