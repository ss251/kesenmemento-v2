# 男山本店店舗 (魚町): the 1931 three-storey sake shop

## Position

| Item | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **男山本店店舗** (OSM "男山本店 魚町直営店", shop=alcohol) | 38.90649, 141.57458 | (−36.6, −54.4) | GSI lot `16/58540/25068/327`: 9.3 × 11.9 m (110 m²); the record gives a building area of 173 m² | OSM way 966913931, GSI |
| Address | 気仙沼市魚町 2-2-14 | — | — | 文化遺産オンライン 138818 |

- It stands on the 魚町 waterfront road, and its front faces **south over the innermost inner bay**: 「南に気仙沼湾の最奥部を望む」.
  In the layout, the lot's frontage is the south side (`front.rotY` 0.187), and the model faces it.

## Structure and dimensions

- 木筋コンクリート造, **3 storeys**, 鉄板葺 (sheet-iron roof), built c. 1931 (昭和 6), registered 2003-01-31 (国登録有形文化財).
  Rebuilt in July 2020 (kesennuma-kanko.jp/otokoyama-new2020): the 1F is the brewery's shop, the 2F a hall and the 3F a
  gallery. Some of the 3F ceiling, light fittings and joinery are original.
- Facade (文化遺産オンライン; the 風待ち project report, photo ⑤): 洗い出し仕上 (washed-aggregate) walls in warm grey,
  moulded bands (蛇腹) at every floor, **four pilasters** rising into the parapet, **a balustrade** between them and a
  **central gable** carrying the brewery's name in gold, three tall windows per upper floor with dark frames, and the
  「男山本店」 board over the glazed timber shop front.
- Model height: 3.7 + 3.2 + 3.2 m storeys, roof slab at +10.1 m, parapet top at **+11.4 m**, gable peak at +12.6 m.

## Colours

| Surface | Value |
|---|---|
| Walls (洗い出し) | #bdb4a4 with fine light and dark aggregate |
| Bands, pilasters, balustrade | #d3cab9 |
| Window frames | #4f5b55 |
| Roof (GSI z18 photo) | #91acaa → #98b0b4 |
| Name board | gold #e8d49a on #3b3346 |

## In the app

- `explore/interiors.js buildOtokoyama`: the exterior above and the walk-in shop (the tasting counter, shelves of the
  brewery's own labels). Town leaves the lot out (`explore/taken.js`, `harbor/real.js KAZEMACHI_LOTS`).
- Layout: `storeys 3`, `height 11.4`, `landmark "kazemachi:otokoyama"` (build-layout.js through `harbor/real.js KAZEMACHI`).
- Walk spot: across the waterfront road, facing the front (`explore/places.js WALK_SET.otokoyama`).

## Sources

- 文化遺産オンライン, 男山本店店舗: https://online.bunka.go.jp/heritages/detail/138818
- 気仙沼観光 (kesennuma-kanko.jp), 男山本店 新店舗: https://kesennuma-kanko.jp/otokoyama-new2020/
- the 風待ち project report on the rebuilt historic buildings (jsurp.jp, 2023): the map of the eight
  rebuilt buildings and photo ⑤.
- OpenStreetMap way 966913931 (© OpenStreetMap contributors, ODbL); the GSI z18 aerial photo (data/ortho/core.jpg).
