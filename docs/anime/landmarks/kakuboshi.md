# 角星店舗 (魚町): the 1929 shop of the 角星 sake brewery

## Position

| Item | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **角星店舗** | 38.90635, 141.57387 | (−98.1, −39.4) | GSI lot `16/58540/25068/295`: a trapezoid of 8.8 × 10.8 m (95 m²); the record gives 99 m² | GSI, 文化遺産オンライン 179266 |
| Address | 気仙沼市魚町 2-1-17 (kesennuma-kanko; the heritage record lists 2-1-9) | — | — | kesennuma-kanko.jp |

- It stands on the 魚町 waterfront road one block west of 男山本店, as the 風待ち project map shows (① west-south-west of
  ⑤ across the cross street). The OSM node inside this footprint is named 角星園茶舗 (node 7653079722). No other
  footprint on the road fits the record's trapezoid of 99 m².
- The lot is a 不等辺四角形 (an irregular quadrilateral). The posts, beams, brackets (腕木) and tiles are set at angles so
  that the front faces the sea. In the layout, the frontage is the south side, facing the bay road.

## Structure and dimensions

- 木造 **2 storeys**, 切妻造 桟瓦葺 (a gabled roof of pantiles), built c. 1929 (昭和 4, after that year's fire). Registered
  2003-01-31; also designated by the city. **Rebuilt November 2016** on its original spot. The 1F is the shop; the 2F is an
  exhibition and community space.
- Photo ① (風待ち project report): 土蔵風 white plaster walls over a black base; a deep tiled pent roof (下屋) on brackets
  over a lit timber-lattice shop front; a black 2F front board carrying the brewery's name; the gable end is on the side,
  so the ridge runs along the street.
- Model: 1F 3.6 m, eaves +6.3 m, ridge +8.4 m (pitch 0.42).

## Colours

| Surface | Value |
|---|---|
| Plaster | #f1eee6 |
| Base, eave band, front board | #2a2626 |
| Tiles (GSI photo #838d8c) | #5f676c |
| Timber | #5a3d2a |
| Shop front at dusk | warm #ffcf8a |

## In the app

- `harbor/kazemachi.js buildKakuboshi` builds it on its real footprint, with colliders. The layout records `storeys 2`,
  `height 8.4` and `landmark "kazemachi:kakuboshi"`. Town leaves the lot out.
- Place 「角星店舗」 (explore/places.js), with a walk spot across the road facing the front.

## Sources

- 文化遺産オンライン, 角星店舗: https://online.bunka.go.jp/heritages/detail/179266
- 気仙沼観光, 角星店舗: https://kesennuma-kanko.jp/kazamachi_kakuboshi/
- 風待ち project report (jsurp.jp, 2023), map and photo ①; OSM node 7653079722; the GSI z18 aerial photo.
