# Schools in the core

All school grounds are from OSM (amenity=school areas; © OpenStreetMap contributors). The ground height is from the core
DEM. Kesennuma's schools sit on **hill terraces above the old town**, which is part of what a resident recognises.

| School | Centre lat, lon | ENU (x, z) | Grounds | DEM T.P. | Notes |
|---|---|---|---|---|---|
| **気仙沼市立気仙沼小学校** | 38.90262, 141.57177 | (−311, 357) | 225 × 208 m, 34,631 m² | 36 m | Commons 2025-09 photo: a **3-storey white/light-grey RC building with a cylindrical glass stair tower**, a long bar, a wide **bare-earth schoolyard** (#c9b99a) and a separate gym. A blue **pool** sits at the NW of the grounds (ortho) |
| **気仙沼市立気仙沼中学校** | 38.90088, 141.57135 | (−289, 539) | 237 × 166 m, 28,922 m² | 34 m | Directly south of the elementary school on the same ridge. Classroom bars in grey and white, a gym, a large dirt field. The field's green artificial or natural pitch shows on the ortho north-east |
| 気仙沼市図書館 (the library, next to the schools) | 38.90203, 141.57274 | (−196, 437) | building 42 × 55 m | — | OSM way 768699248. The library is a newer building (the year is not researched); white roof |
| **宮城県気仙沼高等学校** | 38.89520, 141.55897 | (−1358, 1168) | 221 × 177 m, 34,984 m² | 41 m | Courtyard-plan classroom blocks (grey), a big blue-grey-roofed gym, a dirt field NE |
| 気仙沼市立九条小学校 | 38.89360, 141.55349 | (−1869, 1385) | 128 × 132 m | 55 m | Just outside the core grid (city grid) |
| 気仙沼市立鹿折中学校 | 38.91768, 141.58963 | (1271, −1297) | OSM area | — | 鹿折 district, north |
| 気仙沼市立鹿折小学校 | 38.92202, 141.58206 | (614, −1778) | OSM area | — | 鹿折 |
| 気仙沼市立条南中学校 | 38.88991, 141.56211 | (−1044, 1786) | OSM area | — | 田中前 / 条南 area |
| 東陵高等学校 | 38.92157, 141.59337 | (1596, −1728) | OSM area | — | private, 鹿折 east hill |

Colour notes (ortho and photo):

- School walls white/light grey #e6e8e6 with grey window bands.
- Roofs flat light grey #c9ccc9; gyms blue-grey #6f8698.
- Yards compacted earth #c9b99a; pools #3d8fc9.

## Which building is the gym [r3:16]

The area / box-ratio rule (550 to 2600 m2, ratio up to 1.9) drew five classroom buildings as 8 m barrel-roofed hangars (気仙沼小 /73, 気仙沼中 /126, 鹿折中 /196 (a U round a garden, fill 0.49), 気仙沼高 /24 (a U round a lawn,
fill 0.44), 条南中 /168), so `landmarks/sites.js` `SCHOOL_INFO.<ground>.kindOverride` is now the per-lot table: gyms 気仙沼小 /64, 気仙沼中 /100, 気仙沼高 /39 /35, 鹿折中 /195, 条南中 /170, 鹿折小 /69 (pitched roof),
東陵高 /31 (pitched roof); blocks /73 (2 storeys, flat roof with planters, Commons 2025-09-28), /126, /24, /429, /531, /196, /168; sheds 気仙沼高 /38 (a 570 m2 low annex). The rule stays as the fallback for an unlisted lot, now with
polygon fill >= 0.85 (`schools.js polyFill`). `buildSchools` first swaps the true footprints of the far school lots in from explore.json (`patchLots`; the landmarks module builds before explore), so /24 and /196 keep their open
courtyards. 九条小 lies outside the 8192 px core ortho; an Earth 2026-03-11 capture (top, o0) decided it: /307 (678 m2, 33 x 21 m) is the red pitched-roof gym beside the pool (listed as a gym, roof gable by `outside cells (九条小, far zone).json`), /362 the long flat-roofed block. Every school roof in the data is flat, so no roof test can tell blocks from gyms.

## Sources

- OSM ways 415669878, 415669877, 768699248, 415669879, 765653828, 104964823, 762601688, 415669837 and 768032842
- Commons "Kesennuma city Kesennuma elementary school 202509.jpg"
- Core DEM; GSI seamlessphoto (`ortho/schools_core.jpg`, `ortho/hs_kujo.jpg`)

## In the app

- The core yards are town's bare earth, and the far grounds (気仙沼高, 九条小, 条南中, 鹿折中, 鹿折小, 東陵高) get the same
  land use from the landmarks module.
- All buildings of the eight grounds are school buildings: grey-white RC with balcony slabs and window bands,
  barrel-roofed gyms, 7 pools, gates with name plates, and 気仙沼小's stair cylinder.
