# Landmark accuracy audit, v4 (2026-09-30)

This audit compares what the app renders today (the v3 build committed at `aecdce6`) with reality, as documented in the
landmark sheets in this folder.

## Method

- **App.** Screenshots of the production scene (all modules) through `tools/anime/gate.sh chrome` and `shot.mjs`, on port
  8822, at 12:00 JST and 1280×720. There were three runs: 26 oblique cameras, 9 extra views, and 6 top-down views.
  - Raw PNGs: `shots/landmarks/app_*.png`, `app2_*.png`, `top_*.png` (gitignored).
  - Downscaled copies: `app/*.jpg`.
- **Probes.** Hall and berth data from `window.__ctx.services.harbor`. Lot attributes from `data/anime/layout.json`, read
  at 04:10Z; another package rewrote that file later the same day (the roofs gained `conf`, `ridge` and `photo`).
  Bridge-fit maths from `harbor/world.js`: `fitCrossing`, `KANAE_CENTRE`, `KANAE_DEG`.
- **Reality.**
  - The GSI aerial photo z17/z18, with OSM and GSI outlines overlaid: `ortho/*.jpg`.
  - The core DEM (3.7 m) and city DEM (8 m).
  - OSM (Overpass private.coffee mirror, 2026-09-30).
  - Official, tourism and engineering pages, and Wikimedia Commons photos (up to August 2026) used only as shape and
    colour references.
- **Date of the ortho.** About 2020–2022: the new market C/D halls, PIER7 and 迎 are complete; the Kanae deck is being
  closed; the old city hospital still stands. Where reality changed after the ortho, the sheets say so.

Severity: **S1** means a resident would say "that's wrong" at first glance. **S2** is a visible inaccuracy. **S3** is a
detail. The owner is the package that owns the code (V3-SPEC section 4).

## 1. Position accuracy (V3-SPEC section 10 target: < 5 m)

| Landmark | App | Reality | Error | Verdict |
|---|---|---|---|---|
| 浮見堂 pavilion | (341.6, −23.4) | roof square on the ortho (341.6, −23.4) | **0 m** | ✅ |
| 安波山 summit lookout | (−493.6, −990.2) | OSM peak (−493.6, −990.2); DEM max 238.5 at 2.8 m | **0 m** | ✅ |
| 五十鈴神社 hall | (363, −126) | OSM node (363.5, −121) | **5 m** | ✅ borderline |
| PIER7 pontoons | (40, 10), (60, 45) | OSM (40.5, 15.3), (60.7, 50.0) | **5.3 / 5.0 m** | ⚠ just over |
| PIER7 spot | (34.7, 88.8) | building centroid (33.5, 106.6) | 18 m (the spot is on the bay-side face) | ✅ as a camera spot |
| Fish market spot | (595.9, 777.1) | north-facility centroid (594.6, 795.2) | 18 m | ✅ as a camera spot |
| **かなえ大橋 north pylon** | (1582, 1309.5) | (1537, 1369) ±8 | **74 m** | ❌ S1 |
| **かなえ大橋 south pylon** | (1402, 1621.3) | (1361, 1676) ±8, on the quay | **69 m** | ❌ S1 |
| かなえ大橋 main-span centre | (1492, 1465.4), `KANAE_CENTRE` | (1449, 1522) | **72 m** (71 m along the axis, 9 m across) | ❌ S1 |
| かなえ大橋 axis | 120° | 120.3° (between the measured pylons) | 0.3° | ✅ |
| 大島大橋 ends | fitted at 105°, half 178 m | OSM ends (2766, 2856), (2655, 3194) at 108.2° | **9–10 m** at the ends, 3.2° | ⚠ S2 |
| Torii of 五十鈴神社 | (340.5, −150) | at the bend of 東浜街道 (text sources) | not measurable (the torii is under trees on the ortho) | — |

Measured summary: 3 of 7 point landmarks are within 5 m. The bridges fail: Kanae by about 70 m, Oshima by about 10 m.

## 2. Discrepancies, by landmark

### かなえ大橋 (`kanae-ohashi.md`; owner: harbor)

1. **S1 · the main span is 72 m NNE of its real place.**
   - `KANAE_CENTRE` (1492, 1465.4) should be about **(1449, 1522)**.
   - The south pylon must stand **on the 朝日町 quay apron** (DEM 2.7 m), not in the water. `app/kanae_side.jpg` shows
     both pylons at the water.
2. **S1 · two cable planes; reality has one.** The real bridge is 1面吊り: a **single central plane**, a semi-fan of
   about 12 stays per side per pylon, anchored in the deck median. `bridges.js` draws `for s of [-1, 1]` to the deck edges.
3. **S2 · the pylon is 15 m too low.**
   - The app's top is at y = 100. Reality: **115 m above the sea**, 100 m of steel on a **15 m RC pier**.
   - The app has no RC pier stage.
4. **S2 · span layout.** Reality is **160 + 360 + 160 m** cable-stayed plus 664 m of steel box-girder viaduct on the
   land, 1,344 m in total. The app uses sides of `min(160, 0.9 × end distance)` from a centre that is shifted.
5. S3 · the girder is a **flattened hexagon** (扁平六角形), and the deck is 10.5 m (13 m at the emergency stops). The
   app uses 13 m everywhere. The towers are octagonal. The whole bridge is white; this is correct.

### 大島大橋 (`oshima-ohashi.md`; owner: harbor)

1. S2 · the axis is 105° instead of **108.2°**; set `deg: 108` in `fitCrossing` for Oshima. The ends are 9 to 10 m off
   OSM.
2. S2 · `deckY` is 30. Reality: **clearance ≥ 32 m**, so the deck surface is at about 34 to 35 m. Arch: **span 297 m,
   rise 54 m**; spans 24.7 + 40.5 + 224 + 40.5 + 24.7; width 9.5 m (a 2.5 m walk plus 2 × 3.5 m).
3. S3 · the ribs read grey-blue in the render. Reality is **pure white** with ladder portal struts (`app/oshima_side.jpg`).

### 気仙沼市魚市場 (`fish-market.md`; owner: harbor, plus town for C and D)

1. **S1 · the north facility's roof is a car park.** The 300 to 359 m quay shed has a **flat concrete roof with parking
   bays, parked cars, grey pyramid roof-lights and a curved ramp** at the north end.
   - The app builds white gable halls with skylight strips (`app/market_north.jpg`).
2. **S1 · the new C棟 (195 m) and D棟 (135 m, a PV roof) are not market buildings in the app.**
   - C is a mid `factory` lot rendered as a green gable shed with an orange lean-to (`app/market_c_oblique.jpg`). Real:
     a closed white hall, a 2F observation deck, a rooftop view terrace.
   - D is a generic white box with no PV rows (`app/market_d.jpg`).
   - Only 4 landmark halls exist: (395, 656), (449, 603), (537, 657) and (618, 822).
3. **S1 · 海の市 is drawn as a market hall.** Lot 16/58541/25069/401 is tagged `landmark: 'fishMarket'` and becomes a
   72 × 45 m white hall (`app/uminoichi.jpg`).
   - Real: a **huge red board-and-batten A-frame gable** (#bb5954) with white 「気仙沼 海の市 / シャークミュージアム」 and
     「UMI ICHI」 panels (`uminoichi.md`).
4. S3 · night: the C and D halls have full-colour LED floodlights (Dynapainter2), and the app has none.

### 浮見堂 and 神明崎 (`ukimido.md`, `shinmeizaki.md`, `isuzu-jinja.md`; owner: harbor)

1. **S1 · the walkway form is wrong.**
   - Real: the vermilion **浮見海道 rings the perimeter of the peninsula tip** over the water, 2 to 2.5 m wide. The
     client's scale model shows the red rim.
   - The app has a straight arched jetty running north from the pavilion to the rocks (`app/ukimido.jpg`).
2. S2 · the pavilion sits **on the tip's seawall line**, half on the rock and half on piles, not free-standing out in the
   bay.
   - Its roof is **light grey** (ortho → #9aa3a2), not dark tile.
   - Its footprint is about 6.5 to 7 m square including the eaves. The app's 4.6 m posts plus 2.2 m of roof overhang is
     close.
3. S2 · **五十鈴神社 is a cream-painted RC hall** (a 「コンクリートでできた小さな社」), reached by a **steep stair**.
   - The app builds a plain-wood 神明造 with 千木 and 鰹木, and a copper roof.
4. S2 · the app has no **3rd-generation standing 恵比寿像 (2020, holding a カツオ)** at (359, −22), and no 猪狩神社 with
   its torii at (348, −52).
5. S3 · the sea-side torii at the jetty's shore end is an app invention; no source mentions it. Keep or drop it
   deliberately.
6. S3 · the 神明崎 west side is a **wide sloping concrete revetment** (#c4c6bf); the app mostly has rocks.

### Inner-bay seawalls (`seawall-promenade.md`; owner: harbor)

1. **S1 · the 魚町 wall is concrete with flap gates, not a timber boardwalk.**
   - Real: crest **T.P. 4.1 m**, only **1.3 m above the pavement**, a 311 m run, a **1 m flap-gate band** (21 gates of
     13.7 m), stepped rest decks, 陸閘, night lighting and pink-red block paving.
   - The app has a wooden plank deck and a wooden handrail (`app/promenade_walk.jpg`).
2. S1 · **"sea-view windows"** (V3-SPEC section 1, BUILDER-GUIDE): the real wall has **none**. It was deliberately kept low
   so the sea shows over it. Correct the spec text.
3. S2 · **南町** (243 m, T.P. 6.2 m, 4.4 m high) is hidden behind the cantilevered 2F decks of 迎 and PIER7, a
   **stepped garden (ステップガーデン)** and a **sloped lawn**. None of these are modelled.
4. S3 · lengths: the app has promenade 384 m and seawall 123 m (hero); reality has 311 m and 243 m.

### PIER7 / 迎 / 結 / 拓 (`pier7.md`, `mukaeru.md`; owner: town, plus harbor for the pontoons)

1. **S1 · PIER7 is a 3-storey glazed timber-and-white civic building.**
   - It is 85 × 18.6 m, 2,403 m², with timber mullions and a white flat roof.
   - The app renders a **1-storey red-roofed gable warehouse** (lot `warehouse`, 8.4 m; `app/pier7_oblique.jpg`).
2. **S1 · 迎 is a 3-storey commercial bar** (53 × 10 m, 1,169 m²) with a 2F bay terrace and a white roof. The app renders
   a **1-storey 8.3 m red/orange gable warehouse**.
3. S2 · the layout already stores white roofs for both lots (#d8dbd6), but the hero warehouse kit **ignores
   `lot.roof.color`** and paints them red. Check `town/` warehouse roof material selection.
4. S2 · 拓 renders as a 4-storey hip-roofed apartment (11.6 m). Reality: a low 1 to 2-storey community house with a white
   roof.
5. S2 · the moored boat at the PIER7 pontoon is the fictional ferry 「うみねこ丸」.
   - The Oshima ferry **ended on 2019-04-07**.
   - Since then, the **気仙沼ベイクルーズ** boats **「ファンタジー」** (white, a deep blue bow swoosh, a red stern) and
     **「やしま丸」** use this pontoon.

### 気仙沼市役所 (`city-hall.md`; owner: town)

1. S2 · the main building (a 3-storey RC block, 68 × 31 m, T.P. 10.6 m terrace, penthouse) has a generic white box
   render. Its OSM centroid falls on a 152 m² `warehouse` lot, so the GSI footprints split it.
2. S2 · **第二庁舎 is a 2-storey wooden former school** (dark weathered siding, a grey gable roof). The app has a
   **6-storey 19.8 m flat-roofed office**.
3. S2 · the **ワン・テン庁舎** (a pink-mauve base, a teal band, a concrete parking deck, the 「One-Ten」 logo tower) has no
   identity.
4. **S1 (currency) · the old city hospital at 田中184 was demolished in 2022–2024.** The site is now the **new city hall
   construction site** (B1 + 4F, S + RC, 9,222 m², completion October 2027). The app still draws the hospital blocks
   (`app/new_cityhall_site.jpg`) from the pre-2022 GSI footprints.

### JR/BRT 気仙沼駅 (`kesennuma-station.md`; owner: town / foundation far lots)

1. **S1 · broken geometry.** Two overlapping far lots (an 83 × 27.7 m shed and a 56 × 15 m 5-storey apartment) produce
   intersecting roofs (`app/station.jpg`).
   - Real: a **single-storey, 66.6 × 14.7 m** building with a **5-arch off-white arcade**, a dark roof with the **swordfish
     mural**, a JR green sign, an island platform plus BRT bays, and the station square with its sign tower and fish
     sculptures.
2. S3 · the 駅前プラザ (27 × 25 m, white roof) renders as a 6-storey office. Its real storey count is not verified;
   check it before changing anything.

### リアス・アーク美術館 (`rias-ark.md`; owner: town far lots)

- S2 · a 6-storey white box (`app/riasark.jpg`). Real: an 88.6 × 41.6 m, 3-level, ship-like body in ribbed aluminium with
  **two salmon-pink pods on stilts** on the roof deck (石山修武, 1994), on a hilltop at T.P. 94 to 104 m.

### 安波山 (`anbasan.md`; owner: harbor)

- S3 · the summit is a **small grass clearing, about 20 × 25 m**. No gazebo is visible on the ortho.
  - The app's 12 × 7 m timber deck and roofed gazebo is plausible but not supported. Keep it modest, or use benches and a
    summit post.
  - Missing: **ひのでのてらす** (6合目, at about (−513, −692)), **ほしのてらす** (8合目), and the dragon-themed **安波山公園**.

### 大島 / 亀山 / 浦の浜 (`oshima-kameyama.md`, `oshima-ferry-pier.md`; owner: environment / harbor)

1. S2 · **亀山テラス360° opened on 2026-07-19**: a summit terrace, a rest house, a café and a **monorail from the foot
   (6 to 7 minutes)**. The app summit is bare (`app/kameyama.jpg`).
2. S2 · **浦の浜** has no pontoon, no 浦の浜 ウエルカムターミナル and no boat basin (`app/uranohama.jpg`).
3. S3 · 亀山's height: the city DEM gives 231.7 m against the official 235 m, because the 8 m grid smooths the summit.

### Schools, hospitals and temples (`schools.md`, `hospitals.md`, `shrines-temples.md`; owner: foundation land cover, plus town)

1. **S1 · schoolyards are drawn as forest.** 気仙沼小 has a 34,631 m² precinct with a large bare-earth yard
   (#c9b99a), and the app covers the yard with trees (`top_0` vs `ortho/schools_core.jpg`). The pool and pitch are
   missing too.
2. S2 · 大友病院: the app has 4 storeys and a slate hip roof. Reality: **5 storeys, mint-green flat roofs** (ortho
   #9acdbe), next to the 8-storey キングス・タウン.
3. S2 · 市立病院 is a single 142 × 67 m slab. Reality: a multi-wing SRC building with seismic isolation, 6 storeys built
   (7F legal + B1), 8,174 m² footprint, a heliport.
4. S3 · temples are generic houses: no 入母屋 roofs, no 山門, no torii. **気仙沼ハリストス正教会** (a white church with a
   green roof and a spire on the 魚町 hillside, visible from the bay) has no model.
5. S3 · 一景島神社 grove renders as a pale green blob. Reality: a dense dark grove.

## 3. Spec and data corrections for the coordinator

- V3-SPEC section 1 and the BUILDER-GUIDE describe "the seawall with its sea-view windows". The real 魚町 wall has
  **flap gates and no windows**. Rewrite as "the low flap-gate seawall you can see over".
- V3-SPEC section 4 lists "the Oshima ferry". Since 2019 the boats are the **bay-cruise boats ファンタジー and やしま丸**
  from PIER7.
- V3-SPEC section 1 wow frame 4 says 浮見堂 is "the small pavilion over the water". It is at the tip, half over the
  water, and ringed by the red walkway.
- `data/landmarks.json` `pier7` is labelled 第7岸壁. The capture spot is **inside PIER7 (ピアセブン), the community
  plaza**, not a quay number. Suggested label: 「PIER7（ピアセブン）」.
- The GSI footprints predate 2022–2024. At least the 田中 hospital site is out of date. Check any other demolitions
  against OSM (last edited 2023–2026) before trusting a footprint.

## 4. Priority fix list for the next agents

1. harbor: move かなえ大橋 to the measured centre (1449, 1522) and put the south pylon on the quay. Use a single central
   cable plane, 115 m pylons on 15 m RC piers, and 160 + 360 + 160 m spans.
2. harbor: rebuild the market as its **real four parts**: the north facility with a flat parking roof and ramp, C棟, D棟
   with PV, and **海の市 as the red A-frame**. Stop tagging the 海の市 lot as `fishMarket`.
3. harbor: 浮見海道 as a ring walkway round the tip; a grey-roofed pavilion on the tip seawall; the 恵比寿像; the RC
   cream shrine hall and stair.
4. harbor and town: the 魚町 flap-gate seawall (T.P. 4.1 m, 1.3 m above the pavement); the 南町 stepped garden and lawn;
   PIER7 and 迎 as 3-storey white and timber-and-glass buildings with 2F decks over the wall.
5. town: fix the station (one building plus an arcade), 第二庁舎, the city-hall site under construction, 大友病院, and the
   Rias Ark pods.
6. foundation: land cover must treat school yards and parking as bare ground, not forest. Add 亀山テラス and the
   monorail, and the 浦の浜 terminal.
7. life/harbor: replace うみねこ丸 with ファンタジー.

## 5. Evidence index

- Ortho with overlays (red = OSM, yellow = GSI hero/mid lots, cyan = far lots, magenta = app anchors, cyan rings = real
  points): `ortho/*.jpg`.
- App frames: `app/*.jpg`. The full-resolution PNGs are in `shots/landmarks/`.
- Machine-readable summary: `landmarks.json`.

## 6. Status after v4:landmarks-A (2026-09-30)

Rebuilt in `src/anime/world/harbor/` from the sheets; every measured value is in `harbor/real.js` with its source.
After-frames: `app-v4/*.jpg` (the before-frames are `app/*.jpg`). Tests: `test/v4-landmarks-a.test.js`.

| Item (section 2 / 4) | Now | Position error |
|---|---|---|
| かなえ大橋 main span, pylons | deck on the OSM line (≤ 1 m from GSI RdCL 2703); pylons at s 818 / 1178, 360 m apart, 160 m side spans, south pylon on the quay; one central cable plane (12 stays × 4 per pylon); inverted-Y steel on 15 m RC piers to 115 m; hexagonal girder; 10-span land viaduct | along the axis 2.5 / 3.1 m from the ortho measurements; their 8-10 m lateral offset is the photo's lean of the elevated deck (the pylons sit on the surveyed centre line) |
| 大島大橋 | OSM ends, 108.2°, arch 297 m / rise 54 m, spans 24.7 + 40.5 + 224 + 40.5 + 24.7, deck 9.5 m at 34.8 m, white, ladder struts | 0 m at both ends |
| 魚市場 north block + 北側施設 | rooftop car park (355 parked cars on the painted bays), pyramid roof-lights, glazed vault, curved ramp from the street; the shed's quay side is the open 1F unloading hall (walkable) | OSM outlines (0 m) |
| C棟 / D棟 | closed white halls, 2F glazed observation deck, 気仙沼市魚市場 / 海と生きる lettering, roof terrace; D棟 PV rows and roof hoods; night colour wash | OSM (C); z18 photo ±1.5 m (D) |
| 海の市 | red board-and-batten block whose ridge runs NE-SW corner to corner (each corner reads as the photo's A-frame), recessed shop floor, the three panels, east block with the timber roof deck and the footbridge to the market | OSM outline (0 m) |
| 浮見海道 / 浮見堂 | the vermilion ring walkway round the tip on piles (176 m), the pavilion on the tip's seawall line with a light-grey 宝形造 roof; the straight jetty and the sea-side torii are gone | pavilion 0 m |
| 恵比寿像, 五十鈴神社, 猪狩神社, 社務所 | the 2020 standing Ebisu with a bonito; the cream RC hall on its GSI footprint on the knoll, the steep stair and red rails from the road-bend torii; 猪狩神社 and its torii; the one-storey 社務所 | statue 1.2 m, hall 4.2 m (node vs footprint centroid), 猪狩 0 m |
| 魚町 seawall | T.P. 4.1 m crest, 1.3 m over the pavement, 21 flap gates of 13.9 m along the 293 m crest line measured on the z18 photo (21 × 13.7 m = 288 m of gates; 311 m of works with the ends), pink block paving, 13 rest-deck stairs, footlights; no windows | line ±1 m (z18) |
| 南町 | PIER7 3F glazed / timber mullions / white roof, 迎 3F timber + render, 結 2F, 拓 1F, the 2F decks over the T.P. 6.2 m wall, the stepped garden with 3 tree pits, the lawn, two pontoons with membrane canopies | OSM outlines (0 m) |
| ファンタジー | replaces うみねこ丸 at the PIER7 pontoon: 32 × 7 m, blue bow swoosh, red stern panel, blue dots, 'Fantasy' script | — |
| 安波山 | summit grass clearing with post, benches and a plaque (no gazebo); ひのでのてらす and ほしのてらす (roofed) terraces; the path with log steps and footlights | summit 0 m, ひので 0 m (OSM), ほし ±3 m (z17) |

Still open (not verified from any source, or outside this package): the 5合目 安波山公園 dragons (position unknown), the
五十鈴神社 roof form, 迎's exact facade material, やしま丸 (no usable reference), the 海の市 south canopy, the station,
city hall site, schools, hospitals, 亀山 and 浦の浜 (other packages). The spec text "sea-view windows" (V3-SPEC section 1)
should read "the low flap-gate seawall you can see over".

## 7. Status after v4:landmarks-B (2026-09-30)

The civic landmarks are rebuilt in `src/anime/world/landmarks/` (a world module built after harbor) on their OSM outlines;
every GSI lot they replace is tagged `landmark` by `scripts/anime/build-layout.js` (`landmarks/sites.js` `siteOfLotB`), so
town and explore skip it. Positions: every reference point of the sheets lies on or within 5 m of its rebuilt outline
(`test/v4-landmarks-b.test.js`); the accuracy audit gives 0 m for 気仙沼市役所, 気仙沼駅, リアス・アーク美術館, 気仙沼市立病院
and 大友病院 (`dist/qa4lmB/accuracy_lmB.json`).

| Sheet item | Now |
|---|---|
| 本庁舎 (S2) | 3 storeys of beige-grey render with green-tinted ribbon windows on the OSM outline, the penthouse, the two lattice masts, the entrance canopy, the 「気仙沼市役所」 plate, the pine; the floor follows the DEM (8.4; the hill rises 3 m behind it) |
| 第二庁舎 (S2) | the two-storey former wooden school: dark siding, white 4-pane sashes, a long grey gable roof, the stair bays |
| ワン・テン (S2) | the mauve two-storey base with the teal band and shop glazing, two open parking decks with parked cars on the roof, the corner tower with the 「One-Ten」 logo |
| 田中 old hospital (S1 currency) | the 21 pre-2022 lots inside OSM 819508282 are gone; the new city hall stands as in September 2026: the B1/1F concrete base, the 2–4F steel frame on the plan grids (45.35 × 54.55 m, 24.75 m high, 実施設計 2024-09), the first white cement-panel band and glazing on the south and east, scaffold sheeting north and west, a crawler crane, site offices, bare earth and white hoarding. The progress on the day is inferred from the schedule (frame 2025–26, completion 2027-10), not from a photo |
| 気仙沼駅 (S1) | one storey on the OSM outline: the five round arches in off-white stone tile, the dark hip roof with the centre gable and its triangular window, the swordfish mural on the square-side slope, the JR board and the blue pillar sign; the covered BRT platform 1 behind the hall, the island platform with its light-blue canopy, the rails of the city (OSM); the square with the white lighthouse 「ようこそ気仙沼へ！」 tower (Commons "Kesennuma station Front.JPG"), the カジキマグロ and three カツオ, the taxi rank; an enterable waiting hall (automatic doors, ticket gates, machines, timetable, benches, the tourist desk) |
| 駅前プラザ (S3) | a white-roofed two-storey block (its storey count is still not verified) |
| リアス・アーク (S2) | the ribbed-aluminium gallery bar with its vault and portholes, the main block (pink render below, aluminium above, white vaulted roof), the roof deck and railing, the two salmon-pink pods on tripod stilts, the chimney-mast, the name plate; on its hilltop at T.P. 94 |
| 市立病院 (S2) | the outline as a 3-storey podium with the 6-storey ward bar along the NE edge, rooftop plant, the name, the entrance canopy, the ground-level heliport (OSM helipad) with its H and windsock |
| 大友病院 (S2) | 5 storeys (OSM) on the outline, the mint-green flat roofs, a penthouse and the name |
| schoolyards (S1) | the core yards are town's bare earth; the far grounds (気仙沼高, 九条小, 条南中, 鹿折中, 鹿折小, 東陵高) get the same land use from this module. All buildings of the eight grounds are school buildings (grey-white RC with balcony slabs and window bands, barrel-roofed gyms, 7 pools, gates with name plates, 気仙沼小's stair cylinder) |
| temples, church, 一景島 (S3) | 少林寺 and 清護寺 with big 入母屋 tile roofs, white plaster and dark timber, a 向拝 porch and stair; the white church with green copper roofs, the apse, the belfry, the green cupola and the Orthodox cross; the dense dark 一景島 grove with its halls and a torii on the west path; 松尾神社, the 南町 shrine (unnamed), 愛宕神社, 大杉神社, 稲荷大明神 with small halls and torii |
| 亀山 (S2) | 亀山テラス360°: the monorail (the 亀山通信 overview map registered on 愛宕神社 and 大嶋神社; 376 m along the track against the city's 409 m, 108 m of climb) with two glazed cars that run the 20-minute round trip, the dark-timber 駐車場駅舎 and 待合・休憩棟, the parking, the summit station, terrace 1 (three tiers, 49 sofas), terraces 2 and 3, ほしのてらす, the café, the two kept rest houses (fan-shaped hall; teal-roofed block), the summit post |
| 浦の浜 (S2) | the timber welcome terminal with its bay terrace, the cruise floating pier on its gangway with the 「のりば」 board, the basin jetty |

Still open: the station's platform access (the real 構内 path is not verified), the 駅前プラザ's storeys, the new city hall's
exact progress and crane type on the day, the 亀山 buildings' materials (drawn from the newsletter's construction photos
and the image of the terrace), the exact shape of terrace 1 (drawn rectangular; the image shows a curved deck), the
welcome terminal's roof colour (the ortho predates it).

## 8. Status after v4:integrate (2026-09-30)

- **かなえ大橋:** the reference is refined. The pre-deck GSI orthos (`ort`, `nendophoto2019`) show the north footing on
  the deck axis, so the construction-era points were off sideways by the photo's lean. The pylons now sit 3.4 m along
  the axis from each measurement (see kanae-ohashi.md).
- **五十鈴神社:** the OSM node lies inside the rendered hall, so the error is 0 m, scored like the other buildings.
- **気仙沼駅:** the GSI footprint covering the station and its platform roof (83 × 28 m, "NewDays") is now the
  station's. Before this, town and explore drew it as a giant grey shed over the modelled station (`shots/v4int/st_0.png`,
  after: `docs/shots/v4_station.png`).
- **Spec corrections done:** section 1 and section 4 of V3-SPEC now describe the flap-gate wall, 浮見堂 ringed by 浮見海道,
  and ファンタジー. The tour and UI say PIER7（ピアセブン）.
- **Still open:**
  - The accuracy audit could not be re-run after these fixes. The machine gate refused Chrome from 13:52Z, when another
    project's Blender job pushed swap to 5.8 GB. The last full audit is `dist/qa4lmB/accuracy_lmB.json`: building IoU
    0.863, and 12 of 15 landmarks under 5 m.
  - Carried over: the 5合目 dragons, the 五十鈴神社 roof form, 迎's facade material, やしま丸 and the 海の市 south canopy.


## 9. Status after the v5 accuracy sweep (2026-10-01)

Twelve 500 × 600 m cells were checked against Google Earth 3D, which has imagery dated 2026-03-11 and was used for
reference only. The fixes went into `data/anime/overrides/c1.json` to `c12.json`. Before and after images and the
metrics are in [../../shots/v5_cells/README.md](../../shots/v5_cells/README.md).

- **Landmarks:** 15 of 15 are within 5 m, before and after (`dist/qa5/v5/accuracy_core_after.json`,
  `lm_core_after_*.jpg`).
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
  - The pre-reconstruction coastline at 浪板 and 大浦: curved beaches and a false inlet at x 1080–1160, z 50–130.
  - The 海の市 deck outline and the number of cars on the market roof.
  - The lawn north of 迎 stays green: it is a lawn, which shows brown in the March imagery.

## 10. Status after v5 fix round 2, part A (2026-10-01)

Review round 2 re-rendered the integrated build from the round-1 Google Earth cameras (imagery 2026-03-11, reference
only). Part A fixed the accuracy blockers below; the scores are `tools/anime/earth-de.mjs` with one registration per
cell (before = the review build, after = this round).

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
