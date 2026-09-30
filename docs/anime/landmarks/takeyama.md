# 武山米店 (魚町): the 1930 rice merchant's house and the 炊飯博物館 storehouse

## Position

| Item | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **武山米店 主屋** | 38.90698, 141.57287 | (−184.6, −108.4) | GSI lot `16/58540/25068/283`: a fan-shaped wedge, 8.6 m wide at the street | OSM node 5162601626 (武山米店), 5965587005 (武山米店店舗及び主屋) |
| **土蔵 (炊飯博物館)** | 38.90697, 141.57294 | (−178.9, −107.4) | GSI lot `16/58540/25068/284`: 8.0 × 13.7 m | OSM node "炊飯博物館" inside it |
| Address | 気仙沼市魚町 1-1-13 | — | — | ja.wikipedia (38°54′25″N 141°34′22″E, within 10 m of the lot) |

- The house fronts **south onto the street**, and its lot is a fan-shaped wedge (扇形の敷地). The 土蔵 stands on the
  next lot to the east, joined by a one-storey link.

## Structure and dimensions

- 主屋: 木造 **2 storeys**, 切妻造, 亜鉛メッキ鋼板葺 (galvanised steel). Built 1930 (昭和 5), **rebuilt April 2018**.
  The front rafters fan out at the eaves (正面の垂木を扇形に配する), and the 2F lower wall is clad in copper (銅板張).
  The rice shop (a business of the early Meiji era) is still open.
- The 土蔵 beside it houses the 炊飯博物館: rice cookers, kamado and exhibits on rice. It is run by registered dietitians.
- Photo ④ (風待ち project report): a dark timber shop front of glazed doors under a pent roof; a band of windows over
  the green copper cladding; a grey roof; the white 土蔵 with its gable to the street, behind a low link roof.
- Model: 1F 3.5 m, eaves +6.5 m, ridge +8.2 m. The main body covers the front 10.5 m of the wedge, and a one-storey back
  wing covers the rest. The 土蔵 has eaves at +5.6 m and its ridge at +7.4 m (pitch 0.6).

## Colours

| Surface | Value |
|---|---|
| Timber front | #4a3a2e / #5a3d2a |
| Copper cladding | #5f9a86 |
| Roof (GSI photo #7ba098) | sheet steel #8a9496 |
| 土蔵 walls / roof | #f3f1ea / #4f5658, with a dark 海鼠壁-style base #3b3d44 |

## In the app

- `harbor/kazemachi.js buildTakeyama`, on both real footprints, with colliders. The layout records `storeys 2`,
  `height 8.2` (土蔵 7.4) and `landmark "kazemachi:takeyama"`. Town leaves both lots out.
- Place 「武山米店・炊飯博物館」 (explore/places.js), with a walk spot on the street facing the front.

## Sources

- ja.wikipedia 武山米店炊飯博物館: https://ja.wikipedia.org/wiki/武山米店炊飯博物館
- 気仙沼観光, 武山米店・炊飯博物館: https://kesennuma-kanko.jp/kazamachi_takeyama/
- 風待ち project report (jsurp.jp, 2023), map and photo ④; OSM nodes 5162601626 and 5965587005 (© OpenStreetMap
  contributors); the GSI z18 aerial photo.
