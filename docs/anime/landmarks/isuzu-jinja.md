# 五十鈴神社 (Isuzu Jinja), 神明崎

## Position

| Point | lat, lon | ENU (x, z) | Source |
|---|---|---|---|
| Main hall (社殿) | 38.90709, 141.57919 | (363.5, −121.0) | OSM node 2495986401; the GSI footprint lies on it |
| Summit of 神明崎 (DEM) | 38.90717, 141.57918 | (362, −130), T.P. **16.3 m** | core DEM |
| Main torii (at the road bend) | ≈38.90735, 141.57893 | ≈(340, −150), ground T.P. 5.9 m | the app's `SPOTS.isuzuTorii`; sources place it at 「東浜街道の急カーブ地点」 |
| 社務所 | 38.90681, 141.57901 | (348, −90) | OSM node 7653079720 |
| 猪狩神社 (precinct shrine) | 38.90647, 141.57901 | (348, −52) | OSM node 2495986403 |

The app's `SPOTS.isuzuShrine` (363, −126) is **5 m** from the OSM node.

## Structure and shape

- **Main hall.** A small **reinforced-concrete hall painted cream**. 4travel says 「コンクリートでできた小さな社」; the jalan
  and weblio write-ups describe it as cream-painted and probably RC because of the wind and salt spray. Inside: red
  carpet, white walls, a large 社号 plaque.
  - It is **not** a plain-wood 神明造 hall.
  - The roof form is not verified. On the ortho the hall sits under the tree canopy (the median around it is foliage,
    #769385), so its roof colour cannot be read.
- **Approach.** A 参道 runs south from the torii at the road bend onto the peninsula. The last part is a **quite steep
  stair** (「かなり急な階段」) up to the hall on the 16 m knoll.
- **Precinct shrines:**
  - 猪狩神社, with "elaborate carvings" and its own torii. It honours 猪狩新兵衛, who brought nori cultivation and salt
    making to the bay.
  - 龍神社, a stone shrine (石祠), a candidate for a shrine listed in the 延喜式 (927) (Wikipedia).
- **Grove.** Dense evergreen and broadleaf trees cover the knoll, including a **モクゲンジ (goldenrain tree) grove,
  designated a natural monument in 1975**.
- **History.** Founded in the Ōei era (1394–1427) near today's 気仙沼駅. Wikipedia says it moved to 神明崎 in the Enpō
  era (1673–1681); genbu.net says 明治中期. The two sources conflict, and this does not affect the model. The festival is on the 11th day of the 9th lunar month.

## Colours

- Hall walls cream #efe6cc; plaque dark wood #3b3530 with gold letters.
- Stair and lanterns: grey granite #b9b5aa.
- Torii: **not verified** (no usable photo found). The app's vermilion 明神鳥居 with a black 笠木 is a plausible default,
  but confirm it before calling it accurate.

## Signage

The plaque reads 五十鈴神社. A tourism board at the entrance says 神明崎.

## Current state

The shrine survived on the knoll. The 浮見堂 and walkway below were rebuilt in 2020. The seawalls round the peninsula
are new (post-2011).

## Sources

- https://ja.wikipedia.org/wiki/五十鈴神社_(気仙沼市) (history, 猪狩神社, 龍神社, モクゲンジ natural monument)
- https://4travel.jp/dm_shisetsu/11340236 (concrete hall, steep stairs, light-up)
- Search summaries of jalan and weblio: cream-painted RC hall; the torii at the sharp bend of 東浜街道; the 「海に向かう鳥居」
- https://genbu.net/data/mutu/isuzu_title.htm (「コンクリート造のような石造社」, precinct shrines)
- OSM nodes 2495986401, 2495986403 and 7653079720 (© OpenStreetMap contributors); core DEM. Crop: `ortho/shinmeizaki.jpg`

## What the app renders

- `app/isuzu_torii.jpg`, `app/shinmeizaki_top.jpg`
- A plain-wood 神明造 hall with a copper roof, 鰹木 and 千木, on a stone platform at (363, −126), 10 steps.
- A vermilion torii at (340.5, −150).
