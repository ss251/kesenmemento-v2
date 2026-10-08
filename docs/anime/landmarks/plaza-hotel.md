# 気仙沼プラザホテル (柏崎 1-1): the hotel on the bluff over 港町

## Position

| Item | lat, lon | ENU (x, z) | Footprint | Source |
|---|---|---|---|---|
| **Tower and podium** | 38.90412, 141.57854 | (306.7, 209.1) | GSI lot `16/58541/25068/142`. The z18 roof shows a cross-shaped tower of about 30 × 12 and 12 × 28 m round (306, 212) | OSM way 761729140 (tourism=hotel), GSI |
| South wing | 38.90371, 141.57842 | (296.7, 253.9) | GSI lot `16/58541/25069/27`, the same building cut at the vector-tile edge z = 237.8 | GSI |
| Podium annex on the bluff | — | (287.2, 224.0) | `16/58541/25068/141` | GSI |
| Lift tower, lift hall, bridge | — | (287.8, 167.3), (289.3, 168.3), (290.4, 185.4) | `…/136` (6 × 7 m), `…/135`, `…/137` (25 × 3.7 m, the axis and the width only) | GSI, IMG_0896 |

- The DEM gives the bluff top at T.P. 25.4 under the tower and 21.1 under the wing; the cliff foot on 港町 is at T.P. 2.3.
  GSI's outline reaches the cliff foot, so the derived ground was T.P. 4.0 and the building sank into the hill. Fixed in
  `src/anime/world/lotfix.js`.

## Structure and dimensions

- **65 rooms** (pkanyo.jp) and 3 room types (port view, mountain view, special). A lift links the hotel directly to the
  お魚いちば below (pkanyo.jp facility page: 「お魚いちばまで直結のエレベーター」).
- [v6:c7] **2026 references** (they supersede the 2013 photo below): the on-site photo IMG_0896 (2026-10-02 14:59, from
  (133, 69) on the 港町 quay road, heading 125°, 48 mm) and Wikimedia Commons "Cityscape of Kessennuma City, 2026"
  (2026-03-29, from the 安波山 lookout, 1,220 m away); the roof decks from Google Earth 3D (imagery 2026-03-11):
  - the tower is clad in **dusty salmon-pink tile** (sunlit slab bands #d9bcab / #d4bdb0, the shaded side #8a7a76), with a
    continuous projecting balcony slab with rounded ends at every floor over recessed window bands, and outdoor AC
    units on the corner balconies;
  - the **crown is about 10.5 m tall** (the Commons photo measures 11.5 m ±10 % above the roofline, IMG_0896 10–11 m)
    and about 9.4 m across its visible face, the same pink-beige as the tower, with a cream panel tapering down from
    the top and the hotel mark on two faces (the same mark as the lift head: see the bridge note below);
  - the wing is greige between its window ribbons with pink-mauve bands at the floor slabs (shade #947f7a);
  - the sign box on the wing roof is greige (#ababa1 in shade) and reads 「港ふれあい」 (pink) over 「気仙沼プラザホテル」
    (navy, プラザ pink), not 「海とふれあい」;
  - every roof deck is pale green (Earth #a5ada2 to #afb9ae, GSI #bed5cb), stepped down the bluff.
- Photo (Wikimedia Commons "Kesennnuma plaza hotel 20130601.JPG", Opqr, 2013; reference only), superseded where it
  differs:
  - a stepped tower of **7 storeys**: six window rows over the bridge level plus the entrance floor;
  - the **5-storey** south wing with the sign box on its roof;
  - the glass lift tower at the cliff foot, with a white head, the roundel, a lattice spire and the enclosed bridge.
- Model: storeys of 3.1 m, so the tower roof is at T.P. 46.9; the crown is 10.5 m (9.2 × 7.5 m), so its top is at
  T.P. 57.4, with the two masts on it. The tile is #d3b6a8 (room facade #d6b9ab), the crown #cdb0a3, the crown panels
  cream #e3dbcf, the roof decks #c2d4c9 (between GSI #bed5cb and Earth × 1.17 #c6d0c7), the wing #cbb8ab with
  #a3897f slab bands and a #a88e86 top floor, the sign box #cfcac0. The wing's roof is at T.P. 37.0. The bridge deck is
  at T.P. 25.8, and the lift head at T.P. 31.3.
- [plaza-bridge] **The enclosed bridge** (IMG_0896, 2026-10-02). The GSI footprint `…/137` is 25.2 × 3.7 m and is the
  axis and the width, not the length: its lift end stops on the hall, short of the glass shaft, and its bluff end
  stops in the air before the hotel. `plazaBridgeSpan` keeps the deck at T.P. 25.8 and extends the tube along that
  axis. The near end is the lift shaft, 0.3 m inside the white head. The far end is the first wall that exists at
  deck height — the podium of lot `…/142` (edge (296.7, 200.2)–(291.5, 207.6)), not the annex and not the lift hall,
  whose roof is only about T.P. 5.9. The whole cross-section (the 3.5 m roof) is carried to that wall and 0.3 m
  into it, so the late corner, where the axis meets the wall at about 43°, is within 0.5 m of the face and every
  end point is inside the lot. The mesh is about 37.8 m. The ends are open (side panes, no glass cap) and a white
  portal frame sits on the wall plane. IMG_0896 shows no pier under the span, so none is added. The walk collider
  and the side walls use the same length. The DEM along the axis never reaches T.P. 25.8; the wall is the stop,
  and the crest is only the fallback when no wall is met.
- [plaza-bridge] **The roundel** on the lift head and the crown (IMG_0896, both faces). A circle split by an S into
  two commas (a 巴): red (#c4383a) in the upper right, navy (#1a2f5e) in the lower left, a white ring, and a thin
  white S on the join. Texture `plaza-roundel`, 256². The earlier straight diagonal (red upper left, blue lower
  right) read as a soft-drink logo.
- [v6:c7] At the lift's foot, `buildUoichiSigns` draws the 気仙沼お魚いちば signs on the market's west front (the
  front IMG_0895 sees: 「お魚いちば」 with an orange 魚, the 2F balcony with its white rail and AC units, the
  「いらっしゃいませ」 fascia) and the white 気仙沼温泉 diamond pylon (teal border, orange lettering, IN panel) at about
  (282, 160), west of the lift tower.

## In the app

- `harbor/plaza.js buildPlazaHotel`. The six footprints carry `landmark: 'plazaHotel'` (`lotfix.js`), so town, the mid
  builder and explore leave them.
- The layout records `kind: 'hotel'`, `storeys 7`, `height 26.9` and `groundY 25.2` (enrich/fold.js now maps
  tourism=hotel on blocks of 300 m² or more to the hotel kind).

## Sources

- https://www.pkanyo.jp/ (the rooms and facility pages)
- Wikimedia Commons, File:Kesennnuma plaza hotel 20130601.JPG (Opqr, CC BY-SA), used as a shape and colour reference only
- Wikimedia Commons, File:Cityscape of Kessennuma City, 2026.jpg (2026-03-29), the crown height and the cladding,
  reference only
- On-site photos IMG_0895 and IMG_0896 (2026-10-02), reference only (not in git). The bridge and the roundel
  are checked against IMG_0896 in `shots/plaza-bridge/` (day, Japanese): the photo's camera is
  `?cam=133,3.48,69,125,8,40` (eye 1.6 m over the road, whose height there is T.P. 1.88; heading 125°; pitch 8°,
  because the lift-head roundel sits halfway down the photo and that mark, at T.P. 28.3, is an 8° look up from this
  eye; vertical field 40°, a 48 mm 4:3 frame).
- OpenStreetMap way 761729140 (© OpenStreetMap contributors); the GSI z18 photo and footprints; the GSI DEM
