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
  '16/58538/25067/12': { name: '気仙沼駅', nameEn: 'Kesennuma Station', src: 'GSI facility name over the NewDays kiosk POI' },
  // [v4:polish3] 気仙沼郵便局 (OSM 761265849, building:levels 4 -> 14 m): the z18 photo shows a flat grey roof with a
  // rooftop light well and a lower teal-roofed wing at the back; the derived hip roof over the 41 x 37 m block rose to 17.8 m
  // [v4:polish3] 気仙沼市民会館 is the white hall with the fly tower (OSM relation 12442922, community_centre); the GSI
  // annotation 市民会館 stood on a building of 気仙沼中学校 220 m west, which carried the name
  '16/58540/25069/263': { name: '気仙沼市民会館', nameEn: 'Kesennuma Civic Hall', src: 'OSM relation 12442922 市民会館 (community_centre); z18 photo' },
  '16/58540/25069/128': { clearName: true, src: 'a school building of 気仙沼中学校 (z18 photo): the GSI 市民会館 annotation belongs to OSM relation 12442922' },
  '16/58539/25068/442': { roofShape: 'flat', src: 'GSI seamlessphoto z18: flat grey roof, rooftop light well; OSM building:levels 4' },
  // [v5:fix3] 五十鈴神社: the GSI footprint at the porch's door (17 m², OSM relation r10841412, the shrine's own) is the
  // 向拝 in front of the hall, built by harbor/shinmei.js; town drew it as a house with windows across the entrance
  '16/58541/25068/119': { kind: 'shrine', landmark: 'isuzuShrine', src: 'GSI footprint at the hall door, inside the shrine relation (OSM r10841412); isuzu-jinja.md' },
};

/** [v4:polish3] Place corrections by place id (the GSI annotation that sat on the wrong building). */
export const PLACE_FIX = {
  p1lgul48: { x: -190.0, z: 574.0, lot: '16/58540/25069/263', src: 'osm', fix: 'OSM relation 12442922' },
  pj04sfn: { x: -190.0, z: 574.0, lot: '16/58540/25069/263', src: 'osm', fix: 'OSM relation 12442922' },
};
/** Apply PLACE_FIX to the layout places in place (idempotent). */
export function applyPlaceFix(places) { let n = 0; for (const p of places || []) { const f = PLACE_FIX[p.id]; if (f) { Object.assign(p, f); n++; } } return n; }

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
  if (f.nameEn) lot.nameEn = f.nameEn;
  if (f.landmark) lot.landmark = f.landmark;
  lot.src = { ...(lot.src || {}), fix: f.src };
  if (f.storeys || f.height) lot.src.h = 'ref';
  return true;
}
