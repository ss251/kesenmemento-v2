# 気仙沼市役所 (Kesennuma City Hall): the current offices and the new building under construction

## Position

| Building | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **本庁舎 (main building)**, 八日町1-1-1 | 38.90817, 141.57001 | (−433, −241) | **68 × 31 m** L-shape, 1,206 m², **3 levels** | OSM way 602638650 (building:levels 3); GSI geocode of 八日町1-1-1: 38.90794, 141.57069 |
| 第二庁舎 (the former wooden school building, uphill) | 38.90865, 141.57026 | (−411, −294) | 17 × 48 m, 628 m² | OSM way 819508286 |
| 第三庁舎 | 38.90832, 141.57011 | (−429, −259) | 21 × 11 m | OSM way 819508285 |
| 東分庁舎 / 第二東分庁舎 | 38.90826, 141.57056 / 38.90813, 141.57060 | (−387, −252) / (−384, −237) | 12.6 × 7.4 / 22.7 × 16 m | OSM ways 819508284 and 819508283 |
| **ワン・テン庁舎 (One-Ten)** | 38.90771, 141.57042 | (−397, −190) | 45 × 47 m, 2,076 m², 4 levels (with a parking deck) | OSM way 631751376 (building:levels 4) |
| **New city hall (under construction)**, 田中184 (the old city-hospital site) | 38.89435, 141.56471 | (−892, 1293) | site 26,602 m² | GSI geocode; the city; みやぎ建設新聞 |

- The DEM gives the main building's ground at **T.P. 10.6 m**, on a terrace cut into the forested hill north of 八日町.
  第二庁舎 sits higher, at 19 m.

## Structure and appearance

- **本庁舎.** A 3-storey RC office block (photo; construction year not researched).
  - Grey-beige render #c9c6bd, long horizontal ribbon windows with aluminium sashes.
  - A **rooftop penthouse** (stair and lift tower) plus radio masts.
  - A flat roof: ortho median #b7cecd → light grey #c2c4c0.
  - Stairs climb from the street to the forecourt, with a pine tree and a hedge at the entrance.
- **第二庁舎.** A **2-storey wooden building with weathered dark timber siding** (#5e5448) and white-framed sash windows.
  - A long **dark grey gable roof** (#585d66). The GSI ortho reads #7d918f, but Google Earth (imagery 2026-03-11,
    `raw/ref/earth/c1/B`, reference only) shows it dark; the newer source wins.
- **第三庁舎** (1974): a dark grey flat roof (#51575f, Earth 2026). **東分庁舎** (1960): a **red hipped roof** (#ad6f6c,
  Earth 2026; the GSI ortho had it beige). 第二東分庁舎: pale grey (#c9ccc9).
  - It is a former school building, and it has cars parked along its front.
- **ワン・テン.** A **mauve-pink 2-storey base** (#b8959c) with a teal band (#3f8f94), shop windows at street level, and
  a big **grey concrete multi-storey car park** above (#bdbdb8).
  - A tower carries the 「One-Ten」 script logo.
  - Its sign reads 「気仙沼市役所 ワン・テン庁舎」.
- **New city hall.**
  - Steel frame with partial RC. **B1 + 4F, total floor area 9,222 m²**, plus a single-storey timber annex.
  - Designed by a 久米設計 JV (みやぎ建設新聞). The contractor is 西松建設 (about 10.3 billion yen).
  - **Completion October 2027** (the city also gives "operation in late FY2027").
  - Floors: B1 まちかどギャラリー, 1F citizens' hall and offices, 2F–3F offices, 4F council chamber.
  - The old hospital was demolished between September 2022 and January 2024.

## Signage

The main building carries a vertical 「気仙沼市役所」 name plate at the gate; banners hang on the facade.

## Current state (September 2026)

- The city hall still operates in the 八日町 buildings.
- The 田中 site is an **active construction site** with a steel frame going up. It is **not** the old hospital, which the
  2020-ish ortho and the GSI footprints still show.

## Sources

- https://www.kesennuma.miyagi.jp/li/shisei/170/index.html (the new-building pages); https://www.kensetsu-sinbun.co.jp/miyagi/article/bukken-area3/11771/ (S + partial RC, B1/4F, 9,222 m², completion 2027-10-29, 西松建設)
- https://kahoku.news/articles/20220901khn000033.html (demolition of the old hospital, September 2022 to January 2024)
- https://www.kesennuma.miyagi.jp/sec/s014/shinntyousya/050/20200130101625.html (the site decision)
- Photo references: Commons "Kesennuma City Hall 01.JPG", "Kesennuma City Hall Second Main Office, 2026.jpg", "Kesennuma City Hall One-Ten Office, 2026.jpg"
- OSM ways 602638650, 819508283–6 and 631751376 (© OpenStreetMap contributors); GSI address search
- Crops: `ortho/cityhall.jpg`, `ortho/newcityhall.jpg`

## What the app renders

- `app/cityhall.jpg`: a generic white flat box.
  - The OSM main-building centroid falls on a 152 m² `warehouse` lot (the GSI footprints split the building).
  - 第二庁舎 is a 6-storey (19.8 m) flat-roofed office, although the real building is a 2-storey timber school.
- `app/new_cityhall_site.jpg`: the demolished 気仙沼市立病院 blocks (the pre-2022 GSI footprints) are still rendered.
