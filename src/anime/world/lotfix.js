// [v4:polish1] Per-lot corrections from references, where the derived or tagged values are wrong and the data cannot
// say better. build-layout.js applies them when it writes data/anime/layout.json, and layout.js applies them again at
// load, so an older layout.json gives the same town. Each entry names its source.
//
// 気仙沼プラザホテル (柏崎 1-1, 65 rooms, pkanyo.jp): on the 柏崎 bluff over 港町, a stepped white tower of 7 storeys
// with a brown-and-white crown carrying the logo (Wikimedia Commons "Kesennnuma plaza hotel 20130601.JPG", Opqr, 2013:
// six window rows over the bridge level plus the entrance floor), a lower wing of 5 storeys to the south with the
// 「海とふれあい 気仙沼プラザホテル」 sign box, and the glass lift tower with its bridge down to the お魚いちば (pkanyo.jp
// facility page). GSI traces the tower with the bluff's foot, so the derived ground was the cliff foot (T.P. 4.0) and
// the building sank into the hill; the DEM gives T.P. 25.4 under the tower and 21.1 under the wing.
//
// 気仙沼駅: GSI traces the station and its island-platform roof as one footprint; OSM matched the NewDays kiosk inside
// it, so the lot was named after the kiosk. The GSI facility name wins (build-enrich / fold precedence, v4:polish1).
// The hotel is modelled by harbor/plaza.js (its six footprints carry landmark 'plazaHotel', so town, the mid builder
// and explore leave them).
export const LOT_FIX = {
  '16/58541/25068/142': { kind: 'hotel', storeys: 7, height: 26.9, groundY: 25.2, roofShape: 'flat', landmark: 'plazaHotel', src: 'photo: Commons 2013 (Opqr): 7 storeys + the crown; DEM T.P. 25.4 under the tower; pkanyo.jp' },
  '16/58541/25069/27': { kind: 'hotel', storeys: 5, height: 16.0, groundY: 21.0, roofShape: 'flat', name: '気仙沼プラザホテル', landmark: 'plazaHotel', src: 'photo: Commons 2013 (Opqr), the south wing with the sign box; DEM T.P. 21.1' },
  '16/58541/25068/141': { kind: 'hotel', storeys: 1, height: 4.0, groundY: 24.5, roofShape: 'flat', landmark: 'plazaHotel', src: 'the hotel podium on the bluff (GSI z18 roof)' },
  '16/58541/25068/137': { kind: 'landmark', storeys: 1, height: 3.6, groundY: 25.8, roofShape: 'flat', landmark: 'plazaHotel', src: 'the lift bridge (pkanyo.jp: 直結のエレベーター; the photo)' },
  '16/58541/25068/136': { kind: 'landmark', storeys: 8, height: 29.0, roofShape: 'flat', landmark: 'plazaHotel', src: 'the glass lift tower (the photo)' },
  '16/58541/25068/135': { kind: 'landmark', storeys: 1, height: 3.6, roofShape: 'flat', landmark: 'plazaHotel', src: 'the lift hall at the tower foot' },
  // サンマリン気仙沼ホテル観洋 (港町 4-19, 67 rooms, kesennuma-kanko.jp): a curved wing along the 港町 slope (T.P. 18-22)
  // and a tower block on its low harbour side (T.P. 6) whose shadow falls ~12 m over the wing roof on the z18 photo:
  // one flat roof at T.P. 28 over the whole outline (built on the true polygon: town/mid.js oddBig)
  '16/58541/25069/307': { kind: 'hotel', storeys: 7, height: 22.0, roofShape: 'flat', src: 'z18 photo shadow + DEM (T.P. 6-22 under the outline); kesennuma-kanko.jp 67 rooms' },
  // [v6:c9r3] the 幸町 gas holder is a sphere (landmarks/gasholder.js), not the 14 m drum town would build on the override lot
  'ovr:c9:gas-holder': { landmark: 'gasHolder', src: 'Earth 2026-03-11 c9 C top/o270/l45: a spherical holder about 15 m across; built by landmarks/gasholder.js' },
  '16/58538/25067/12': { name: '気仙沼駅', nameEn: 'Kesennuma Station', src: 'GSI facility name over the NewDays kiosk POI' },
  // [v4:polish3] 気仙沼郵便局 (OSM 761265849, building:levels 4 -> 14 m): the z18 photo shows a flat grey roof with a
  // rooftop light well and a lower teal-roofed wing at the back; the derived hip roof over the 41 x 37 m block rose to 17.8 m
  // [v4:polish3] 気仙沼市民会館 is the white hall with the fly tower (OSM relation 12442922, community_centre); the GSI
  // annotation 市民会館 stood on a building of 気仙沼中学校 220 m west, which carried the name
  '16/58540/25069/263': { name: '気仙沼市民会館', nameEn: 'Kesennuma Civic Hall', src: 'OSM relation 12442922 市民会館 (community_centre); z18 photo' },
  '16/58540/25069/128': { clearName: true, src: 'a school building of 気仙沼中学校 (z18 photo): the GSI 市民会館 annotation belongs to OSM relation 12442922' },
  // [v6:c5] the OSM bank tag on the low flat-roofed block at (-584, -164) (三日町一丁目) is stale: 七十七銀行 has exactly two
  // branches in 気仙沼, 501 気仙沼支店 at 南町3-1-1 (OSM way 819508306, lot 16/58540/25068/296) and 502 内脇支店 at 田中前
  '16/58539/25068/353': { clearName: true, clearUse: true, src: 'zengin: 七十七 気仙沼支店 is at 南町3-1-1 (lot 16/58540/25068/296)' },
  '16/58539/25068/442': { roofShape: 'flat', src: 'GSI seamlessphoto z18: flat grey roof, rooftop light well; OSM building:levels 4' },
  // [v5:fix3] 五十鈴神社: the GSI footprint at the porch's door (17 m², OSM relation r10841412, the shrine's own) is the
  // 向拝 in front of the hall, built by harbor/shinmei.js; town drew it as a house with windows across the entrance
  '16/58541/25068/119': { kind: 'shrine', landmark: 'isuzuShrine', src: 'GSI footprint at the hall door, inside the shrine relation (OSM r10841412); isuzu-jinja.md' },
  // [v6:c5] the red-roofed building at (-311, 261) carries OSM's 気仙沼図書館 (w761699215, n5162609831) and 放送大学
  // (n8660784318) tags from the temporary-library years; the library was rebuilt on its original site at 笹が陣3-30
  // (OSM w768699248, lot 16/58540/25069/191) and the OUJ study room is inside it. Its current use is not established.
  '16/58540/25069/81': { clearName: true, clearUse: true, src: 'OUJ facilities list 2026: 視聴学習室 at 笹が陣3-30 (気仙沼図書館); NDL: library rebuilt on its original site 2018; the OSM library/放送大学 tags here date from the temporary-library years' },
  // [v6:c11] 魚市場前5-4: OSM w768698009 '（旧）気仙沼魚市場前郵便局' (amenity=post_office). The office moved to 仲町2-1-30-4 and
  // became 気仙沼仲町郵便局 on 2021-05-19 (lot 16/58541/25070/90); the building still stands, its 2026 use is unverified,
  // so the kind stays and only the name and the post-office use go (no red 郵便局 board, no post_office search hit).
  // [r2:12] イオン気仙沼 (OSM supermarket, 72 x 149 m, 10 407 m2): Commons 'AEON Kesennuma 202509a.jpg' (2025-09-19) shows a flat-roofed 2-storey mall with a roof deck
  // and green railings, the main body about 11-12 m, a beige stair block and a square magenta sign box (#d6247f-ish, white AEON logos) rising to about 23 m over the
  // entrance bay. The derived 2 storeys / 6.1 m / mono-pitch roof drew a 46 m wedge (the pitch x the 149 m depth, no cap). The sign tower is town/signtower.js (LOT_TOWER);
  // the colours (wall #e6d6cf, roof #bfb8b2) are in data/anime/overrides (LOT_FIX cannot set them).
  '16/58540/25072/110': { roofShape: 'flat', storeys: 2, height: 11.5, name: 'イオン', nameEn: 'AEON', src: 'Commons AEON Kesennuma 202509a (2025-09-19)' },
  '16/58542/25070/15': { clearName: true, clearUse: true, src: 'Japan Post storeinformation id=4928: 気仙沼魚市場前郵便局 moved to 仲町2-1-30-4 as 気仙沼仲町郵便局 on 2021-05-19; the building still stands (Earth 2026-03-11, c11/C #64), current use unknown' },
};

/** [v4:polish3] Place corrections by place id (the GSI annotation that sat on the wrong building). */
export const PLACE_FIX = {
  p1lgul48: { x: -190.0, z: 574.0, lot: '16/58540/25069/263', src: 'osm', fix: 'OSM relation 12442922' },
  pj04sfn: { x: -190.0, z: 574.0, lot: '16/58540/25069/263', src: 'osm', fix: 'OSM relation 12442922' },
  // [v6:c6] OSM n7653079722 '角星園茶舗' (shop=tea) sits inside 角星店舗 (魚町2-1-17, the 角星 sake brewery's shop,
  // kesennuma-kanko.jp/kazamachi_kakuboshi): no tea shop of that name exists, and the lot itself carries 角星店舗 (c6.json)
  // p1i6dceq is the place the lot carried under the OSM name (older layout.json); once the lot is renamed, the OSM node
  // itself is no longer folded into it by name and comes back as pg5mbvm
  p1i6dceq: { drop: true, fix: 'kesennuma-kanko: 魚町2-1-17 is 角星店舗; no 角星園茶舗 exists' },
  pg5mbvm: { drop: true, fix: 'OSM n7653079722 角星園茶舗: kesennuma-kanko: 魚町2-1-17 is 角星店舗; no 角星園茶舗 exists' },
  // [v6:c6] OSM n8660809118 carries the school's old name 晃陽学園 気仙沼リアス調理専門学校; the lot now has the name on its
  // sign and on koyo-gakuen.ac.jp/rias (気仙沼リアス調理製菓専門学校, c6.json), so the node would list the school twice
  pg4c6vy: { drop: true, fix: 'OSM n8660809118 (old name): koyo-gakuen.ac.jp/rias + IMG_0822 sign 気仙沼リアス調理製菓専門学校' },
  // [v6:c11] 気仙沼中央公民館 (329-seat hall, community centre, gym) opened 2021-12 at 内の脇一丁目16番6号 by the 大川 (OSM way
  // 1056818841, no GSI footprint yet). The old site, 魚市場前1-1 (lot 16/58541/25070/106, 旧河北ビル), is now 気仙沼市魚市場前庁舎
  // (overrides/c11.json): city page sec/s234/010/020/20210812202208.html (2026-05-20) puts the 教育サポートセンター on its 3rd floor.
  // p1lj9pmj is the lot's place under the old OSM name (older layout.json); once c11.json renames the lot it is pqzjlyl.
  // The OSM node n5762739642 (気仙沼市中央公民館, p1ny88at) sat on that lot, and the build drops an OSM POI on a lot whose name an
  // override has set (build-layout.js extras), so p1ny88at no longer comes out of the build: `add` re-creates it at the new hall.
  // The title and h1 of the city page and OSM way 1056818841 name the new hall 気仙沼中央公民館.
  p1ny88at: { add: true, name: '気仙沼中央公民館', nameEn: 'Kesennuma Central Community Hall', cat: 'community_centre', group: 'amenity', x: 55.4, z: 1388.1, lot: null, src: 'osm', osm: 'w1056818841', fix: 'OSM way 1056818841 centroid and name; city page edu/s175/1329378202067.html (h1 気仙沼中央公民館): 内の脇一丁目16番6号 (opened 2021-12)' },
  p1lj9pmj: { name: '気仙沼市魚市場前庁舎', nameEn: 'Kesennuma City Uoichibamae Office', cat: 'government', fix: 'former 中央公民館 temporary site (旧河北ビル); city 2026-05-20 page' },
  pqzjlyl: { nameEn: 'Kesennuma City Uoichibamae Office', cat: 'government', fix: 'former 中央公民館 temporary site (旧河北ビル); city 2026-05-20 page' },
  // [v6:c5] the 放送大学 study room and the stale library node sat on lot 16/58540/25069/81 (see LOT_FIX)
  pxclbh2: { x: -200.9, z: 440.6, lot: '16/58540/25069/191', src: 'osm', fix: 'OUJ: 放送大学 気仙沼視聴学習室 is inside 気仙沼図書館, 笹が陣3-30 (OSM way 768699248)' },
  // [v6:c5] the two OSM bank places at (-584, -164) are the stale tag (see LOT_FIX); n4782509927 is the real 気仙沼支店 node
  // (南町3-1-1) and merges with pm9uqzz by name and distance; the other copy is dropped
  pdixzyk: { x: -106.9, z: 19.4, lot: '16/58540/25068/296', src: 'osm', fix: 'branch at 南町3-1-1' },
  p58etji: { drop: true, fix: 'zengin: no 七十七 branch at (-584, -164); the real 気仙沼支店 is pm9uqzz on lot 296 (南町3-1-1)' },
  // [v6:c5r3] OSM n5164583236 (セブン-イレブン 気仙沼三日町店) lies exactly on the NW vertex of the care home's way 761402304 (a mapper's snap); the shop is
  // closed and no shop building stands for it, so the place is dropped (no pill, no コンビニ / 7-Eleven hit). Lot /310 stays the care home
  // (p1fntvx5 / p7toz7h). Source: yahoo-maps 閉店 2025-02-21. See data/anime/overrides/c5 (west edge).json
  p7gaiqd: { drop: true, fix: 'yahoo-maps: 閉店 2025-02-21 (セブン-イレブン 気仙沼三日町店, OSM n5164583236 snapped onto the care home way w761402304)' },
  pq0eloj: { drop: true, fix: 'stale OSM node n5162609831 from the temporary library; the library is pa2yyyv on lot 191' },
  // [v6:c2r3] OSM n1217259090 carries the English name inside the Japanese text and sits 31 m from the building (199, -325): the old
  // nursery site (c2.json removes the demolished footprint /217); the nursery is p1cnm8pz on lot 16/58541/25067/204 (Earth 2026-03-11 pin ~ (194, -345))
  ppbxzyx: { drop: true, fix: 'stale OSM node n1217259090 at the demolished old nursery site; the nursery is p1cnm8pz on lot 16/58541/25067/204' },
};
/** Apply PLACE_FIX to the layout places in place (idempotent); a fix with `drop: true` removes the place. */
export function applyPlaceFix(places) {
  if (!places) return 0;
  let n = 0;
  // `add: true` entries are places the build no longer produces (see p1ny88at); added once, by id
  for (const [id, f] of Object.entries(PLACE_FIX)) {
    if (!f.add || places.some((p) => p.id === id)) continue;
    const { add, ...p } = f; void add;
    places.push({ id, nameEn: null, ...p }); n++;
  }
  for (let i = places.length - 1; i >= 0; i--) {
    const f = PLACE_FIX[places[i].id]; if (!f || f.add) continue;
    if (f.drop) places.splice(i, 1); else Object.assign(places[i], f);
    n++;
  }
  return n;
}

/** Apply LOT_FIX to a layout lot in place (idempotent). Returns true when the lot was changed. */
export function applyLotFix(lot) {
  const f = LOT_FIX[lot?.id]; if (!f) return false;
  if (f.kind) lot.kind = f.kind;
  if (f.storeys) lot.storeys = f.storeys;
  if (f.height) lot.height = f.height;
  if (f.groundY != null) lot.groundY = f.groundY;
  if (f.roofShape && lot.roof) lot.roof.shape = f.roofShape;
  if (f.name) lot.name = f.name;
  if (f.clearName) { delete lot.name; delete lot.nameEn; }
  if (f.clearUse) delete lot.use;   // [v6:c11] a former use (e.g. a post office that moved away)
  if (f.nameEn) lot.nameEn = f.nameEn;
  if (f.landmark) lot.landmark = f.landmark;
  lot.src = { ...(lot.src || {}), fix: f.src };
  if (f.storeys || f.height) lot.src.h = 'ref';
  return true;
}
