# PIER7 (ピアセブン) / 創 (ウマレル): 気仙沼市まち・ひと・しごと交流プラザ

## Position

| Point | lat, lon | ENU (x, z) | Source |
|---|---|---|---|
| Building centroid | 38.90504, 141.57539 | (33.5, 106.6) | OSM way 775150081 |
| Address | 気仙沼市南町海岸1-11 | GSI geocode 38.90535, 141.57494 → (−5, 72) | the city press release |
| Bay-cruise floating piers (two pontoons, each 40 × 10 m, with 25.8 × 5.7 m roofs) | 38.90586, 141.57547 and 38.90555, 141.57570 | (40.5, 15.3) and (60.7, 50.0) | OSM ways 819508304 and 1464061063 (man_made=pier) |

- The building is a long bar of **85 × 18.6 m** (OSM), about 1,195 m² of footprint.
- It follows the curved 南町 seawall on the SW shore of the inner bay, with its long axis NW–SE (133°).
- The app's `SPOTS.pier7` (34.7, 88.8), the photo EXIF of the scale-model capture, lies on the building's bay-side edge,
  18 m from the centroid. That is **correct**: the scale model is displayed inside PIER7.
- The app's `SPOTS.ferryPiers` (40, 10) and (60, 45) are **within 5 m** of the OSM pontoons.

## Dimensions and structure

- **3 storeys, total floor area 2,390 to 2,403 m²** (two sources).
  - Built 2019 by 株式会社アール・アイ・エー (RIA).
  - Construction cost 1.386 billion yen.
  - Opened **2019-04-13**.
  - Award: 日本都市計画学会 計画設計賞 and Good Design.
- **Program by floor:**
  - 1F (probable; the floor is not stated in the sources): tourist information and the bay-cruise ticket office,
    「気仙沼遊覧船発券所PIER7」.
  - 2F: a **light-sports hall** (軽運動室) with a tall timber-lined interior and ribbed timber walls.
  - 3F: meeting rooms 1 and 2, a music studio and a 和室. These are **glazed rooms with timber mullions looking over the
    bay**.
  - Also an FM studio and lounges.
- **Seawall integration.** Part of the 南町 seawall (T.P. **6.2 m**, 4.4 m high, about 243 m long). The building's
  **cantilevered 2F deck covers the seawall**, so from the bay side you see decks, glass and the stepped garden, not the
  wall. 「海とまちをつなぐ建築」.
- It merged two older facilities: 勤労青少年ホーム, formerly in 潮見町, and **エースポート**, the former Oshima ferry
  terminal on this shore.

## Materials and colours

| Surface | Value |
|---|---|
| Roof (ortho) | #edf3f3 → **white / very light grey** #eceeed, flat or very low pitch |
| Facade | full-height glazing with slender timber-coloured mullions (#c9a57a) and white frames or soffits (#f1f1ee) (press photos) |
| Interior (seen through the glass) | warm timber #caa072, pale floors |
| Decks | timber #b08a62 on steel |

## Signage

- 「PIER7」 in Latin letters, the name 「創 ウマレル」, and 「気仙沼市まち・ひと・しごと交流プラザ」.
- Bay cruise: 「気仙沼ベイクルーズ」, run by 大島汽船.

## Current state (2026)

- Open 9:00 to 21:00.
- The **気仙沼ベイクルーズ** (50 minutes, under both bridges) departs from the PIER7 pontoon. The boats are **「ファンタジー」
  and 「やしま丸」**. Commons photos from August 2026 show ファンタジー: white hull, **deep blue bow swoosh #1f4fa8, red
  stern panel #cc2b2b**, blue dots, cabin on two decks, the name in script and katakana.
- The scale model of the inner bay (Sailesh's photos) is displayed inside.

## Sources

- https://www.kesennuma.miyagi.jp/sec/s002/020/030/050/020/080/0107/2019-07-16_kankosyoko.pdf (name, address, opening, the merger with エースポート, the floors)
- https://www.ria.co.jp/architecture-gallery/ (RIA; 2,390 m²; 2019; seawall integration)
- https://design-prize.sakura.ne.jp/archives/result/1932 (土木学会デザイン賞 2022: 3F, 2,403 m², 1.386 billion yen; the 南町 seawall 243 m; cantilevered deck)
- https://www.s-onsite.com/works/001340.html (seawall T.P. 6.2 m, 4.4 m; ステップガーデン)
- https://www.pier7.info/ ; https://kesennuma-kanko.jp/kesennuma_baycruise2025/ (cruise from 南町海岸1-11 PIER7; boats ファンタジー and やしま丸)
- Commons "Oshima Kisen Fantasy at Kesennuma Port 202608a.jpg" and "…202608b.jpg"
- OSM ways 775150081, 819508304, 1464061063, 1464061061 and 1464061062 (© OpenStreetMap contributors). Crop: `ortho/pier7_mukaeru.jpg`

## What the app renders

- `app/pier7_oblique.jpg`, `app/pier7_mukaeru_top.jpg`
- Lot 16/58541/25068/65 is kind `warehouse`, 1 storey, 8.4 m, 54.6 × 22.1 m OBB. The layout's roof colour is white, but it
  renders as a **red-roofed gable warehouse**.

## v5 (2026-10-01): surfaces checked against Google Earth (imagery 2026-03-11)

- **Stepped garden** (`harbor/real.js` `MINAMI.garden`): pale grey concrete paving with long joints, Earth #ada4a0,
  drawn as #c6c3b8 and #b9b6ac. It was timber decking.
- **Three ring planters** (`MINAMI.pits`): white concrete rings about 4.6 m across, around dark soil and low planting.
  Earth and the GSI ortho show no tree crown in them.
- **Landing over the wall, toward the street:** tan stone steps, Earth #ae9a90, drawn as #c7b7a6.
- **Quay yard between PIER7 and the water, and the strip north of the garden:** plain asphalt, Earth #807b83 (the
  same tone as the streets). They are `apron` surfaces in `data/anime/overrides/c6.json`.
- Comparison sheet: `docs/shots/v5_cells/pier7.jpg`.

## v5 fix round 1 (2026-10-01): massing against Google Earth (imagery 2026-03-11)

- **Partial 3F.** 2,390 to 2,403 m² of floor on a 1,195 m² footprint is 2.0 floors, so the 3F is not over the whole bar.
  Earth top and o180 show a **white roof only over the street side** and a **dark grey stepped band on the bay side**
  (lots 17 and 19 on the annotated top, Earth #6d6664 / #504e57).
- The app now builds: 1F and 2F glazed over the whole footprint; the 3F (meeting rooms and studios, white roof) on the
  street-side ~55 % of the depth (`PIER7_SPLIT.upper` in `harbor/minami.js`, 586 m²); the bay-side 2F roof as a dark
  grey terrace that steps down toward the bay in three strips (#6d6664 / #57545b).
- Paler glass (#a9bccb) with white solid panels and vertical timber louvers on the street face; the cantilevered 2F deck
  is pale concrete (#a7a39c) with white rails; a 15 × 3 m 「PIER7」 on the 3F's bay face and 「創 ウマレル」 beside it.
- It was a 3-storey, 13 m, all-blue-glass box over the whole 85 m bar.
- The tour stop's walk spot moved from (51, 69) (nose to the glass) to the head of the stepped garden at (5, 40), yaw
  -130: the ring planters, a pontoon and the bay face are in frame.

## v5 fix round 2 (2026-10-01): roofline, street face and plaza against Google Earth (imagery 2026-03-11)

- **Three roof blocks along the bar** (Earth top, o0, o90, o270; `raw/ref/earth/review2-8851/pier7`). The street-side
  upper storey (`PIER7_SPLIT.upper`) is cut across its long axis at −2.5 m and 40.6 m along E→N (the seams measured on
  the Earth top): a **lower NW block** of ~14 m with only the 2F under a white roof at ~9 m, the **main 3F block** of
  ~43 m (meeting rooms and studios, glazed, ~13 m), and the **SE end block** of ~22 m at ~11 m (the tall 2F light-sports
  hall: white panels with a clerestory). `PIER7_SPLIT.blocks` in `harbor/minami.js`. The bay-side stepped terrace starts
  at the NW seam; beside the NW block the 2F roof stays flat.
- **Street face**: continuous white panels with narrow vertical timber louvers at a 1.1 m pitch (#cdbfa8, a muted pale
  timber) in front of the 2F and 3F. The v5:fix1 face (white panel / louver block / bare glass every 3.6 m) read as an
  apartment block with punched blue windows and orange panels.
- **Ring planters**: a white kerb ring (#e9e7e1) 0.5 m high and 4.6 m across, dark soil and a low dark planting mat; no
  shrub spheres.
- **Landing over the wall**: #b5ab9f (was #c7b7a6, which read salmon at noon).

## v5 photos (2026-10-01): rebuilt against the author's own photos (IMG_0799-0823, 17:18-17:20 JST)

The client's photos outrank Google Earth (docs/anime/OVERRIDES.md). Code: `harbor/minami5.js` (`buildPier7Photos`,
`buildPlazaPhotos`), called from `harbor/minami.js`; pairs: `docs/shots/v5_photos/`.

- **Bay side:** the T.P. 6.2 m seawall is the bay-side ground storey (board-formed concrete). The 2F terrace sits on its
  crest, with a 3.6 m deck on slim white stilts and tie rods (the GSI deck footprints `pier7Deck` / `pier7Deck2`), a
  stainless wire rail hung with string lights, and A-frame stands stored underneath. The fix1 pale cantilever is gone.
- **Massing along the bar:** the NW end is a glazed room on the 2F deck under its own big gable roof. The middle has 2F
  glazing with a dark-brown board band, and the 3F is glazed under a low gable with deep eaves and white rafters. The SE end
  is a white vertical-board block carrying 「PIER7」 and a painting of the bay on its NW face. The 15 m 「PIER7」 on the
  bay face is removed.
- **Street NW corner:** a glass 1F box, a composite deck with steps, and the rust NAIWAN 創 PIER7 totem. A timber stair
  runs up the street face, and the eave is carried on clusters of slender white columns.
- **The plaza is flat at quay level, not stepped.** It has grey-beige pavers with granite-sett bands. The three ring
  benches are 4.6 m white rings with an inner step, a sunken lawn and a young tree. The rest of the plaza holds the 陸閘
  winch, the composite bleachers up to the lawn, the elevated walkway that bridges the gate (迎's deck to PIER7's NW
  face), the white mesh stair cage, the composite stair, and the gate post with its 注意 board.
