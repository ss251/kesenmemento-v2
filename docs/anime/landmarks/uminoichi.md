# 気仙沼 海の市 / シャークミュージアム (Umi-no-Ichi and the Shark Museum)

## Position

| Point | lat, lon | ENU (x, z) | Source |
|---|---|---|---|
| Building centroid | 38.90011, 141.57958 | (397.8, 661.3) | OSM way 761720497, 「気仙沼 海の市/気仙沼シャークミュージアム」 |
| Shark Museum POI | 38.90010, 141.57922 | (366, 662) | OSM node 3666892545 |
| 海の子神社 (a small shrine at the building) | 38.90017, 141.57986 | (422, 648) | OSM node 7181952807 |

- Footprint: **85.1 × 44.6 m**, 3,252 m², long axis E–W (104°). The DEM gives T.P. 2.0 m.
- It stands directly **west of the fish market's north block** and its rooftop-parking ramp. Across the street to the
  south is the 南気仙沼 district.

## Structure and shape

- The signature is a **huge steep gable (A-frame) facade** on the west/street side.
  - It is clad in **red vertical board-and-batten**, with a tall triangular silhouette. The roof slopes come nearly to the
    ground-floor canopy line.
  - On the ortho this is the large triangular roof plane on the west half. The east half is lower flat roofs, with a
    **timber rooftop deck** (brown on the ortho).
- **2 storeys** (the ridge is about 18 to 20 m high, estimated from the photo).
  - 1F: seafood shops and restaurants (e.g. 大菊 海の市店, 横田屋本店 海の市店; OSM), an ice aquarium (氷の水族館).
  - 2F: the **Shark Museum** (renewed April 2024) and a tourist service centre.
  - An outside stair climbs to the 2F along the side. There is a concrete-columned entrance canopy.
- Next to it: the **氷の水族館** sign panel, and the market's landside rooftop-parking ramp.

## Colours

| Surface | Value |
|---|---|
| Gable cladding | **red #bb5954** (photo median on the lit face; in shade #9c3a33) |
| Roof slopes | grey metal; ortho #acbdb4 → **#a9aca7** |
| Rooftop deck | timber #a57b56 |
| Canopy and trim | white #f0efeb; dark grey steel canopy #4b4f55 |
| Sign panels | **white #f4f2ee on red**, with red text; the shark silhouette is white |

## Signage (from the photo)

- A big white vertical panel: **「気仙沼 海の市」**, 「シャークミュージアム」, 「SHARK MUSEUM」, with a shark silhouette.
- A second vertical panel: **「UMI ICHI」** in large red Latin letters on white.
- A small panel: 「氷の水族館」.

## Current state

Open. The Shark Museum reopened in April 2024 after a renewal.

## Sources

- https://kesennuma-kanko.jp/shark_museum/ ; https://www.uminoichi.com/ (1F shops, 2F Shark Museum and tourist centre; renewal in April 2024)
- Photo reference: Wikimedia Commons "Kesennuma uminoiti.jpg" (facade form, colours, signage)
- OSM way 761720497; nodes 3666892545, 7181952803, 7181952816 and 7181952807 (© OpenStreetMap contributors)
- GSI seamlessphoto z18. Crop: `ortho/uminoichi.jpg`

## In the app

- A red board-and-batten block on the OSM outline (0 m). Its ridge runs NE-SW corner to corner, so each corner reads as
  the photo's A-frame. It has a recessed shop floor, the three sign panels, and an east block with the timber roof deck and
  the footbridge to the market.
- Frame: `app-v4/uminoichi.jpg`.

## v5 (2026-10-01): the walk spot

- The tour stop's street-level spot moved from (381, 732) to **(311.7, 704), yaw −60, pitch 5** on the 魚市場前 road
  south-west of the block (`WALK_SET.uminoichi` in `explore/places.js`). The new 3-storey office of
  `overrides/c11.json#newLots/0` at (375, 713) and the 4-storey lots at (404, 716) / (406, 710) left only a 15 m slot
  onto the front from the old spot.
- Chosen with `tools/anime/debug/walkprobe.mjs` (renderer depth: 45 of 49 candidates clear) and checked by screenshot:
  the whole red A-frame with 「気仙沼 海の市 / シャークミュージアム」 and 「UMI ICHI」, nothing in between. The closer
  (350, 690) cut the A-frame at the frame's left edge.
