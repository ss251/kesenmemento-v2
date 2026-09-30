// [v4:explore] More real places for the tour and the places list (V3-SPEC section 10: "the seven tour stops plus 20 or
// more real places"). Every place is a real, named OSM feature (© OpenStreetMap contributors) or a GSI annotation,
// with its position taken from that data (data/anime/layout.json PLACES, scripts/anime/enrich): a shrine, temples,
// the Catholic church, 魚町's historic sake and tea shops, cafés, inns and hotels, the post office, the library, the civic
// hall, a hospital, the court, parks, 大川's 気仙沼大橋, BRT 南気仙沼, the police station, 鹿折's community centre and
// the fish shops of 気仙沼さかなの駅. The civic landmarks landmarks-B models (the station, city hall, schools, hospitals,
// temples, the museum, 大島) come from ctx.services.landmarks.places and are listed too.
//
// `ref` is the feature's name in the data where the listed name is shortened or clearer for visitors.
//
// Framings are computed from the terrain and the street network, not hand-placed: the drone view looks at the place
// from the best of eight directions (clear line of sight over the terrain, over land), the walk spot stands on the
// nearest street, on the kerb nearest the place, facing it. Pure functions of the layout: tested.
export const EXTRA_PLACES = [
  // [v4:integrate] walk: at the torii on the 東浜街道 bend, looking up the stair to the hall (the nearest street is under
  // the wooded slope, where the grove hides the hall)
  { id: 'isuzu', ja: '五十鈴神社', en: 'Isuzu Shrine', cat: 'shrine', at: [362.4, -125.0], src: 'osm', walk: { x: 340.5, z: -158, yaw: -135, pitch: 12, dist: 34.1 } },
  { id: 'otokoyama', ja: '男山本店 魚町直営店', en: 'Otokoyama sake brewery shop (heritage, 1931)', cat: 'shop', at: [-36.6, -54.4], src: 'osm' },
  // [v4:polish1] 角星店舗 (the sake brewery's 1929 shop, rebuilt 2016; harbor/kazemachi.js): the OSM node inside its
  // footprint is named 角星園茶舗
  { id: 'kakuboshi', ja: '角星店舗', en: 'Kakuboshi sake shop (heritage, 1929)', cat: 'shop', at: [-98.1, -39.4], src: 'osm', ref: '角星園茶舗' },
  { id: 'takeyama', ja: '武山米店・炊飯博物館', en: 'Takeyama rice shop and Rice Cooking Museum', cat: 'shop', at: [-184.5, -103.6], src: 'osm', ref: '武山米店' },
  { id: 'mukaeru', ja: '迎（ムカエル）', en: 'Mukaeru (waterfront shops)', cat: 'shop', at: [-19.1, 28.2], src: 'osm', ref: '南町海岸商業施設「迎」' },
  { id: 'mambo', ja: '喫茶マンボ', en: 'Kissa Mambo café', cat: 'food', at: [-160.3, 142.4], src: 'osm' },
  { id: 'plazaHotel', ja: '気仙沼プラザホテル', en: 'Kesennuma Plaza Hotel', cat: 'hotel', at: [306.7, 209.1], src: 'osm' },
  { id: 'fukuikan', ja: '旅館福井館', en: 'Ryokan Fukuikan', cat: 'hotel', at: [77.2, -262.9], src: 'osm' },
  { id: 'uminoichi', ja: '海の市・シャークミュージアム', en: 'Umi-no-Ichi and Shark Museum', cat: 'shop', at: [395.4, 655.7], src: 'osm', ref: '気仙沼 海の市/気仙沼シャークミュージアム' },
  { id: 'parkHotel', ja: '気仙沼パークホテル', en: 'Kesennuma Park Hotel', cat: 'hotel', at: [563.0, 930.4], src: 'osm' },
  { id: 'postOffice', ja: '気仙沼郵便局', en: 'Kesennuma Post Office', cat: 'public', at: [-508.8, -142.6], src: 'osm' },
  { id: 'catholic', ja: 'カトリック気仙沼教会', en: 'Kesennuma Catholic Church', cat: 'church', at: [-340.3, -26.2], src: 'osm' },
  { id: 'kannonji', ja: '観音寺', en: 'Kannon-ji Temple', cat: 'temple', at: [-791.5, 198.9], src: 'gsi' },
  { id: 'hogenji', ja: '法玄寺', en: 'Hogen-ji Temple', cat: 'temple', at: [-115.7, -376.1], src: 'osm' },
  { id: 'atago', ja: '愛宕神社', en: 'Atago Shrine', cat: 'shrine', at: [-502.0, -452.6], src: 'osm' },
  { id: 'library', ja: '気仙沼図書館', en: 'Kesennuma City Library', cat: 'public', at: [-200.9, 440.6], src: 'osm', ref: '気仙沼市図書館' },
  // [v4:polish3] at the hall itself (OSM relation 12442922 市民会館, community_centre; the z18 photo's white hall with its
  // fly tower): the GSI annotation point 220 m west sat on a school building of 気仙沼中学校
  { id: 'civicHall', ja: '気仙沼市民会館', en: 'Kesennuma Civic Hall', cat: 'public', at: [-190.0, 574.0], src: 'osm', ref: '市民会館' },
  { id: 'inawashiro', ja: '猪苗代病院', en: 'Inawashiro Hospital', cat: 'hospital', at: [-205.4, 128.5], src: 'osm' },
  { id: 'court', ja: '気仙沼簡易裁判所', en: 'Kesennuma Summary Court', cat: 'public', at: [113.6, 546.6], src: 'gsi', ref: '気仙沼簡易裁判所' },
  { id: 'okawaPark', ja: '大川公園', en: 'Okawa Park', cat: 'park', at: [-340.7, 992.6], src: 'osm' },
  { id: 'kesennumaOhashi', ja: '気仙沼大橋（大川）', en: 'Kesennuma Ohashi (over the Okawa)', cat: 'bridge', at: [-243.4, 1200.0], src: 'gsi', ref: '気仙沼大橋' },
  { id: 'minamiKesennuma', ja: '南気仙沼（BRT）', en: 'Minami-Kesennuma BRT stop', cat: 'station', at: [91.9, 1190.6], src: 'osm', ref: '南気仙沼' },
  { id: 'nakamachiPark', ja: '仲町・幸町公園', en: 'Nakamachi-Saiwaicho Park', cat: 'park', at: [135.6, 1005.1], src: 'osm' },
  { id: 'sakananoeki', ja: '気仙沼さかなの駅', en: 'Kesennuma Sakana-no-Eki fish market', cat: 'shop', at: [-889.0, 1803.0], src: 'osm', ref: '気仙沼さかなの駅' },
  { id: 'pearlCity', ja: 'ホテルパールシティ気仙沼', en: 'Hotel Pearl City Kesennuma', cat: 'hotel', at: [-1421.1, -350.4], src: 'osm' },
  { id: 'police', ja: '気仙沼警察署', en: 'Kesennuma Police Station', cat: 'public', at: [-424.5, 1964.6], src: 'osm' },
  { id: 'shishiori', ja: '鹿折公民館', en: 'Shishiori Community Centre', cat: 'public', at: [708.3, -1223.8], src: 'osm' },
];

const DIRS = [135, 180, 90, 225, 45, 270, 0, 315];   // degrees from north (clockwise): SE first (the late sun is south-west)

/** Height of the thing at (x, z): the tallest lot within `r` m (its top), else the ground. */
export function topAt(L, x, z, r = 18) {
  let top = L.heightAt(x, z);
  for (const l of L.LOTS) {
    const o = l.obb; if (Math.abs(o.cx - x) > r + 40 || Math.abs(o.cz - z) > r + 40) continue;
    if (Math.hypot(o.cx - x, o.cz - z) > r + Math.max(o.w, o.d) / 2) continue;
    top = Math.max(top, (l.groundY || 0) + (l.height || 0));
  }
  return top;
}

/** A drone framing of (x, z): the first of eight directions with a clear view over the terrain and land below. */
export function droneFraming(L, x, z, { top = null, dist = null } = {}) {
  const t = top ?? topAt(L, x, z);
  const g = L.heightAt(x, z);
  const h = Math.max(8, t - g);
  const D = dist ?? Math.max(70, Math.min(140, 55 + h * 2.2));
  const look = [x, g + Math.min(h * 0.45, 12), z];
  let best = null;
  for (const deg of DIRS) {
    const a = deg * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a);   // the direction the camera sits in, from the place
    const cx = x + dx * D, cz = z + dz * D;
    const cy = Math.max(L.heightAt(cx, cz), 0) + 26 + h * 0.9;
    // line of sight: the terrain stays under the sight line (5 m clearance)
    let clear = true;
    for (let k = 1; k < 12; k++) { const u = k / 12, px = cx + (x - cx) * u, pz = cz + (z - cz) * u, py = cy + (look[1] - cy) * u; if (L.heightAt(px, pz) > py - 5) { clear = false; break; } }
    const score = (clear ? 0 : 10) + (L.isWater(cx, cz) ? 0.5 : 0) + DIRS.indexOf(deg) * 0.05;
    if (!best || score < best.score) best = { score, pos: [+cx.toFixed(1), +cy.toFixed(1), +cz.toFixed(1)], look: look.map((v) => +v.toFixed(1)) };
  }
  return { pos: best.pos, look: best.look };
}

/** [v4:polish1] The walk view's half-angle: a 52 deg wide cone keeps the building's width at 0.6 of the frame. */
export const WALK_HALF = 26 * Math.PI / 180;
/** [v4:polish1] Nothing may stand this close in front of a walk spot (a wall, a trunk, a pole, the place's own facade). */
export const WALK_NEAR = 6;
/** [v4:polish1] Candidate offsets along each street from its point nearest the place (m). */
const WALK_STEPS = [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40, -52, 52];

/**
 * [v4:polish1] How far to stand from a place to see it whole: its own lot (the widest side) fills 0.6 of a 52 deg view,
 * between 25 and 110 m. Without a lot (a park, a bridge, a shrine in a grove) 30 m.
 */
export function viewDistance(lot) {
  const o = lot && lot !== true ? lot.obb : null;
  if (!o) return 30;
  return Math.max(25, Math.min(110, 0.6 * Math.max(o.w, o.d) / Math.tan(WALK_HALF)));
}

/**
 * A walk spot for (x, z) [v4:integrate: chosen for a clear view, not just the nearest kerb]. Candidates: on every street
 * within `R` m, the point nearest the place and points every 8 m up to 52 m either way along it, each moved to the kerb on the
 * place's side (as far in as a footprint allows). A candidate must stand on the road, outside footprints and solids, at
 * least 8 m from the place. Its line of sight to the place (eye 1.6 m up -> the place's body) must clear the terrain,
 * other lots (`lotAt`; the place's own lot and the last 12 m are its facade), solid colliders (`solidAt`, at run
 * time) and tree crowns and trunks (`treeAt`, at run time). [v4:polish1] A candidate whose sight line meets any lot
 * (the place's own included), solid or tree within its first 6 m is dropped: it would stare at a wall, a trunk or a
 * pole. The clear candidate nearest the place's own viewing distance (`viewDistance`: the lot's size, not a fixed
 * 30 m, so a 60 m hall is seen from ~75 m instead of from its own doorstep) wins; if none is clear, the one blocked
 * latest; if none stands at all, the nearest kerb as before. `inLot(x, z)` (boolean) is still accepted.
 */
export function walkFraming(L, net, x, z, { inLot = () => false, lotAt = null, solidAt = null, treeAt = null, R = 150 } = {}) {
  let own = lotAt ? lotAt(x, z) : null;
  // [v4:polish1] a place point just outside its footprint (an OSM node on the forecourt): the biggest lot 6 m round it
  if (lotAt && !own) for (let k = 0; k < 8; k++) { const l = lotAt(x + 6 * Math.cos(k * Math.PI / 4), z + 6 * Math.sin(k * Math.PI / 4)); if (l && (!own || l.obb.w * l.obb.d > own.obb.w * own.obb.d)) own = l; }
  const D = viewDistance(own);
  R = Math.max(R, D + 40);
  const inAny = lotAt ? (px, pz) => !!lotAt(px, pz) : inLot;
  const bad = (px, pz) => inAny(px, pz) || L.isWater(px, pz) || (solidAt && solidAt(px, pz, L.heightAt(px, pz) + 1.0)) || (treeAt && treeAt(px, pz, L.heightAt(px, pz) + 1.6));
  const g0 = L.heightAt(x, z), top = topAt(L, x, z, 10);
  const aimY = g0 + Math.max(1.5, Math.min(10, (top - g0) * 0.55));
  const kerb = (s, t) => {
    const bx = s.a[0] + s.dx * t, bz = s.a[1] + s.dz * t, nx = -s.dz, nz = s.dx;
    const side = nx * (x - bx) + nz * (z - bz) >= 0 ? 1 : -1, off = Math.max(0, s.hw - 0.8);
    for (let k = 0; k <= 6; k++) { const o = Math.max(0, off - k * 0.6), px = bx + nx * side * o, pz = bz + nz * side * o; if (!bad(px, pz) && net.onRoad(px, pz, -0.2)) return [px, pz]; }
    return null;
  };
  /** metres of clear sight from (wx, wz) toward the place (d = all clear; -1 = blocked within WALK_NEAR) */
  const sight = (wx, wz, d) => {
    const ey = L.heightAt(wx, wz) + 1.6, clearR = Math.min(d - 1, 12);
    // [v4:polish1] the first metres: nothing at all in front of the eye, the place's own lot included
    for (let u = 0.5; u <= WALK_NEAR; u += 0.5) {
      const k = u / d, px = wx + (x - wx) * k, pz = wz + (z - wz) * k, py = ey + (aimY - ey) * k;
      if (lotAt ? lotAt(px, pz) : inLot(px, pz)) return -1;
      if (solidAt && solidAt(px, pz, py)) return -1;
      if (treeAt && treeAt(px, pz, py)) return -1;
    }
    for (let u = 1.5; u < d - 0.5; u += 1) {
      const k = u / d, px = wx + (x - wx) * k, pz = wz + (z - wz) * k, py = ey + (aimY - ey) * k;
      if (L.heightAt(px, pz) > py - 0.3) return u;
      if (d - u > clearR) {
        const lot = lotAt ? lotAt(px, pz) : (inLot(px, pz) ? true : null);
        if (lot && (lot === true || lot !== own)) return u;
        if (solidAt && solidAt(px, pz, py)) return u;
        if (treeAt && treeAt(px, pz, py)) return u;
      }
    }
    return d;
  };
  let best = null;
  // the 40 nearest streets (a dense core has hundreds of segments within R)
  const dSeg = (s) => { const t = Math.max(0, Math.min(s.len, (x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz)); return Math.hypot(x - s.a[0] - s.dx * t, z - s.a[1] - s.dz * t); };
  const segs = (net.segmentsNear ? net.segmentsNear(x, z, R) : []).map((s) => [dSeg(s), s]).sort((a, b) => a[0] - b[0]).slice(0, 40).map((q) => q[1]);
  for (const s of segs) {
    const t0 = Math.max(0, Math.min(s.len, (x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz));
    for (const dt of WALK_STEPS) {
      const t = t0 + dt; if (t < 0 || t > s.len) continue;
      const sp = kerb(s, t); if (!sp) continue;
      const d = Math.hypot(x - sp[0], z - sp[1]); if (d < 8 || d > R) continue;
      const u = sight(sp[0], sp[1], d); if (u < 0) continue;
      const clear = u >= d - 0.01;
      const score = (clear ? 0 : 1000 + (d - u) * 4) + Math.abs(d - D) + (s.hw < 2 ? 6 : 0);
      if (!best || score < best.score) best = { score, sp, d };
    }
  }
  let spot = best?.sp || null;
  if (!spot) {   // the nearest kerb (v4:explore behaviour)
    const n = net.nearest(x, z, R); if (!n) return null;
    const nx = -n.dz, nz = n.dx, side = nx * (x - n.x) + nz * (z - n.z) >= 0 ? 1 : -1;
    const off = Math.max(0, n.seg.hw - 0.8);
    for (const along of [0, 3, -3, 6, -6, 10, -10, 15, -15]) {
      for (let k = 0; k <= 6 && !spot; k++) {
        const o = Math.max(0, off - k * 0.6);
        const px = n.x + n.dx * along + nx * side * o, pz = n.z + n.dz * along + nz * side * o;
        if (!bad(px, pz) && net.onRoad(px, pz, -0.2)) spot = [px, pz];
      }
      if (spot) break;
    }
  }
  if (!spot) return null;
  const [wx, wz] = spot;
  const yaw = Math.atan2(-(x - wx), -(z - wz)) * 180 / Math.PI;
  const d = Math.hypot(x - wx, z - wz);
  const pitch = Math.max(-4, Math.min(14, Math.atan2(aimY - (L.heightAt(wx, wz) + 1.6), d) * 180 / Math.PI));
  return { x: +wx.toFixed(1), z: +wz.toFixed(1), yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), dist: +d.toFixed(1), clear: !!best && best.score < 1000 };
}

/**
 * [v4:polish1] Walk spots set by hand where the computed one cannot see the place from a street (checked by
 * screenshot, qa3 near-depth check): the place is behind a grove, a skylight roof, a pole or a slope.
 */
export const WALK_SET = {
  // 海の市: across the 魚市場前 road from the south, the whole 73 m front with the shark museum wing (the computed spot
  // stood on the market's skylight roof)
  uminoichi: { x: 381, z: 732, yaw: -9.8, pitch: 5, dist: 64.9 },
  // 気仙沼市役所 本庁舎: from the forecourt road below ワン・テン, the 74 m front on its terrace, diagonally (the computed
  // spot stood in the grove behind the hall)
  'lm-cityHall': { x: -458, z: -200, yaw: -43.2, pitch: 4, dist: 43.9 },
  // 五十鈴神社: on the stone stair (a walk ramp), 4 m below the old spot, looking up the flight at the hall (362.4, -125)
  // [v4:polish2] (the old yaw -126.5 framed the 社務所 and the stair treads filled the near frame: near6m 0.28)
  isuzu: { x: 351.8, z: -142.2, yaw: -148.5, pitch: 12, dist: 20.2 },
  // 気仙沼大橋 over 大川: on the south levee road downstream, the bridge across the river (the computed spot stood on the
  // deck itself, looking along it)
  kesennumaOhashi: { x: -233, z: 1267, yaw: 31, pitch: 2, dist: 93.3 },
  // 喫茶マンボ: diagonally across its street from the east kerb, clear of the 電柱 that filled the old frame
  mambo: { x: -146.3, z: 132.4, yaw: 125.5, pitch: 6, dist: 17.2 },
  // 風待ち地区: across the waterfront road from each heritage front (the computed spots saw 男山本店's plain side wall)
  otokoyama: { x: -39.5, z: -32.6, yaw: -14, pitch: 12, dist: 16.5 },
  kakuboshi: { x: -94.5, z: -18.3, yaw: 7.1, pitch: 8, dist: 16.1 },
  takeyama: { x: -178.5, z: -85.6, yaw: 29.7, pitch: 8, dist: 16.1 },
  // 気仙沼ハリストス正教会: from the lane below it on the west, the whole nave with the apse and the belfry
  'lm-church': { x: -508, z: -25, yaw: -71.6, pitch: 9, dist: 22.1 },
  // [v4:polish3] chosen by tools/anime/debug/walkprobe.mjs with the renderer's depth (the place's aim point in the frame,
  // the first surface there at least min(0.8 d, d - r - 2) away, < 20 % of the view within 6 m), then checked by
  // screenshot: the computed spots stood under the scaffold, faced a cliff, a grave row, a trunk or the next school
  'lm-newCityHall': { x: -799.6, z: 1313.0, yaw: 60, pitch: 9, dist: 73.0 },            // the frame, the crane and the hoarding across 田中's street
  catholic: { x: -357.8, z: 4.1, yaw: -30, pitch: 2, dist: 37.7 },                      // up the lane to the church grounds on the 南町 slope
  kannonji: { x: -775.5, z: 171.1, yaw: 150, pitch: 4, dist: 32.1 },                    // from the lane below, the long hall over the houses
  plazaHotel: { x: 260.7, z: 129.3, yaw: -150, pitch: 12, dist: 97.4 },                  // from the 港町 car park: the lift tower and the hotel on the bluff
  'lm-oshimaTerminal': { x: 3418.6, z: 4486.4, yaw: 135, pitch: 0, dist: 41.9 },        // the timber terminal across 浦の浜's forecourt
  'lm-seigoji': { x: -294.5, z: 177.8, yaw: 15, pitch: -2, dist: 33.8 },                 // the 入母屋 hall over its stone base from the road below
  library: { x: -147.6, z: 387.3, yaw: 135, pitch: 6, dist: 75.8 },                     // the library block from the road to its south-east
  civicHall: { x: -210.3, z: 498.2, yaw: -165, pitch: 4, dist: 78.7 },                  // the hall and its fly tower from the junction below
  hogenji: { x: -93.4, z: -337.5, yaw: 30, pitch: 2, dist: 44.6 },                      // up the cemetery path to the 入母屋 hall (the old spot faced a gravestone 9 m off)
  'lm-ikkeijima': { x: 538.3, z: 1057.4, yaw: -150, pitch: 0, dist: 43.4 },             // the former islet's grove from the park lawn, the halls inside
};

/** The places as tour stops: { id, ja, en, cat, at, src, drone, walk }. */
export function placeStops(L, net, list, { inLot, lotAt, solidAt, treeAt } = {}) {
  return list.map((p) => {
    const [x, z] = p.at;
    return { ...p, extra: true, drone: droneFraming(L, x, z), walk: WALK_SET[p.id] || p.walk || walkFraming(L, net, x, z, { inLot, lotAt, solidAt, treeAt }) };
  });
}

/**
 * [v4:polish1] Tree crowns and trunks, and utility poles (電柱, `{ x, z, y, top }`, kept 0.9 m clear), as sight
 * blockers, in a 16 m grid.
 */
export function makeTreeAt(trees, poles = []) {
  const G = new Map(), key = (i, j) => i * 100003 + j;
  const put = (t) => { const i = Math.floor(t.x / 16), j = Math.floor(t.z / 16); const k = key(i, j); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(t); };
  for (const t of trees || []) put(t);
  for (const p of poles || []) if (Number.isFinite(p.x) && Number.isFinite(p.z)) put({ x: p.x, z: p.z, y: p.y || 0, h: Math.max(8, (p.top || 0) - (p.y || 0) + 0.5), r: 0, pole: true });
  return (x, z, y) => {
    const i = Math.floor(x / 16), j = Math.floor(z / 16);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const t of G.get(key(i + di, j + dj)) || []) {
      const d = Math.hypot(t.x - x, t.z - z), ty = t.y || 0;
      if (t.pole) { if (d < 0.9 && y < ty + t.h) return true; continue; }
      if (d < t.r * 0.85 && y > ty + t.h * 0.3 && y < ty + t.h) return true;   // the crown
      if (d < 0.5 && y < ty + t.h) return true;                                  // the trunk
    }
    return false;
  };
}
