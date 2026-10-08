# Landmark accuracy log

How the landmarks were checked against reality, and where each one stands. The reality references are the sheets in
this folder; `landmarks.json` is their machine-readable summary.

## Method

- **App.** Screenshots of the production scene (all modules) through `tools/anime/shot.mjs`, at 12:00 JST and
  1280×720: oblique cameras, extra views and top-down views of every landmark. Downscaled copies of the rebuilt
  landmarks are in `app-v4/`.
- **Probes.** Hall and berth data from `window.__ctx.services.harbor`, lot attributes from `data/anime/layout.json`, and
  the bridge-fit maths from `harbor/world.js` (`fitCrossing`, `KANAE_CENTRE`, `KANAE_DEG`).
- **Reality.**
  - The GSI aerial photo z17/z18 with OSM and GSI outlines overlaid: `ortho/*.jpg`.
  - The core DEM (3.7 m) and the city DEM (8 m).
  - OSM (an Overpass extract of 2026-09-30).
  - Official, tourism and engineering pages, and Wikimedia Commons photos (up to August 2026) used only as shape and
    colour references.
- **Date of the ortho.** About 2020–2022: the new market C/D halls, PIER7 and 迎 are complete; the Kanae deck is being
  closed; the old city hospital still stands. Where reality changed after the ortho, the sheets say so.

The target for position accuracy is under 5 m.

## Position accuracy

Every landmark that has an OSM outline is built on it, so its error against that outline is 0 m. The other reference
points:

| Landmark | Reference | Error |
|---|---|---|
| 浮見堂 pavilion | roof square on the ortho (341.6, −23.4) | 0 m |
| 安波山 summit lookout | OSM peak (−493.6, −990.2); DEM maximum 238.5 m at 2.8 m | 0 m |
| 五十鈴神社 hall | OSM node (363.5, −121): it lies inside the rendered hall | 0 m |
| 恵比寿像 | OSM node (359, −22) | 1.2 m |
| かなえ大橋 pylons | ortho measurements of the construction-era photo, refined with the older GSI orthos taken before the deck existed | 3.4 m along the axis |
| 大島大橋 ends | OSM ends (2766, 2856) and (2655, 3194), bearing 108.2° | 0 m at both ends |
| 気仙沼市役所, 気仙沼駅, リアス・アーク美術館, 市立病院, 大友病院 | OSM outlines | 0 m |

The かなえ大橋 reference was refined in `kanae-ohashi.md`: the older orthos show the north pylon's footing on the deck axis,
so the 8–10 m lateral offsets of the construction-era points come from the lean of the elevated deck and the cranes, and
the pylons stand on the surveyed centre line. 15 of 15 reference landmarks are within 5 m (`landmarks.json`, checked by
`tools/anime/accuracy.mjs`).

## How each landmark is built

### Harbour (`src/anime/world/harbor/`; every measured value is in `harbor/real.js` with its source; tests `test/v4-landmarks-a.test.js`)

| Landmark (sheet) | As built | Position |
|---|---|---|
| かなえ大橋 (`kanae-ohashi.md`) | deck on the OSM line (≤ 1 m from GSI RdCL 2703); pylons at s 818 / 1178, 360 m apart, 160 m side spans, south pylon on the quay; one central cable plane (12 stays × 4 per pylon); inverted-Y steel on 15 m RC piers to 115 m; hexagonal girder; 10-span land viaduct | see above |
| 大島大橋 (`oshima-ohashi.md`) | OSM ends, 108.2°, arch 297 m / rise 54 m, spans 24.7 + 40.5 + 224 + 40.5 + 24.7, deck 9.5 m at 34.8 m, white, ladder struts | 0 m at both ends |
| 魚市場 north block and 北側施設 (`fish-market.md`) | rooftop car park on the painted bays, pyramid roof-lights, glazed vault, curved ramp from the street; the shed's quay side is the open 1F unloading hall (walkable) | OSM outlines (0 m) |
| C棟 / D棟 (`fish-market.md`) | closed white halls, 2F glazed observation deck, 気仙沼市魚市場 / 海と生きる lettering, roof terrace; D棟 PV rows and roof hoods; night colour wash | OSM (C); z18 photo ±1.5 m (D) |
| 海の市 (`uminoichi.md`) | red board-and-batten block whose ridge runs NE-SW corner to corner (each corner reads as the photo's A-frame), recessed shop floor, the three panels, east block with the timber roof deck and the footbridge to the market | OSM outline (0 m) |
| 浮見海道 / 浮見堂 (`ukimido.md`) | the vermilion ring walkway round the tip on piles (176 m); the pavilion on the tip's seawall line with a light-grey 宝形造 roof | pavilion 0 m |
| 恵比寿像, 五十鈴神社, 猪狩神社, 社務所 (`isuzu-jinja.md`) | the 2020 standing Ebisu with a bonito; the cream RC hall on its GSI footprint on the knoll, the steep stair and red rails from the road-bend torii; 猪狩神社 and its torii; the one-storey 社務所 | statue 1.2 m, hall 0 m, 猪狩 0 m |
| 魚町 seawall (`seawall-promenade.md`) | T.P. 4.1 m crest, 1.3 m over the pavement, 21 flap gates of 13.9 m along the 293 m crest line measured on the z18 photo (21 × 13.7 m = 288 m of gates; 311 m of works with the ends), 13 rest-deck stairs, footlights; no windows | line ±1 m (z18) |
| 南町 (`pier7.md`, `mukaeru.md`) | PIER7, 迎, 結 and 拓 on their OSM outlines, with the 2F decks over the T.P. 6.2 m wall and two pontoons with membrane canopies; the plaza and the street fronts are rebuilt to the photo survey (`docs/anime/survey/minami.md`) | OSM outlines (0 m) |
| ファンタジー (`oshima-ferry-pier.md`) | the boat at the PIER7 pontoon: 32 × 7 m, blue bow swoosh, red stern panel, blue dots, 'Fantasy' script | - |
| 安波山 (`anbasan.md`) | summit grass clearing with post, benches and a plaque (no gazebo); ひのでのてらす and ほしのてらす (roofed) terraces; the path with log steps and footlights | summit 0 m, ひので 0 m (OSM), ほし ±3 m (z17) |

### Civic landmarks (`src/anime/world/landmarks/`; a world module built after harbor, on the OSM outlines; tests `test/v4-landmarks-b.test.js`)

Every GSI lot a landmark replaces is tagged `landmark` by `scripts/anime/build-layout.js` (`landmarks/sites.js`
`siteOfLotB`), so town and explore skip it. Every reference point of the sheets lies on or within 5 m of its rebuilt
outline.

| Landmark (sheet) | As built |
|---|---|
| 本庁舎 (`city-hall.md`) | 3 storeys of beige-grey render with green-tinted ribbon windows on the OSM outline, the penthouse, the two lattice masts, the entrance canopy, the 「気仙沼市役所」 plate, the pine; the floor follows the DEM (8.4; the hill rises 3 m behind it) |
| 第二庁舎 (`city-hall.md`) | the two-storey former wooden school: dark siding, white 4-pane sashes, a long grey gable roof, the stair bays |
| ワン・テン (`city-hall.md`) | the mauve two-storey base with the teal band and shop glazing, two open parking decks with parked cars on the roof, the corner tower with the 「One-Ten」 logo |
| 田中 old hospital site (`city-hall.md`, `hospitals.md`) | the 21 pre-2022 lots inside OSM 819508282 are gone; the new city hall stands as in September 2026: the B1/1F concrete base, the 2–4F steel frame on the plan grids (45.35 × 54.55 m, 24.75 m high, 実施設計 2024-09), the first white cement-panel band and glazing on the south and east, scaffold sheeting north and west, a crawler crane, site offices, bare earth and white hoarding. The progress on the day is inferred from the schedule (frame 2025–26, completion 2027-10), not from a photo |
| 気仙沼駅 (`kesennuma-station.md`) | one storey on the OSM outline: the five round arches in off-white stone tile, the dark hip roof with the centre gable and its triangular window, the swordfish mural on the square-side slope, the JR board and the blue pillar sign; the covered BRT platform 1 behind the hall, the island platform with its light-blue canopy, the rails of the city (OSM); the square with the white lighthouse 「ようこそ気仙沼へ！」 tower, the カジキマグロ and three カツオ, the taxi rank; an enterable waiting hall (automatic doors, ticket gates, machines, timetable, benches, the tourist desk). The GSI footprint covering the station and its platform roof (83 × 28 m) belongs to the station |
| 駅前プラザ (`kesennuma-station.md`) | a white-roofed two-storey block (its storey count is not verified) |
| リアス・アーク美術館 (`rias-ark.md`) | the ribbed-aluminium gallery bar with its vault and portholes, the main block (pink render below, aluminium above, white vaulted roof), the roof deck and railing, the two salmon-pink pods on tripod stilts, the chimney-mast, the name plate; on its hilltop at T.P. 94 |
| 市立病院 (`hospitals.md`) | the outline as a 3-storey podium with the 6-storey ward bar along the NE edge, rooftop plant, the name, the entrance canopy, the ground-level heliport (OSM helipad) with its H and windsock |
| 大友病院 (`hospitals.md`) | 5 storeys (OSM) on the outline, the mint-green flat roofs, a penthouse and the name |
| Schools (`schools.md`) | the core yards are town's bare earth; the far grounds (気仙沼高, 九条小, 条南中, 鹿折中, 鹿折小, 東陵高) get the same land use from this module. All buildings of the eight grounds are school buildings (grey-white RC with balcony slabs and window bands, barrel-roofed gyms, 7 pools, gates with name plates, 気仙沼小's stair cylinder) |
| Temples, church, 一景島 (`shrines-temples.md`) | 少林寺 and 清護寺 with big 入母屋 tile roofs, white plaster and dark timber, a 向拝 porch and stair; the white church with green copper roofs, the apse, the belfry, the green cupola and the Orthodox cross; the dense dark 一景島 grove with its halls and a torii on the west path; 松尾神社, the 南町 shrine (unnamed), 愛宕神社, 大杉神社, 稲荷大明神 with small halls and torii |
| 亀山 (`oshima-kameyama.md`) | 亀山テラス360°: the monorail (the 亀山通信 overview map registered on 愛宕神社 and 大嶋神社; 376 m along the track against the city's 409 m, 108 m of climb) with two glazed cars that run the 20-minute round trip, the dark-timber 駐車場駅舎 and 待合・休憩棟, the parking, the summit station, terrace 1 (three tiers, 49 sofas), terraces 2 and 3, ほしのてらす, the café, the two kept rest houses (fan-shaped hall; teal-roofed block), the summit post |
| 浦の浜 (`oshima-ferry-pier.md`) | the timber welcome terminal with its bay terrace, the cruise floating pier on its gangway with the 「のりば」 board, the basin jetty |

## Open items

- Not verified from any source: the 5合目 安波山公園 dragons (position unknown), the 五十鈴神社 roof form, 迎's exact
  facade material, やしま丸 (no usable reference) and the 海の市 south canopy.
- The station's platform access (the real 構内 path is not verified), the 駅前プラザ's storeys, the new city hall's exact
  progress and crane type on the day, the 亀山 buildings' materials (drawn from the newsletter's construction photos and
  the image of the terrace), the exact shape of terrace 1 (drawn rectangular; the image shows a curved deck) and the
  welcome terminal's roof colour (the ortho predates it).
- The GSI footprints predate 2022–2024. The 田中 hospital site is the known case; check any other demolition against OSM
  (last edited 2023–2026) before trusting a footprint.
- `data/landmarks.json` labels the capture spot of PIER7 as 第7岸壁, but the spot is inside PIER7 (ピアセブン), the
  community plaza. The tour and the UI say PIER7（ピアセブン）.

## Evidence index

- Ortho with overlays (red = OSM, yellow = GSI hero/mid lots, cyan = far lots, magenta = app anchors, cyan rings = real
  points): `ortho/*.jpg`.
- App frames of the rebuilt landmarks: `app-v4/*.jpg`.
- Machine-readable summary: `landmarks.json`.

## v5 accuracy sweep (2026-10-01)

Twelve 500 × 600 m cells were checked against Google Earth, whose imagery is dated 2026-03-11 and which was used for
reference only. [sys:5] Earth is the 2026-03-11 aerial image draped on the terrain (Kesennuma has no 3D buildings in Earth), so
the obliques carry no building height: every height or storey count in these cells that cites an Earth oblique is to be re-derived from shadows,
ground photos, GSI footprints or OSM levels (`tools/anime/flag-oblique-heights.mjs`). The fixes went into `data/anime/overrides/c1.json` to `c12.json`. Before and after images and the
metrics are in [../../shots/v5_cells/README.md](../../shots/v5_cells/README.md).

- **Landmarks:** the "15 of 15 within 5 m" of the audit was lot containment on layout data (0 m by construction, see section 7), not a
  measurement of the render; the render is now scored separately (`landmarks.buildings` in `tools/anime/accuracy.mjs`).
- **PIER7 / 南町** (`pier7.md`):
  - The terraced garden between 迎 and PIER7 is now pale grey concrete paving, with three white ring planters
    holding low planting. It was a brown timber deck with three tall trees, and both Earth and the GSI ortho show
    white rings with dark centres and no crown.
  - The landing over the wall is tan stone steps.
  - The quay yard in front of PIER7 and the strip north of the garden are plain asphalt (override use `apron`, in
    `c6.json`). Before, they were pale bare ground.
  - Comparison sheet: `docs/shots/v5_cells/pier7.jpg`.
- **気仙沼市役所** (`city-hall.md`): 第二庁舎 and 第三庁舎 now have dark grey roofs and 東分庁舎 a red hipped roof, as in
  Earth 2026. The GSI ortho had them grey and beige.
- **Still open:**
  - The Plaza Hotel model (a white 7-storey tower, where Earth shows lower stepped wings with pale green roofs).
  - The sand beach on 神明崎's west side, where the shore is a concrete revetment.
  - The coastline at 浪板 and 大浦 as it was before the recent shore works: curved beaches and a false inlet at x 1080–1160, z 50–130.
  - The 海の市 deck outline and the number of cars on the market roof.
  - The lawn north of 迎 stays green: it is a lawn, which shows brown in the March imagery.

## v5, second pass (2026-10-01)

A second pass re-rendered the integrated build from the first pass's Google Earth cameras (imagery 2026-03-11, reference
only). It fixed the accuracy blockers below; the scores are `tools/anime/earth-de.mjs` with one registration per
cell (before = the integrated build, after = this pass).

| Cell | Roof ΔE2000 median, before → after | Lots over 20, before → after |
|---|---|---|
| PIER7 | 14.6 → 13.5 | 4 → 3 of 14 |
| c5 | 18.0 → 12.0 | 153 → 72 of 371 |
| c6 | 17.8 → 12.3 | 120 → 58 of 298 |
| c6-a 魚町 | 18.1 → 10.7 | 26 → 15 of 76 |
| c6-c 南町 | 15.1 → 12.6 | 16 → 9 of 53 |
| c6-d | 15.8 → 12.0 | 8 → 8 of 21 |
| c7n 神明崎 | 12.2 → 11.2 | 6 → 4 of 24 |
| c1-c 八日町 | 18.7 → 13.3 | 26 → 17 of 58 |

- **PIER7** (`pier7.md`): three white roof blocks along the bar (NW ~9 m, main 3F ~13 m, SE hall ~11 m), a white
  street face with timber louvers at a 1.1 m pitch, white kerb ring planters with low planting, a #b5ab9f landing.
- **Roof colours**: a GSI → Earth colour transform fitted on the override lots replaces the white balance and the anime
  grade (`enrich/fold.js` `fitRoofTransform`). The photo-coloured roofs of the 12 cells averaged RGB (160, 166, 167)
  with 681 teal roofs; now (151, 146, 148) with 149.
- **Ground**: grass or field covered 34.5 % of the core town's land cover; now 6.8 %. Car parks, aprons, gravel lots,
  building sites and footprints are forced to paving or town ground, and the classes are smoothed (5x5 majority, 1 px
  feather). The 魚市場 land-side strip is an apron (it was pale plaza paving).
- **Hills**: cedar canopy on the c1, c2 and c5 hills; 81 % of the trees there are cedars (was 34 %). New override uses
  `forest`, `cedar` and `felled`: the cedar wood behind 法玄寺 (c2), the 赤土山自然公園 ring (cedar, not lawn) and the
  felled strip above 八日町 (c1).
- **海の市 walk spot** moved to (350, 690), clear of the new office lots.
- **Still open**: the summer-green crowns against the March imagery, the 迎 lawn, the hill trails, the cedar crown tone
  (lighter than Earth's), c1-d's hillside roofs (median 31.8, mostly hidden under crowns).
