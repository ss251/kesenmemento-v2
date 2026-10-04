# 気仙沼湾横断橋 (Kesennuma Bay Crossing Bridge, nickname かなえおおはし)

Reference sheet for v4. ENU is as in `src/core/geo.js`.

## Position (measured on the aerial photo)

The GSI ortho was taken while the deck was being closed. It shows the crane barge at the north pylon, the pylon's long
shadow and a closure crane at mid-span. These fix the pylons to about ±8 m:

| Point | lat, lon | ENU (x, z) | Notes |
|---|---|---|---|
| North pylon (P-N) | 38.89367, 141.59272 | (1537, 1369) | in the water; the DEM gives 0 |
| South pylon (P-S) | 38.89090, 141.59069 | (1361, 1676) | on the 朝日町 quay apron (DEM 2.7 m), not in the water |
| Main-span centre | 38.89229, 141.59170 | (1449, 1522) | the closure crane on the ortho |
| Whole bridge (OSM way 964443110) | centre 38.88953, 141.59005 | (1191, 2003) | 1,341 × ~13 m; its SW end is on land (朝日町 → 気仙沼中央 side) |

- **[v4:integrate] Refined reference.** The older GSI orthos taken before the deck existed (xyz layers `ort` and
  `nendophoto2019`, z18 tile 234176/100285) show the north pylon's footing at water level: two blue leg bases straddle
  the OSM / GSI deck line, and the footing centre is **(1543.8, 1373.8)**, 1.6 m off that line. So the pylons stand on the
  surveyed axis, and the 8–10 m lateral offsets of the points above come from the lean of the elevated deck and cranes in
  the construction-era photo. `landmarks.json` now uses the footing centre for P-N and the projection of P-S on the
  axis, **(1367.7, 1679.9)**; the raw points are kept as `*_ortho2020`. Main-span centre: (1456.4, 1527.2).
- The pylons are 354 m apart on the ortho (360 m nominal).
- The axis runs at about 30° east of north (SSW to NNE). In the app's `atan2(dz, dx)` convention that is **120°**, which
  matches `KANAE_DEG`.
- The Wikipedia coordinate 38°53′36.4″N 141°35′33.1″E, that is (1520, 1394), lies 30 m from P-N.

## Dimensions

| Item | Value | Source |
|---|---|---|
| Total length | 1,344 m: sea part 680 m + land part 664 m | Wikipedia (ja); 長大 |
| Sea part | 3-span continuous steel cable-stayed bridge, **160 + 360 + 160 m** | 土木学会デザイン賞 2024 |
| Land part | 3 + 7 span continuous steel box girders (鋼3+7径間連続箱桁) | 長大 |
| Pylons | **steel, inverted Y (逆Y型)**, octagonal section. Structural height **100.0 m**, about **115 m above sea**. They stand on an **RC pier 15 m high** (a concrete base that keeps vessels clear of the steel) | デザイン賞; 大日本ダイヤコンサルタント |
| Pylon form | a single column in the upper part that divides into two legs lower down, joined by smooth curves. The legs straddle the deck and splay out toward the RC base | デザイン賞; photos |
| Cables | a **single plane in the median (1面吊り)**, a semi-fan of about 11 to 13 stays per side per pylon | デザイン賞; photos |
| Girder | a **flattened hexagonal** steel box (扁平六角形) | デザイン賞 |
| Deck width | standard **10.5 m** (1.75 + 3.50 + 3.50 + 1.75), widened to **13.0 m** at the emergency stops. Wikipedia gives sea part 14.0 m and land part 12.0 m, which includes the cable median | デザイン賞; Wikipedia |
| Lanes | 2 (Sanriku Coast Expressway, 三陸沿岸道路 気仙沼道路) | Wikipedia |
| Navigation clearance | **32 m** | Wikipedia |
| Opened | 2021-03-06 | Wikipedia |
| Lights | aviation obstruction lights on the pylon tops; a restrained white night light-up and deck lighting | Wikipedia; デザイン賞 |

## Colours

- Everything is white: the pylons, the girder, the cables and the railings. In shade it reads light grey.
- Palette: pylon and girder #eef0ee (shade #c9ced3); stays #f4f5f2; RC pier bases, light concrete #c8c6bd.
- Deck: asphalt #5f6368 with white edge lines.

## Signage

Portal signs read 三陸沿岸道路 / 気仙沼湾横断橋 and are expressway-green. The nickname is かなえおおはし; in the ortho era
it sat on a plaque, not on the overhead signs.

## Current state

Open since March 2021. 気仙沼港IC (the 気仙沼港 junction, exit 25; OSM node at 38.88008, 141.58535) is at ENU (896, 2866),
south of the land viaduct. The north end lands at 浪板.

## Sources

- https://ja.wikipedia.org/wiki/気仙沼湾横断橋
- https://design-prize.sakura.ne.jp/archives/result/2575 (土木学会デザイン賞 2024: spans, pylon form and height, 1面吊り, girder, width)
- https://www.chodai.co.jp/news/2023/06/015059.html (鋼製逆Y型主塔, 3+7径間連続鋼箱桁 + 3径間連続鋼斜張橋)
- https://www.dd-con.co.jp/field/bridge/kesennuma-baycrossing.html (pylon 115 m above sea, 15 m RC pier)
- Photo references: Wikimedia Commons 「気仙沼湾横断橋.jpg」 and "Kesennuma Bay Crossing Bridge at night.jpg"
- OSM way 964443110 (© OpenStreetMap contributors); GSI seamlessphoto z18. Crops: `ortho/kanae.jpg`, `ortho/kanae_towers.jpg`

## In the app

- The deck follows the OSM line (≤ 1 m from GSI RdCL 2703). The pylons stand at s 818 and 1178 along it, 360 m apart,
  with 160 m side spans and the south pylon on the quay.
- One central cable plane (12 stays × 4 per pylon); inverted-Y steel pylons on 15 m RC piers rising to 115 m; a
  hexagonal girder; the 10-span land viaduct.
- Frames: `app-v4/kanae_oblique.jpg`, `app-v4/kanae_walk.jpg`, `app-v4/kanae_night.jpg`.
