# 気仙沼プラザホテル (柏崎 1-1): the hotel on the bluff over 港町

## Position

| Item | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **Tower and podium** | 38.90412, 141.57854 | (306.7, 209.1) | GSI lot `16/58541/25068/142`. The z18 roof shows a cross-shaped tower of about 30 × 12 and 12 × 28 m round (306, 212) | OSM way 761729140 (tourism=hotel), GSI |
| South wing | 38.90371, 141.57842 | (296.7, 253.9) | GSI lot `16/58541/25069/27`, the same building cut at the vector-tile edge z = 237.8 | GSI |
| Podium annex on the bluff | — | (287.2, 224.0) | `16/58541/25068/141` | GSI |
| Lift tower, lift hall, bridge | — | (287.8, 167.3), (289.3, 168.3), (290.4, 185.4) | `…/136` (6 × 7 m), `…/135`, `…/137` (25 × 3.7 m bridge) | GSI, the photo |

- The DEM gives the bluff top at T.P. 25.4 under the tower and 21.1 under the wing; the cliff foot on 港町 is at T.P. 2.3.
  GSI's outline reaches the cliff foot, so the derived ground was T.P. 4.0 and the building sank into the hill. Fixed in
  `src/anime/world/lotfix.js`.

## Structure and dimensions

- **65 rooms** (pkanyo.jp) and 3 room types (port view, mountain view, special). A lift links the hotel directly to the
  お魚いちば below (pkanyo.jp facility page: 「お魚いちばまで直結のエレベーター」).
- Photo (Wikimedia Commons "Kesennnuma plaza hotel 20130601.JPG", Opqr, 2013; reference only):
  - a stepped white tower of **7 storeys**: six window rows over the bridge level plus the entrance floor, with
    mauve-pink panels between the bays;
  - a brown-and-white crown with the red and blue roundel;
  - the **5-storey** south wing with the 「海とふれあい 気仙沼プラザホテル」 sign box on its roof;
  - the glass lift tower at the cliff foot, with a white head, the roundel, a lattice spire and the enclosed bridge.
- Model: storeys of 3.1 m, so the tower roof is at T.P. 46.9; the crown is 5.2 m. The wing's roof is at T.P. 37.0. The
  bridge deck is at T.P. 25.8, and the lift head at T.P. 31.3.

## In the app

- `harbor/plaza.js buildPlazaHotel`. The six footprints carry `landmark: 'plazaHotel'` (`lotfix.js`), so town, the mid
  builder and explore leave them.
- The layout records `kind: 'hotel'`, `storeys 7`, `height 26.9` and `groundY 25.2` (enrich/fold.js now maps
  tourism=hotel on blocks of 300 m² or more to the hotel kind).

## Sources

- https://www.pkanyo.jp/ (the rooms and facility pages)
- Wikimedia Commons, File:Kesennnuma plaza hotel 20130601.JPG (Opqr, CC BY-SA), used as a shape and colour reference only
- OpenStreetMap way 761729140 (© OpenStreetMap contributors); the GSI z18 photo and footprints; the GSI DEM
