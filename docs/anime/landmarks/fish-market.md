# 気仙沼市魚市場 (Kesennuma City Fish Market)

Reference sheet for v4 (V3-SPEC section 10). Researched 2026-09-30 by v4:landmark-research. Web photos were used only as
shape and colour references and are not in the repository. ENU follows `src/core/geo.js`: `x = (lon − 141.575)·86744`,
`z = −(lat − 38.906)·111014`.

## Position (cross-checked on the aerial photo)

The market is a chain of quay-side halls along the west shore of the bay, running NNW to SSE (long axis about 155° from
north). From north to south:

| Part | Centre lat, lon | ENU (x, z) | Footprint (OSM or aerial) | Source |
|---|---|---|---|---|
| North end: the market block with rooftop parking and the ramp, next to 海の市 | 38.90034, 141.58028 | (458, 629) | irregular, about 116 × 208 m including the ramp and the yard | OSM way 761720498 「気仙沼魚市場」 |
| North facility (北側施設, 1995), the long quay shed | 38.89884, 141.58186 | (595, 795) | 359 × 34 m | OSM way 105732020; the city says 延長 300 m |
| New C棟 (2019) | 38.89646, 141.58342 | (730, 1059) | 196 × 75 m, area 13,258 m² | OSM way 761258023; the market says 195 m |
| New D棟 (2019), with the rooftop solar panels | ≈38.89488, 141.58422 | ≈(800, 1235) | about 135 × 70 m (aerial) | aerial photo; the market says 135 m |

- The DEM gives the quay apron at about T.P. 1.3 to 1.8 m.
- The app's `SPOTS.fishMarket` (596, 777) lies on the north facility, 18 m from its OSM centroid. That is correct for the tour stop.

## Dimensions and structure

- **North facility (北側施設).** Completed March 1995. The city history gives 延長 300 m; the OSM outline is 359 m. It is a
  long quay shed with a flat concrete roof.
  - **The roof is a car park** (気仙沼市魚市場屋上駐車場). The aerial photo shows parking bays, parked cars, a row of small
    grey pyramid roof-lights, and a curved ramp up from the landside road at the north end.
  - The quay-side face is an open unloading apron under the building (荷捌場), with roll shutters.
  - Its height is about 2 storeys: the ground-floor apron plus a 2F observation level.
  - South 施設 A棟 (June 2007, 上屋 124 m) and B棟 (April 2009, 上屋 99 m) were rebuilt after 2011. In today's layout they
    form the southern part of this long shed; the separate outlines are not distinguishable on the aerial photo.
- **C棟 and D棟 (高度衛生管理型, operating since April 2019).** C棟 is 195 m and D棟 135 m long. The total project cost was
  18.12 billion yen, including the purification plant. Both are closed, temperature-controlled halls.
  - IC-card access and electric forklifts only.
  - C棟 has a **2F public observation deck** (国内最大級の見学デッキ), and the rooftop (3F level) is open for viewing.
  - C棟 also houses the 水産情報等発信施設 and a cooking studio.
  - Height: 2 storeys plus a rooftop, about 14 to 16 m (estimated from the 2F deck and the 3F roof).
  - D棟's roof carries the **250 kW photovoltaic array** (Panasonic HIT). It is the solar-panel roof on the aerial photo.
  - Full-colour LED floodlights (Dynapainter2) light the building at night and can be seen from the bay cruise.

## Materials and colours

The hex values are medians of the GSI aerial photo, which has a cyan cast; the neutral value is given after the arrow.

| Surface | Aerial median | Use |
|---|---|---|
| North facility roof deck (parking concrete) | #bcd1cd | → #c3c6c2 light concrete, with white parking lines |
| C棟 roof | #e3ebed | → #e8eae8 white membrane / metal |
| D棟 roof | #dfebef, with dark blue-black PV rows | → #e6e8e6 plus PV #2b3444 |
| Walls | — | white or very light grey metal panels, #e9ebe8 (photo references) |
| Quay | — | weathered concrete #b8b6ad, black rubber fenders, yellow edge line |

## Signage

The operator's name is 気仙沼市魚市場 (the market site uses the slogan 「海と生きる」). The bay-side face of C棟 carries
large lettering; confirm its exact text before building. The pair 「気仙沼市魚市場」 plus 「海と生きる」 is safe.

## Distinctive details

- Rows of big fishing boats moored bow-in or alongside, with belt conveyors.
- Roll-shutter bays and blue plastic fish tubs (タンク).
- The ramp to the roof car park at the north end.
- Pyramid roof-lights on the parking deck.
- The PV rows on D棟.
- 一景島神社 and its tree grove, 70 m west of C棟 (see `shrines-temples.md`).
- Night: coloured LED floodlights.

## Current state (2026)

All four parts are in service. The 2019 C and D halls replaced the temporary post-2011 canopies. The ortho (about
2020–2022) already shows C and D complete.

## Sources

- https://kesennuma-uoichiba.jp/fishmarket/history/ (the history: 北側施設 1995, 延長 300 m; A棟 2007 上屋 124 m; B棟 2009 上屋 99 m; C棟 195 m and D棟 135 m, April 2019)
- https://www2.panasonic.biz/jp/solution/store/works/kesennuma-fishMarket.html (completed December 2018, operating April 2019, 250 kW PV, LED floodlights)
- https://4travel.jp/dm_shisetsu/11296910 and https://www.miyagi-kankou.or.jp/kyouiku/taiken/tk3/734 (the 2F deck and the rooftop view)
- http://search.ipos-land.jp/p/detailp.aspx?id=K0000208Z (気仙沼市魚市場屋上駐車場)
- OSM ways 105732020, 761258023 and 761720498 (© OpenStreetMap contributors, ODbL); GSI seamlessphoto z17/z18
- Ortho crops: `ortho/market_all.jpg`, `ortho/market_north.jpg`, `ortho/market_south.jpg`

## What the app renders (see AUDIT.md)

- `app/market_north.jpg`, `app/market_top.jpg`, `app/market_c_oblique.jpg`, `app/market_d.jpg`
- The four generated white gable halls with skylights stand on the north facility. C棟 and D棟 are generic town boxes.

## v5 fix round 2 (2026-10-01): the roof deck and the land side, against Google Earth (imagery 2026-03-11)

- **Roof deck of the north facility:** Earth shows about 25 cars on the whole deck (review2 c11d / c11e pairs). The app
  parks 6 % of the bays (`parkCars(..., 0.06)` in `harbor/market4.js`; it was 62 %, packed) in the Japanese colour mix
  (`town/carcolors.js`: 45 % white or pearl, 20 % black, 15 % silver, 10 % grey, 10 % dark blue or red).
- **Green walkway stripe** along the land side of the deck, 3 m wide and 2 m in from the parapet, with white edge lines
  (#6f9a7f); no car stands on it.
- **Land side** (review2 walk/w_12 showed a 300 m plain white wall over an empty plain): a 1.1 m dock plinth along the
  land-facing walls with loading-dock shutters every 8.5 m and black rubber bumpers, painted truck bays 12 m long, 4 t
  trucks backed onto about one bay in five, and 「気仙沼市魚市場」 lettered on the 2F band every 110 m. The bays and trucks
  stop where the ramp to the north roof runs along the wall, and nothing is drawn on the party wall with the north block.
- Still open: the inland strip is beige in the land cover where Earth shows asphalt (an `apron` surface in
  `data/anime/overrides/c11.json`, for the accuracy pass).

## v5 photos (2026-10-01): C棟's roof deck from the author's photos (IMG_0792-0798, 17:07 JST)

The photos were taken on C棟's roof deck: GPS z ≈ 1040 lies inside C棟, at 11 m altitude, looking over the parapet to the
bay. `harbor/market5.js` (`buildCRoofPhotos`) replaces the v4 equipment boxes there with:

- weathered concrete slabs with saw-cut joints, yellow stall lines and red-and-white cones;
- the pale-blue penthouse with stepped panel joints, small framed windows, raised white letters
  「気仙沼市魚市場」, the visitors' entrance with its canopy and rails, and a low white roof with a rounded eave;
- the COOKING STUDIO cross block at the south end;
- five glazed observation pavilions with wave-shaped roofs and the white rocket-like stacks with stays;
- the orange enclosed lifeboat on its trailer, and cars parked nose-in.
