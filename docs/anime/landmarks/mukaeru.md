# 迎 (ムカエル): 南町海岸商業施設, plus 結 (ユワエル) and 拓 (ヒラケル)

## Position

| Building | lat, lon | ENU (x, z) | Footprint (OSM) | Source |
|---|---|---|---|---|
| **迎 ムカエル** | 38.90570, 141.57479 | (−18.4, 33.2) | **53.3 × 10.3 m**, NW–SE (150°), 509 m² | OSM way 775150093 |
| 結 ユワエル (commercial) | 38.90531, 141.57440 | (−52.5, 76.2) | 62 × 28 m (a group of small shops) | OSM way 791393332 |
| 拓 ヒラケル (気仙沼アムウェイハウス, since 2020-03-31) | 38.90500, 141.57461 | (−34.2, 111.5) | 48 × 16 m | OSM way 791393331 |
| Address of 迎 | 気仙沼市南町海岸1-14 | — | — | kesennuma-kanko |

- 迎 is the long thin bar on the **west end of the inner bay**, sitting against the seawall. It faces the water to the NE
  and the 内湾 car parks to the SW.
- The DEM gives T.P. 2.7 m at street level.
- Anchor Coffee's inner-bay shop (アンカーコーヒー内湾店) is at 38.90576, 141.57478, inside 迎. So is 内湾の麺食堂 いちりん.

## Dimensions and structure

- **3 storeys, total floor area 1,169 m²**, cost 429 million yen. One tourism page says 2 floors; the design-award record
  says 3F.
  - Program: restaurants (Western and Japanese), cafés, a **shark-leather shop**, clothing, offices.
  - Opened 2018/2019 as the first rebuilt waterfront facility of the 内湾 「スローストリート」.
- **Seaside terrace.** A 2F-level terrace or deck over the seawall looks across the bay to 神明崎 and the moored boats:
  「2Ｆレベルのデッキからは、店のベンチに座り対岸の神社や船が並ぶ内湾を眺められ」.
- Seasonal decoration: wind chimes (風鈴) in summer and illuminations; recotrip mentions 「風鈴やライトアップ」.
- **結 and 拓** are low buildings behind 迎, 1 to 2 storeys (the ortho shows white roofs). The 「スローストリート」
  shopping lane runs between them.

## Colours

| Surface | Value |
|---|---|
| Roof (ortho) | #eaf2f5 → **white** #eceeed. 結 #dce9ec → white, 拓 #e9f1f3 → white |
| Walls | light timber cladding and white render (tourism photos). Treat timber #c7a57c and white #f0efe9 as the palette, and verify on a street photo before final |
| Deck | timber #b08a62 |

## Signage

「迎 MUKAERU」 / 「ムカエル」; tenant names (real names only where OSM has them): アンカーコーヒー, 内湾の麺食堂 いちりん,
Lander Blue (OSM node 7653079710, clothes).

## Current state

All three buildings are open (2026). The 南町 waterfront park (気仙沼漁港南町公園, 6,800 m², July 2020) and the stepped
garden were finished by 2021–2025.

## Sources

- https://kesennuma-kanko.jp/mukaeru/ (tenants, terrace, address, parking)
- https://design-prize.sakura.ne.jp/archives/result/1932 (3F, 1,169 m², 429 million yen, the 2F deck quote, the park area)
- https://www.amway.co.jp/news2020/detail/socialwork20200511_1.html (拓 completed in 2020)
- https://naiwan.info/ (気仙沼地域開発, the operator of the four facilities)
- OSM ways 775150093, 791393331 and 791393332; nodes 7653079709, 7653079711 and 7653079710 (© OpenStreetMap contributors)
- Crop: `ortho/pier7_mukaeru.jpg`

## v5 fix round 1 (2026-10-01): roofline against Google Earth (imagery 2026-03-11)

- Earth top and o180 show a **broken roofline in three sections** (a lower light-grey north wing, a taller dark middle
  block, a white south block) and **tan stepped decks and stairs (#ae9a90)** off the bay face.
- The app splits the upper floors along the NNW-SSE axis at 45 % and 72 % (`MUKAERU_SPLIT` in `harbor/minami.js`:
  roofs -0.7 m / +0.7 m / ±0 against the old 10.7 m roof), draws the 2F bay terrace in tan #ae9a90 (it was timber
  brown), and adds four tan steps from the terrace down to the turf at the NW end (`MUKAERU_STEPS`).

## v5 photos (2026-10-01): 迎, 結, 拓 and the slow street from on-site photos (IMG_0824-0842)

`harbor/minami5.js` (`buildMukaeruPhotos`, `buildSlowStreetPhotos`); `PHOTOS5` in `harbor/minami.js` switches back to the
v5:fix3 迎 and garden, which are kept intact.

- **迎:** the SE end is the ANCHOR café: khaki render, a clerestory with ANCHOR letters, café RST neon, the HAVE A NICE
  COFFEE oval, Lander Blue and SHARKS boards, and a glazed COFFEE DONUTS corner. Behind it rises a tall grey ribbed-metal
  3F box with an external steel stair. The lower NW wings are charcoal boards on the street (「nine one」) and dark timber
  on the bay, under a gull-wing wavy roof. Out front stand the purple NAIWAN 迎 WELCOME HOUSE totem on a composite deck.
- **結:** single-storey cedar-board shops behind a colonnade of weathered posts under a white corrugated fascia, with a
  taller white back volume. It carries BLACK TIDE BREWING (green), the light-blue 結 totem and the 「Kesennuma slow
  street 結」 map board. `zz-photos.json` sets the lots to 1 storey.
- **拓:** white corrugated and grey timber panels, 「Kesennuma Amway House Hirakeru」 and KNEWS, a timber pergola with
  かつお banners, and bollards.
- **The slow street** is a paved pedestrian plaza with red and dark bands and string lights overhead. Road r12645 is removed.
- **Across 魚町港町線:** the convenience store (the c6 solar shed) is drawn as a generic striped storefront with a
  brick end wall and a "7"-style pole sign (no trademark logo). The junction has zebras, a hatched median, ◇ marks and
  banded bollards.

## v5:detail (2026-10-02): the ANCHOR shopfront in full (IMG_0824-0828)

`harbor/minami5.js` `ANCHOR`, `buildMukaeruPhotos`, `buildStreetFront`; kit in `harbor/detail5.js`.

- The ANCHOR face is the 10.4 m street segment P1 (-17.4, 43.4) to P2 (-9.5, 50.1). It has six white-framed clerestory
  panes with the letters behind lit glass, the glazed 2F corner (f 0.72 onward, round onto the SE face), the café RST fascia
  with six gooseneck lamps, the HAVE A NICE COFFEE oval, the Lander Blue and SHARKS boards, two nobori, five bikes, A-boards
  and the soft-cream stand.
- The eave is a folded plate (6.0 m at the box, a crease at f 0.36, 7.95 m at the corner) clipped to A's own outline. The
  old full-width sine strip hung 5 m past the face, which made the wall look curved.
- The 3F grey box stands 2.5 m back from the street, behind a 6.4 m ribbed strip that carries the two-flight steel stair.
- `layout.js` `GROUND_PADS` clamps the DEM to T.P. 2.3 at the SE end. The DEM rose to 5 m there and buried the shopfront in
  a mound.
- The broad composite stair runs along the SE face from the deck to the bay terrace. The totem moved 2 m west (IMG_0824
  bearing).
- The pavement of 魚町港町線 has pavers, a sett line, kerbs, four young street trees and four parked cars.

## v6 survey (2026-10-03)

Measured from on-site photos with solved cameras (53 of 57 photos, 0.72 px): `docs/anime/survey/minami.md`,
`data/survey/minami/features.json`. The plaza's stair cage, bleachers, winch and ring benches, 迎's 3F box and ANCHOR face,
and the NAIWAN totems have surveyed positions; the app's BEFORE errors are in `data/survey/minami/diff-before.json`.

## v6 rebuild (2026-10-03)

Rebuilt to the survey (`harbor/minami5.js` `ANCHOR`, `MUK6`, `ANCHOR_OVAL`, `TOTEM6`, `CAGE6`): the ANCHOR face on its SfM plane
(P1 / P2 moved 0.6-2 m from GSI's), floor T.P. 2.62, the fascia 6.2 / 6.8 / 6.25 m over it, the clerestory T.P. 7.30-8.45, the
glazed corner from T.P. 5.62, café RST, the oval, Lander Blue / SHARKS at their cut heights; the grey 3F box from its two
surveyed coping corners (8.67 m SE face, coping T.P. 14.83, 6.2 m deep); the SE deck at the floor level with four steps and
the 迎 totem at its triangulated glyph (1.6 m); the 20-riser composite stair; the bay terrace now 3 m deep, meeting the white
mesh cage, which carries the terrace on along its 21.3 m (see the plaza in `docs/anime/survey/minami.md`).

## [v6:finish] Final survey numbers (2026-10-04)

迎 / ANCHOR face, fascia heights, the glazed corner, the oval, the totems and the SE deck are among the 62 plaza features that now sit within 0.16 m of the survey (mean 0.035 m;
`data/survey/minami/diff.json`). The ANCHOR letters carry the photo's 102 px pitch (x 1.05 over the old letter spacing); IMG_0911 / 0912 stay at 17-21 px chamfer (wing roofs, cars, wires),
and the 「nine one」 2F bay lettering is still partly hidden by the NW external stair's landing in 0913. Procedure and tools: `docs/anime/SURVEY.md`.
