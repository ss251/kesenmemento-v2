# Hospitals in and near the core

## 気仙沼市立病院 (Kesennuma City Hospital), the new hospital since 2017

| Item | Value | Source |
|---|---|---|
| Position | 38.88743, 141.56617 → ENU **(−766, 2062)**; DEM T.P. 18.6 m | OSM way 761241989 |
| Address | 赤岩杉ノ沢8-2 | hospital site |
| Footprint (OSM) | 103.9 × 145.4 m bounding box, 7,883 m² (official building area **8,174 m²**) | OSM; hospital |
| Floors | legally **7F + B1**, of which **6 storeys** above ground are built as floors | hospital |
| Structure | steel-reinforced concrete (SRC) with **seismic isolation**, parts RC and S | hospital |
| Total floor area | 28,944 m²; site 52,248 m² | hospital |
| Beds | 340 | hospital; 復興庁 |
| Opened | moved here **2017-10-29** from 田中 | 復興庁; hospital history |
| Heliport | a new heliport for disaster medicine | search summary of 復興庁 and hospital pages; the exact location is not verified |
| BRT | the 気仙沼市立病院 BRT station stands at the hospital (OSM node 7117374801) | OSM |

- Roof on the ortho: #c5d4d2 → light grey #c7c9c6, with rooftop plant.
- Walls: white/light grey panels; not verified from a photo.

## 大友病院 (Ōtomo Hospital)

| Item | Value | Source |
|---|---|---|
| Position | 38.90593, 141.56710 → ENU **(−687, 13)**; DEM T.P. 7.3 m | OSM way 761402305 (building=hospital, levels 5) |
| Footprint | irregular, 54 × 60 m bounding box, 1,438 m² | OSM |
| Height | **5 storeys** | OSM |
| Roofs (ortho) | distinctive **mint-green** flat roofs #9acdbe → #8fc4b0, plus a red-brown pitched wing | ortho `ortho/otomo.jpg` |

Next door is the 特別養護老人ホーム キングス・タウン (8 levels, OSM way 761402304), a tall block. It is the tallest
building in the 新町 area.

## 猪苗代病院 (Inawashiro Hospital)

At 38.90486, 141.57273, ENU (−197, 127), in 南町 near the inner bay (OSM node 5162610024). OSM also has a hospital
footprint (way 761699198) at 38.90491, 141.57268, on the 南町 共同化 block.

## The former 気仙沼市立病院 (田中184), demolished

- Built in 1964. The hospital moved out in 2017, and the buildings were **demolished from September 2022 to January 2024**.
- The site (38.89435, 141.56471 → (−892, 1293)) is now the **new city hall construction site** (see `city-hall.md`).
- The GSI footprints and the ortho in the repo still show the old hospital blocks.

## Sources

- https://www.kesennuma-hospital.jp/introduction/summary/ (structure, floors, areas, beds, address)
- https://www.reconstruction.go.jp/portal/chiiki/2017/20171101153510.html (the 2017 completion; disaster base hospital)
- https://kahoku.news/articles/20220901khn000033.html (demolition of the old hospital)
- OSM ways 761241989, 761402305, 761402304 and 761699198; nodes 5162610024 and 7117374801 (© OpenStreetMap contributors)
- Crops: `ortho/hospital.jpg`, `ortho/otomo.jpg`, `ortho/newcityhall.jpg`

## What the app renders

- `app/city_hospital.jpg`: far lot 16/58539/25072/122, **one 142.6 × 66.8 m box, 8 storeys, 26.4 m**. The real building
  is 6 storeys (about 25 to 28 m with the isolation pit and the roof plant), so the height is fine, but the plan is a
  single slab instead of the real multi-wing plan.
- `app/otomo.jpg`: lot 16/58539/25068/388, `public`, **4 storeys, 14 m**, with a **slate hip roof**. Real: 5 storeys
  with mint-green flat roofs.
- `app/new_cityhall_site.jpg`: the demolished hospital still stands in the app.
